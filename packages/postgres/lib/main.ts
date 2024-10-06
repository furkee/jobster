import { ExponentialBackoff, type IExecutor, Job, Jobster } from '@jobster/core';

import pg from 'pg';

import { PostgresStorage } from './postgres-storage.ts';

class PgExecutor implements IExecutor<pg.PoolClient> {
  readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  async transaction(callback: (client: pg.PoolClient) => any) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await callback(client);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async run(sql: string, params: any[], client: pg.PoolClient) {
    const data = await client.query(sql, params);
    return data.rows;
  }

  getQueryPlaceholder(index: number): string {
    return `$${index + 1}`;
  }
}

async function main() {
  const pool = new pg.Pool({ user: 'dbadmin', password: 'password', database: 'jobster' });
  const executor = new PgExecutor(pool);
  const storage = new PostgresStorage({ run: executor.run, getQueryPlaceholder: executor.getQueryPlaceholder });
  const jobster = new Jobster({
    storage,
    executor,
    workerOptions: { retryStrategy: new ExponentialBackoff({ baseTimeoutMs: 1000, maxRetries: 3 }) },
  });

  await jobster.start();

  // jobster.listen('event', async (data: Record<string, unknown>) => {
  //   await new Promise((resolve, reject) => {
  //     console.log({ message: 'resolve', data });
  //     resolve(void 0);
  //   });
  // });

  jobster.listen('event', async (job) => {
    await new Promise((resolve, reject) => {
      console.log({ message: 'reject', data: job });
      reject(new Error('failed'));
    });
  });

  await executor.transaction(async (transaction) => {
    await jobster.queue(new Job({ name: 'event', payload: { hello: 'world' } }), transaction);
  });

  process.on('SIGINT', async () => {
    jobster.stop();
    await pool.end();
  });
}

Error.stackTraceLimit = Infinity;

process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

main();
