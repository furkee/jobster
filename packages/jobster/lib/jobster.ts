import eventemitter from 'eventemitter2';

import { type IExecutor } from './executor.interface.ts';
import { ExponentialBackoff } from './exponential-backoff.ts';
import { Job } from './job.ts';
import { type ILogger, Logger } from './logger.ts';
import { type IRetryStrategy } from './retry-strategy.interface.ts';
import { type IStorage } from './storage.interface.ts';
import { Worker } from './worker.ts';

export type JobConfig = {
  /** @default 1 */
  minWorkers?: number;
  /** @default 20 */
  maxWorkers?: number;
  /**
   * how many jobs the worker should fetch per iteration. by default each worker will handle
   * a single job per iteration, to enable batch processing, increase the number.
   *
   * __NOTE__: batched jobs succeed or fail together.
   * TODO improve on this later and (maybe) allow handlers to signal the success/fail status per job
   * handler function should return a list of failed job IDs and worker should adjust the jobs based on that
   *
   * @default 1
   */
  batchSize?: number;
  /**
   * poll frequency of the worker in milliseconds
   * @default 1000
   */
  pollFrequency?: number;
  /**
   * @default {@link ExponentialBackoff}
   */
  retryStrategy?: IRetryStrategy;
  disabled?: boolean;
};

export type JobsterOptions<Transaction, JobNames extends string = string> = {
  storage: IStorage<Transaction>;
  executor: IExecutor<Transaction>;
  jobConfig: Record<JobNames, JobConfig>;
  logger?: ILogger;
};

export type JobsterEvent = 'job.started' | 'job.succeeded' | 'job.failed' | 'job.finished';

export class Jobster<Transaction, JobNames extends string = string> {
  #logger: ILogger;

  #jobEmitter = new eventemitter.EventEmitter2({ wildcard: false, ignoreErrors: false });
  /** event emitter that will let library users know about whats happening in jobsters, not actual job handling */
  #jobsterEmitter = new eventemitter.EventEmitter2({ wildcard: false, ignoreErrors: true });
  #workers: Map<JobNames, Worker<Transaction>[]>;
  #storage: IStorage<Transaction>;
  #executor: IExecutor<Transaction>;
  #jobConfig: JobsterOptions<Transaction, JobNames>['jobConfig'];

  constructor({ logger, storage, executor, jobConfig }: JobsterOptions<Transaction, JobNames>) {
    this.#logger = logger ?? new Logger(Jobster.name);
    this.#executor = executor;
    this.#storage = storage;
    this.#jobConfig = jobConfig;
    this.#workers = new Map(
      Object.keys(jobConfig).map((jobName) => {
        const {
          minWorkers = 1,
          pollFrequency = 1000,
          batchSize = 1,
          retryStrategy = new ExponentialBackoff(),
          disabled = false,
        } = jobConfig[jobName as JobNames];
        return [
          jobName as JobNames,
          disabled
            ? []
            : new Array(minWorkers).fill(null).map(
                () =>
                  new Worker({
                    batchSize,
                    emitter: this.#jobEmitter,
                    executor,
                    jobName,
                    jobsterEmitter: this.#jobsterEmitter,
                    logger,
                    pollFrequency,
                    retryStrategy,
                    storage,
                  }),
              ),
        ];
      }),
    );
  }

  async initializeDb() {
    await this.#executor.transaction((transaction) => this.#storage.initialize(transaction));
  }

  start() {
    this.#workers.forEach((workers) => workers.forEach((worker) => worker.start()));
    this.#logger.debug('jobster started');
  }

  stop() {
    this.#jobEmitter.removeAllListeners();
    this.#jobsterEmitter.removeAllListeners();
    this.#workers.forEach((workers) => workers.forEach((worker) => worker.stop()));
    this.#logger.debug('jobster stopped');
  }

  listen(jobName: JobNames, listener: (jobs: Job[]) => void | Promise<void>) {
    if (this.#jobEmitter.listeners('eventName').length) {
      throw new Error(`Job ${jobName} already has a listener`);
    }
    this.#jobEmitter.on(jobName, listener);
  }

  async queue(job: Job, transaction: Transaction) {
    await this.#storage.persist(job, transaction);
  }

  listenJobsterEvents(event: JobsterEvent, listener: (jobs: Job[]) => void) {
    this.#jobsterEmitter.on(event, listener);
  }
}
