import { Job } from './job.js';
import { Jobster } from './jobster.js';

async function main() {
  const jobster = new Jobster();
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

  while (true) {
    await new Promise((r) => {
      console.log('staying alive');
      setTimeout(r, 5000);
    });
  }
}

main();
