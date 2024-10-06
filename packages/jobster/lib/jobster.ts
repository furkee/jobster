import eventemitter from 'eventemitter2';

import { type IExecutor } from './executor.interface.ts';
import { Job } from './job.ts';
import { type IStorage } from './storage.interface.ts';
import { Worker, type WorkerOptions } from './worker.ts';

export type JobsterOptions<Transaction> = {
  storage: IStorage<Transaction>;
  executor: IExecutor<Transaction>;
  /** @default 1 */
  numWorkers?: number;
  workerOptions?: Omit<WorkerOptions<Transaction>, 'storage' | 'executor' | 'emitter'>;
};

export class Jobster<Transaction> {
  #jobEmitter = new eventemitter.EventEmitter2();
  #workers: Worker<Transaction>[];
  #storage: IStorage<Transaction>;
  #executor: IExecutor<Transaction>;

  constructor({ storage, executor, numWorkers = 1, workerOptions = {} }: JobsterOptions<Transaction>) {
    this.#executor = executor;
    this.#storage = storage;
    this.#workers = new Array(numWorkers)
      .fill(0)
      .map(() => new Worker({ storage: this.#storage, emitter: this.#jobEmitter, executor, ...workerOptions }));
  }

  async start() {
    await this.#executor.transaction((transaction) => this.#storage.initialize(transaction));
    this.#workers.forEach((worker) => worker.start());
  }

  stop() {
    this.#workers.forEach((worker) => worker.stop());
  }

  listen(eventName: string, listener: (job: Job) => Promise<void>) {
    if (this.#jobEmitter.listeners('eventName').length) {
      throw new Error(`Job ${eventName} already has a listener`);
    }
    this.#jobEmitter.on(eventName, listener);
  }

  async queue(job: Job, transaction: Transaction) {
    await this.#storage.persist(job, transaction);
  }
}
