import eventemitter from 'eventemitter2';

import { Job } from './job.ts';
import { type IStorage } from './storage/storage.interface.ts';
import { type ITransactionProvider } from './transaction-provider.interface.ts';
import { Worker, type WorkerOptions } from './worker.ts';

export type JobsterOptions<Transaction> = {
  storage: IStorage<Transaction>;
  transactionProvider: ITransactionProvider<Transaction>;
  /** @default 1 */
  numWorkers?: number;
  workerOptions?: Omit<WorkerOptions<Transaction>, 'storage' | 'transactionProvider' | 'emitter'>;
};

export class Jobster<Transaction> {
  #jobEmitter = new eventemitter.EventEmitter2();
  #workers: Worker<Transaction>[];
  #storage: IStorage<Transaction>;
  #transactionProvider: ITransactionProvider<Transaction>;

  constructor({ storage, transactionProvider, numWorkers = 1, workerOptions = {} }: JobsterOptions<Transaction>) {
    this.#transactionProvider = transactionProvider;
    this.#storage = storage;
    this.#workers = new Array(numWorkers)
      .fill(0)
      .map(
        () => new Worker({ storage: this.#storage, transactionProvider, emitter: this.#jobEmitter, ...workerOptions }),
      );
  }

  async start() {
    await this.#transactionProvider.transaction((transaction) => this.#storage.initialize(transaction));
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
