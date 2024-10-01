import { Job } from './job.ts';
import { Jobster } from './jobster.ts';
import { MemoryStorage } from './storage/memory-storage.ts';

const jobster = new Jobster({ storage: new MemoryStorage() });

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
