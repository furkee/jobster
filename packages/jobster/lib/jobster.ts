import { EventEmitter } from './event-emitter.js';
import { Job } from './job.js';
import { MemoryStorage } from './storage/memory-storage.js';
import { Worker } from './worker.js';

export class Jobster {
  private jobEmitter = new EventEmitter();
  private storage = new MemoryStorage();
  private listeners = new Set();
  private workers: Worker[];

  constructor() {
    this.workers = [new Worker(this.storage, this.jobEmitter)];
    this.workers.forEach((worker) => worker.start());
  }

  stop() {
    this.workers.forEach((worker) => worker.stop());
    this.jobEmitter.removeAllListeners();
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
