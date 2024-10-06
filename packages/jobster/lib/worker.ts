import { type EventEmitter2 } from 'eventemitter2';

import { type IExecutor } from './executor.interface.ts';
import { type IStorage } from './storage.interface.ts';

export type WorkerOptions<Transaction> = {
  storage: IStorage<Transaction>;
  executor: IExecutor<Transaction>;
  emitter: InstanceType<typeof EventEmitter2>;
  /** @default 1000 */
  pollFrequency?: number;
};

export class Worker<Transaction> {
  #timer: NodeJS.Timeout | undefined = undefined;
  #status: 'running' | 'idling' = 'idling';
  #pollFrequency: number;
  #executor: IExecutor<Transaction>;
  #storage: IStorage<any>;
  #emitter: InstanceType<typeof EventEmitter2>;

  constructor({ storage, emitter, executor, pollFrequency = 1000 }: WorkerOptions<Transaction>) {
    this.#storage = storage;
    this.#emitter = emitter;
    this.#executor = executor;
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

      await this.#executor.transaction(async (transaction) => {
        const job = await this.#storage.getNextJob(transaction);

        if (job) {
          try {
            if (!this.#emitter.hasListeners(job.name)) {
              throw new Error(`Job ${job.id} does not have any listeners. Current attempt will count as a failure.`);
            }
            await this.#emitter.emitAsync(job.name, job);
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
