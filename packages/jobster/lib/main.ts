import { Job } from './job.js';
import { Jobster } from './jobster.js';

const jobster = new Jobster();

async function main() {
  jobster.listen('event', async (data: Record<string, unknown>) => {
    await new Promise((resolve, reject) => {
      console.log({ message: 'resolve', data });
      resolve(void 0);
    });
  });

  // jobster.listen('event', async (data: Record<string, unknown>) => {
  //   await new Promise((resolve, reject) => {
  //     console.log({ message: 'reject', data });
  //     reject(new Error('failed'));
  //   });
  // });

  await jobster.queue(new Job('event', { hello: 'world' }));
}

process.on('SIGINT', () => {
  jobster.stop();
  process.exit(0);
});

main();
