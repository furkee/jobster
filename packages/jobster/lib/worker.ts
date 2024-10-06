import { type EventEmitter2 } from 'eventemitter2';

import { type IExecutor } from './executor.interface.ts';
import { ExponentialBackoff } from './exponential-backoff.ts';
import { type Job } from './job.ts';
import { type JobsterEvent } from './jobster.ts';
import { type IRetryStrategy } from './retry-strategy.interface.ts';
import { type IStorage } from './storage.interface.ts';

export type WorkerOptions<Transaction> = {
  storage: IStorage<Transaction>;
  executor: IExecutor<Transaction>;
  emitter: InstanceType<typeof EventEmitter2>;
  jobsterEmitter: InstanceType<typeof EventEmitter2>;
  retryStrategy?: IRetryStrategy;
  /** @default 1000 */
  pollFrequency?: number;
};

export class Worker<Transaction> {
  #timer: NodeJS.Timeout | undefined = undefined;
  #status: 'running' | 'idling' = 'idling';
  #pollFrequency: number;
  #executor: IExecutor<Transaction>;
  #retryStrategy: IRetryStrategy;
  #storage: IStorage<any>;
  #emitter: InstanceType<typeof EventEmitter2>;
  #jobsterEmitter: InstanceType<typeof EventEmitter2>;

  constructor({
    storage,
    emitter,
    jobsterEmitter,
    executor,
    pollFrequency = 1000,
    retryStrategy = new ExponentialBackoff(),
  }: WorkerOptions<Transaction>) {
    this.#storage = storage;
    this.#emitter = emitter;
    this.#jobsterEmitter = jobsterEmitter;
    this.#executor = executor;
    this.#pollFrequency = pollFrequency;
    this.#retryStrategy = retryStrategy;
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
      let job: Job | null = null;

      await this.#executor.transaction(async (transaction) => {
        job = await this.#storage.getNextJob(transaction);
        console.log('poll', job, this.#pollFrequency);

        if (job) {
          this.#jobsterEmitter.emit('job.started' as JobsterEvent, job);
          try {
            if (!this.#emitter.hasListeners(job.name)) {
              throw new Error(`Job ${job.id} does not have any listeners. Current attempt will count as a failure.`);
            }
            await this.#emitter.emitAsync(job.name, job);
            await this.#retryStrategy.onSuccess(job);
            await this.#storage.success(job, transaction);
            this.#jobsterEmitter.emit('job.succeeded' as JobsterEvent, job);
          } catch (e) {
            await this.#retryStrategy.onFailure(job);
            await this.#storage.fail(job, transaction);
            this.#jobsterEmitter.emit('job.failed' as JobsterEvent, job);
          }
        }
      });

      if (job) {
        this.#jobsterEmitter.emit('job.finished' as JobsterEvent, job);
      }

      await new Promise((r) => (this.#timer = setTimeout(r, this.#pollFrequency)));
    }
  }

  stop() {
    this.#status = 'idling';
    clearTimeout(this.#timer);
  }
}
