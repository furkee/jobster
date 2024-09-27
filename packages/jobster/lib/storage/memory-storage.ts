import { Job } from '@/job.js';

export class MemoryStorage {
  private pendingJobs = new Map();
  private succeededJobs = new Map();
  private failedJobs = new Map();

  constructor(readonly onJobAvailable: (jon: Job) => Promise<void>) {}

  async persist(job: Job) {
    this.pendingJobs.set(job.id, { job, savedAt: new Date(), retries: 0, status: 'created' });
    this.onJobAvailable(job);
  }
}
