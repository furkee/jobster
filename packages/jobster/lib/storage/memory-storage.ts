import { Job } from '@/job.js';

import { IStorage } from './storage.interface.js';

export class MemoryStorage implements IStorage {
  private jobs = new Map<string, Job>();

  async persist(job: Job) {
    this.jobs.set(job.id, job);
  }

  async success(job: Job) {
    job.succeed();
  }

  async fail(job: Job) {
    job.fail();
  }

  async getNextJob() {
    const jobs = Array.from(this.jobs.values())
      .filter((job) => job.status === 'created' && job.nextRunAfter!.getTime() <= Date.now())
      .sort((a, b) => a.nextRunAfter!.getTime() - b.nextRunAfter!.getTime());
    const job = jobs[0] || null;

    if (job) {
      job.status = 'running';
      // TODO set updatedAt and consider jobs running longer than 10 seconds as created
    }

    return job;
  }
}
