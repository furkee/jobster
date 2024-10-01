import { Job } from '../job.ts';
import { type IStorage } from './storage.interface.ts';

export class MemoryStorage implements IStorage {
  #jobs = new Map<string, Job>();

  async persist(job: Job) {
    this.#jobs.set(job.id, job);
  }

  async success(job: Job) {
    job.status = 'success';
    job.lastRunAt = new Date();
    job.createdAt = new Date();
    job.nextRunAfter = null;
  }

  async fail(job: Job) {
    job.retries += 1;
    job.lastRunAt = new Date();
    job.createdAt = new Date();

    if (job.retries >= 7) {
      job.status = 'failure';
    } else {
      job.status = 'pending';
      job.nextRunAfter = new Date(Date.now() + Math.pow(2, job.retries) * 1000);
    }
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
