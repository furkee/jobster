import { Job } from '@/job.js';

export interface IStorage {
  persist(job: Job): Promise<void>;

  getNextJob(): Promise<Job | null>;

  success(job: Job): Promise<void>;

  fail(job: Job): Promise<void>;
}
