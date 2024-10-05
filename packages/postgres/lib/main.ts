import { type ITransactionProvider, Job, Jobster } from '@jobster/core';
import pg from 'pg';

import { PostgresStorage } from './postgres.storage.ts';

class PgTransactionProvider implements ITransactionProvider<pg.PoolClient> {
  readonly client: pg.PoolClient;

  constructor(client: pg.PoolClient) {
    this.client = client;
  }

  async transaction(callback: (client: pg.PoolClient) => any) {
    try {
      await this.client.query('BEGIN');
      await callback(this.client);
      await this.client.query('COMMIT');
    } catch (e) {
      await this.client.query('ROLLBACK');
      console.error(e);
    }
  }

  async run<QResult>(sql: string, client: pg.PoolClient): Promise<QResult> {
    // @ts-ignore
    return await client.query(sql);
  }
}

async function main() {
  const pool = new pg.Pool({ user: 'dbadmin', password: 'password', database: 'jobster' });
  const client = await pool.connect();
  const transactionProvider = new PgTransactionProvider(client);
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

  try {
    await client.query('BEGIN');
    await jobster.queue(new Job('event', { hello: 'world' }), client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
  }
}

main();
