import { type Job } from './job.ts';

export interface IRetryStrategy {
  onFailure(jobs: Job[]): void;
}
