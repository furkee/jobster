import { Job } from './job.ts';

export interface IStorage<Transaction> {
  initialize(transaction: Transaction): Promise<void>;

  persist(job: Job, transaction: Transaction): Promise<void>;

  getNextJobs(jobName: string, batchSize: number, transaction: Transaction): Promise<Job[]>;

  success(jobs: Job[], transaction: Transaction): Promise<void>;

  fail(job: Job[], transaction: Transaction): Promise<void>;
}
