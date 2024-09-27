import EventEmitter from 'eventemitter2';

import { Job } from './job.js';
import { MemoryStorage } from './storage/memory-storage.js';

export class Jobster {
  private jobEmitter = new EventEmitter();
  private storage = new MemoryStorage(this.onJobAvailable.bind(this));
  private listeners = new Set();

  constructor() {}

  private async onJobAvailable(job: Job) {
    try {
      await this.jobEmitter.emitAsync(job.name, job.payload);
      // storage should have success/fail that updates the job async
      job.succeed();
    } catch (e) {
      console.error(e);
      job.fail();
      const timeout = Math.max(1000, (job.nextRunAfter?.getTime() || 0) - Date.now());
      console.log(`Will retry the job ${job.name} with id ${job.id} in ${timeout} ms`);
      setTimeout(() => this.onJobAvailable(job), timeout);
    }
  }

  listen(eventName: string, listener: (dto: Record<string, unknown>) => Promise<void>) {
    if (this.listeners.has(eventName)) {
      throw new Error(`Job ${eventName} already has a listener`);
    }
    this.listeners.add(eventName);
    this.jobEmitter.on(eventName, listener);
  }

  async queue(job: Job) {
    await this.storage.persist(job);
  }
}
