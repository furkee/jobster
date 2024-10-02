import { Job, Jobster } from 'jobster';

import { PostgresStorage } from './postgres.storage.ts';

const jobster = new Jobster({ storage: new PostgresStorage() });

async function main() {
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

  await jobster.queue(new Job('event', { hello: 'world' }));

  jobster.start();
}

process.on('SIGINT', () => {
  jobster.stop();
  process.exit(0);
});

main();
