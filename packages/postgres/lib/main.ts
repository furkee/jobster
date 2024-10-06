import { type ITransactionProvider, Job, Jobster } from '@jobster/core';
import pg from 'pg';

import { PostgresStorage } from './postgres-storage.ts';

class PgTransactionProvider implements ITransactionProvider<pg.PoolClient> {
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

  async run<QResult>(sql: string, client: pg.PoolClient): Promise<QResult> {
    // @ts-ignore
    return await client.query(sql);
  }
}

async function main() {
  const pool = new pg.Pool({ user: 'dbadmin', password: 'password', database: 'jobster' });
  const transactionProvider = new PgTransactionProvider(pool);
  const storage = new PostgresStorage({ run: transactionProvider.run.bind(transactionProvider) });
  const jobster = new Jobster({ storage, transactionProvider });

  await jobster.start();

  // jobster.listen('event', async (data: Record<string, unknown>) => {
  //   await new Promise((resolve, reject) => {
  //     console.log({ message: 'resolve', data });
  //     resolve(void 0);
  //   });
  // });

  jobster.listen('event', async (data: Record<string, unknown>) => {
    await new Promise((resolve, reject) => {
      console.log({ message: 'reject', data });
      reject(new Error('failed'));
    });
  });

  await transactionProvider.transaction(async (transaction) => {
    await jobster.queue(new Job('event', { hello: 'world' }), transaction);
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
