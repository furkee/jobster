import { Job } from '../job.ts';

export interface IStorage {
  persist(job: Job): Promise<void>;

  getNextJob(): Promise<Job | null>;

  success(job: Job): Promise<void>;

  fail(job: Job): Promise<void>;
}
