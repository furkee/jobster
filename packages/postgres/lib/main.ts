import { Job, Jobster } from '@jobster/core';
import pg from 'pg';

import { PostgresStorage } from './postgres.storage.ts';

async function main() {
  const pool = new pg.Pool({ user: 'dbadmin', password: 'password', database: 'jobster' });
  const client = await pool.connect();

  const jobster = new Jobster({
    storage: new PostgresStorage<typeof client>({ run: async (sql, client) => client.query(sql) }),
  });

  // await jobster.start(client);

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
