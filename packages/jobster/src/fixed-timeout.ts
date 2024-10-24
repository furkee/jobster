import type { Job } from "./entity/job.ts";
import type { IRetryStrategy } from "./interface/retry-strategy.interface.ts";

export type FixedTimeoutOptions = {
  /** @default 5000 */
  timeoutMs?: number;
  /** @default 5 */
  maxRetries?: number;
};

export class FixedTimeout implements IRetryStrategy {
  readonly timeoutMs: number;
  readonly maxRetries: number;

  constructor({ timeoutMs = 5000, maxRetries = 5 }: FixedTimeoutOptions = {}) {
    this.timeoutMs = timeoutMs;
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
        job.nextRunAfter = new Date(Date.now() + this.timeoutMs);
      }
    }
  }
}
