import { type Job } from './job.ts';

export interface IRetryStrategy {
  onSuccess(jobs: Job[]): void;
  onFailure(jobs: Job[]): void;
}
