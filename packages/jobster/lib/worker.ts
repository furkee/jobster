import { type EventEmitter2 } from 'eventemitter2';

import { type IStorage } from './storage/storage.interface.ts';
import { type ITransactionProvider } from './transaction-provider.interface.ts';

export type WorkerOptions<Transaction> = {
  storage: IStorage<Transaction>;
  transactionProvider: ITransactionProvider<Transaction>;
  emitter: InstanceType<typeof EventEmitter2>;
  /** @default 1000 */
  pollFrequency?: number;
};

export class Worker<Transaction> {
  #timer: NodeJS.Timeout | undefined = undefined;
  #status: 'running' | 'idling' = 'idling';
  #pollFrequency = 5000;
  #transactionProvider: ITransactionProvider<Transaction>;
  #storage: IStorage<any>;
  #emitter: InstanceType<typeof EventEmitter2>;

  constructor({ storage, emitter, transactionProvider, pollFrequency = 1000 }: WorkerOptions<Transaction>) {
    this.#storage = storage;
    this.#emitter = emitter;
    this.#transactionProvider = transactionProvider;
    this.#pollFrequency = pollFrequency;
  }

  get status() {
    return this.#status;
  }

  async start() {
    if (this.#status === 'running') {
      return;
    }

    this.#status = 'running';

    while (this.#status === 'running') {
      const start = Date.now();

      await this.#transactionProvider.transaction(async (transaction) => {
        const job = await this.#storage.getNextJob(transaction);

        if (job) {
          try {
            await this.#emitter.emitAsync(job.name, job.payload);
            await this.#storage.success(job, transaction);
          } catch (e) {
            await this.#storage.fail(job, transaction);
          }
        }
      });

      const runtime = Date.now() - start;
      const sleep = runtime > this.#pollFrequency ? 500 : this.#pollFrequency - runtime;

      await new Promise((r) => (this.#timer = setTimeout(r, sleep)));
    }
  }

  stop() {
    this.#status = 'idling';
    clearTimeout(this.#timer);
  }
}
