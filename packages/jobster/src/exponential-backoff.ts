import type { Job } from "./entity/job.ts";
import type { IRetryStrategy } from "./interface/retry-strategy.interface.ts";

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

  onFailure(jobs: Job[]) {
    for (const job of jobs) {
      job.retries += 1;
      job.lastRunAt = new Date();
      job.createdAt = new Date();
      job.updatedAt = new Date();
      if (job.retries >= this.maxRetries + 1) {
        job.status = "failure";
        job.nextRunAfter = null;
      } else {
        job.status = "pending";
        job.nextRunAfter = new Date(Date.now() + 2 ** job.retries * this.baseTimeoutMs);
      }
    }
  }
}
