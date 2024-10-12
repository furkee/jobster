import type { Job } from "./job.ts";
import type { JobsterTypes } from "./jobster-types.interface.ts";

export type JobsterJobListener = {
  id: string;
  payload: {
    /** jobs listened by the jobster instance */
    jobNames: string[];
  };
  createdAt: Date;
  updatedAt: Date;
};

export type ListenerData = {
  numberOfListeners: number;
  numberOfPendingJobs: number;
};

export interface IStorage<
  Transaction = JobsterTypes["transaction"],
  JobNames extends string = JobsterTypes["jobNames"],
> {
  initialize(transaction: Transaction): Promise<void>;

  /** tell jobster you are still alive and get back number of listener per event */
  heartbeat(jobsterId: string, jobNames: string[], transaction: Transaction): Promise<Map<string, ListenerData>>;

  persist(job: Job, transaction: Transaction): Promise<void>;

  getNextJobs(jobName: JobNames, batchSize: number, transaction: Transaction): Promise<Job[]>;

  /** deletes the successful job, if the job data needs long term storage, handler needs to take care of that */
  success(jobs: Job[], transaction: Transaction): Promise<void>;

  fail(job: Job[], transaction: Transaction): Promise<void>;
}
