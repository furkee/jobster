import { Job } from './job.ts';
import { Jobster } from './jobster.ts';
import { MemoryStorage } from './memory-storage.ts';
import { NoOpExecutor } from './no-op-executor.ts';

async function main() {
  const jobster = new Jobster<void>({
    storage: new MemoryStorage(),
    executor: new NoOpExecutor(),
  });

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

  await jobster.queue(new Job({ name: 'event', payload: { hello: 'world' } }));

  jobster.start();
}

main();
