import type { Job } from "./job.ts";

// TODO this interface should be mathmetical, job should not be a parameter
export interface IRetryStrategy {
  onFailure(jobs: Job[]): void;
}
