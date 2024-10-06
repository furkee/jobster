import { Job } from './job.ts';
import { type IStorage } from './storage.interface.ts';

export class MemoryStorage implements IStorage<void> {
  #jobs = new Map<string, Job>();

  async initialize(opts?: any) {}

  async persist(job: Job) {
    this.#jobs.set(job.id, job);
  }

  async success(job: Job) {
    job.success();
  }

  async fail(job: Job) {
    job.fail();
  }

  async getNextJob() {
    const jobs = Array.from(this.#jobs.values())
      .filter(
        (job) =>
          (job.status === 'pending' && job.nextRunAfter!.getTime() <= Date.now()) ||
          (job.status === 'running' && Date.now() - job.updatedAt.getTime() > 10000),
      )
      .sort((a, b) => a.nextRunAfter!.getTime() - b.nextRunAfter!.getTime());
    const job = jobs[0] || null;

    if (job) {
      job.status = 'running';
      job.updatedAt = new Date();
    }

    return job;
  }
}
