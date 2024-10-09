import { ExponentialBackoff } from './exponential-backoff.ts';
import { Job } from './job.ts';
import { type IStorage } from './storage.interface.ts';

export class MemoryStorage implements IStorage<void> {
  #jobs = new Map<string, Job>();
  #retryStrategy = new ExponentialBackoff();

  async initialize(opts?: any) {}

  async persist(job: Job) {
    this.#jobs.set(job.id, job);
  }

  async success(jobs: Job[]) {
    await this.#retryStrategy.onSuccess(jobs);
  }

  async fail(jobs: Job[]) {
    await this.#retryStrategy.onFailure(jobs);
  }

  async getNextJobs(jobName: string, batchSize: number) {
    const jobs = Array.from(this.#jobs.values())
      .filter((job) => job.name === jobName)
      .filter(
        (job) =>
          (job.status === 'pending' && job.nextRunAfter!.getTime() <= Date.now()) ||
          (job.status === 'running' && Date.now() - job.updatedAt.getTime() > 10000),
      )
      .sort((a, b) => a.nextRunAfter!.getTime() - b.nextRunAfter!.getTime());
    return jobs.slice(0, batchSize).map((job) => {
      job.status = 'running';
      job.updatedAt = new Date();
      return job;
    });
  }
}
