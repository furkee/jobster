import { type Job } from './job.ts';

export interface IRetryStrategy {
  onSuccess(job: Job): void | Promise<void>;
  onFailure(job: Job): void | Promise<void>;
}
