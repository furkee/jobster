import eventemitter from 'eventemitter2';

import { Job } from './job.ts';
import { type IStorage } from './storage/storage.interface.ts';
import { Worker, type WorkerOptions } from './worker.ts';

export type JobsterOptions<Transaction> = {
  storage: IStorage<Transaction>;
  /** @default 1000 */
  numWorkers?: number;
  workerOptions?: WorkerOptions;
};

export class Jobster<Transaction> {
  #jobEmitter = new eventemitter.EventEmitter2();
  #workers: Worker[];
  #storage: IStorage<Transaction>;

  constructor({ storage, numWorkers = 1, workerOptions }: JobsterOptions<Transaction>) {
    this.#storage = storage;
    this.#workers = new Array(numWorkers).fill(0).map(() => new Worker(this.#storage, this.#jobEmitter, workerOptions));
  }

  async start(transaction: Transaction) {
    await this.#storage.initialize(transaction);
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

  async queue(job: Job, transaction: Transaction) {
    await this.#storage.persist(job, transaction);
  }
}
