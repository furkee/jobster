import { type Job } from './job.ts';
import { type IRetryStrategy } from './retry-strategy.interface.ts';

export type ExponentialBackoffOptions = {
  /** @default 5000 */
  baseTimeoutMs?: number;
  /** @default 5 */
  maxRetries?: number;
};

export class ExponentialBackoff implements IRetryStrategy {
  readonly baseTimeoutMs: number;
  readonly maxRetries: number;

  constructor({ baseTimeoutMs = 5000, maxRetries = 5 }: ExponentialBackoffOptions = {}) {
    this.baseTimeoutMs = baseTimeoutMs;
    this.maxRetries = maxRetries;
  }

  onSuccess(job: Job) {
    job.status = 'success';
    job.lastRunAt = new Date();
    job.createdAt = new Date();
    job.nextRunAfter = null;
  }

  onFailure(job: Job) {
    job.retries += 1;
    job.lastRunAt = new Date();
    job.createdAt = new Date();

    if (job.retries >= this.maxRetries) {
      job.status = 'failure';
    } else {
      job.status = 'pending';
      job.nextRunAfter = new Date(Date.now() + Math.pow(2, job.retries) * this.baseTimeoutMs);
    }
  }
}
