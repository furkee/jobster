import { Job } from './job.ts';

export interface IStorage<Transaction> {
  initialize(transaction: Transaction): Promise<void>;

  persist(job: Job, transaction: Transaction): Promise<void>;

  getNextJob(transaction: Transaction): Promise<Job | null>;

  success(job: Job, transaction: Transaction): Promise<void>;

  fail(job: Job, transaction: Transaction): Promise<void>;
}
