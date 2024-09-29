import { EventEmitter } from './event-emitter.js';
import { Job } from './job.js';
import { IStorage } from './storage/storage.interface.js';
import { Worker, WorkerOptions } from './worker.js';

export type JobsterOptions = {
  storage: IStorage;
  /** @default 1000 */
  numWorkers?: number;
  workerOptions?: WorkerOptions;
};

export class Jobster {
  #jobEmitter = new EventEmitter();
  #workers: Worker[];
  #storage: IStorage;

  constructor({ storage, numWorkers = 1, workerOptions }: JobsterOptions) {
    this.#storage = storage;
    this.#workers = new Array(numWorkers).fill(0).map(() => new Worker(this.#storage, this.#jobEmitter, workerOptions));
  }

  start() {
    this.#workers.forEach((worker) => worker.start());
  }

  stop() {
    this.#workers.forEach((worker) => worker.stop());
  }

  listen(eventName: string, listener: (dto: Record<string, unknown>) => Promise<void>) {
    if (this.#jobEmitter.listeners('eventName').length) {
      throw new Error(`Job ${eventName} already has a listener`);
    }
    this.#jobEmitter.on(eventName, listener);
  }

  async queue(job: Job) {
    await this.#storage.persist(job);
  }
}
