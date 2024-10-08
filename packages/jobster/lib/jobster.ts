import eventemitter from 'eventemitter2';

import { type IExecutor } from './executor.interface.ts';
import { Job } from './job.ts';
import { type ILogger, Logger } from './logger.ts';
import { type IStorage } from './storage.interface.ts';
import { Worker, type WorkerOptions } from './worker.ts';

export type JobsterOptions<Transaction> = {
  storage: IStorage<Transaction>;
  executor: IExecutor<Transaction>;
  /** @default 1 */
  numWorkers?: number;
  workerOptions?: Pick<WorkerOptions<Transaction>, 'pollFrequency' | 'retryStrategy'>;
  logger?: ILogger;
};

export type JobsterEvent = 'job.started' | 'job.succeeded' | 'job.failed' | 'job.finished';

export class Jobster<Transaction> {
  #logger: ILogger;

  #jobsterEmitter = new eventemitter.EventEmitter2();
  #jobEmitter = new eventemitter.EventEmitter2();
  #workers: Worker<Transaction>[];
  #storage: IStorage<Transaction>;
  #executor: IExecutor<Transaction>;

  constructor({ storage, executor, numWorkers = 1, workerOptions = {}, logger }: JobsterOptions<Transaction>) {
    this.#logger = logger ?? new Logger(Jobster.name);
    this.#executor = executor;
    this.#storage = storage;
    this.#workers = new Array(numWorkers).fill(0).map(
      () =>
        new Worker({
          ...workerOptions,
          storage: this.#storage,
          emitter: this.#jobEmitter,
          jobsterEmitter: this.#jobsterEmitter,
          executor,
          logger,
        }),
    );
  }

  async start() {
    await this.#executor.transaction((transaction) => this.#storage.initialize(transaction));
    this.#workers.forEach((worker) => worker.start());
    this.#logger.debug('jobster started');
  }

  stop() {
    this.#jobEmitter.removeAllListeners();
    this.#jobsterEmitter.removeAllListeners();
    this.#workers.forEach((worker) => worker.stop());
    this.#logger.debug('jobster stopped');
  }

  listen(eventName: string, listener: (job: Job) => void | Promise<void>) {
    if (this.#jobEmitter.listeners('eventName').length) {
      throw new Error(`Job ${eventName} already has a listener`);
    }
    this.#jobEmitter.on(eventName, listener);
  }

  async queue(job: Job, transaction: Transaction) {
    await this.#storage.persist(job, transaction);
  }

  listenJobsterEvents(event: JobsterEvent, listener: (job: Job) => void) {
    this.#jobsterEmitter.on(event, listener);
  }
}
