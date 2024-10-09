import { type Job } from './job.ts';

export interface IRetryStrategy {
  onSuccess(jobs: Job[]): void | Promise<void>;
  onFailure(jobs: Job[]): void | Promise<void>;
}
