import { Job } from './job.ts';

export interface IStorage<Transaction> {
  initialize(transaction: Transaction): Promise<void>;

  persist(job: Job, transaction: Transaction): Promise<void>;

  getNextJobs(jobName: string, batchSize: number, transaction: Transaction): Promise<Job[]>;

  /** deletes the successful job, if the job data needs long term storage, handler needs to take care of that */
  success(jobs: Job[], transaction: Transaction): Promise<void>;

  fail(job: Job[], transaction: Transaction): Promise<void>;
}
