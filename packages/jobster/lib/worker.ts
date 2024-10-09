import { type EventEmitter2 } from 'eventemitter2';

import { type IExecutor } from './executor.interface.ts';
import { type Job } from './job.ts';
import { type JobsterEvent } from './jobster.ts';
import { type ILogger, Logger } from './logger.ts';
import { type IRetryStrategy } from './retry-strategy.interface.ts';
import { type IStorage } from './storage.interface.ts';

export type WorkerOptions<Transaction> = {
  batchSize: number;
  emitter: InstanceType<typeof EventEmitter2>;
  executor: IExecutor<Transaction>;
  jobName: string;
  jobsterEmitter: InstanceType<typeof EventEmitter2>;
  logger?: ILogger;
  pollFrequency: number;
  retryStrategy: IRetryStrategy;
  storage: IStorage<Transaction>;
};

export class Worker<Transaction> {
  #logger: ILogger;

  #batchSize: number;
  #emitter: InstanceType<typeof EventEmitter2>;
  #executor: IExecutor<Transaction>;
  #jobName: string;
  #jobsterEmitter: InstanceType<typeof EventEmitter2>;
  #pollFrequency: number;
  #retryStrategy: IRetryStrategy;
  #status: 'running' | 'idling' = 'idling';
  #storage: IStorage<any>;
  #timer: NodeJS.Timeout | undefined = undefined;

  constructor({
    batchSize,
    emitter,
    executor,
    jobName,
    jobsterEmitter,
    logger,
    pollFrequency,
    retryStrategy,
    storage,
  }: WorkerOptions<Transaction>) {
    this.#batchSize = batchSize;
    this.#emitter = emitter;
    this.#executor = executor;
    this.#jobName = jobName;
    this.#jobsterEmitter = jobsterEmitter;
    this.#logger = logger ?? new Logger(Worker.name);
    this.#pollFrequency = pollFrequency;
    this.#retryStrategy = retryStrategy;
    this.#storage = storage;
  }

  get status() {
    return this.#status;
  }

  async start() {
    if (this.#status === 'running') {
      this.#logger.warn('worker is already started');
      return;
    }

    this.#status = 'running';
    this.#logger.info('worker is running');

    while (this.#status === 'running') {
      let jobs: Job[] = [];

      await this.#executor.transaction(async (transaction) => {
        jobs = await this.#storage.getNextJobs(this.#jobName, this.#batchSize, transaction);
        this.#logger.debug('poll', jobs, this.#pollFrequency);

        if (jobs?.length) {
          this.#jobsterEmitter.emit('job.started' as JobsterEvent, jobs);
          try {
            if (!this.#emitter.hasListeners(jobs[0].name)) {
              throw new Error(
                `Job ${jobs[0].name} does not have any listeners. Current attempt will count as a failure.`,
              );
            }
            await this.#emitter.emitAsync(jobs[0].name, jobs);
            await this.#retryStrategy.onSuccess(jobs);
            await this.#storage.success(jobs, transaction);
            this.#jobsterEmitter.emit('job.succeeded' as JobsterEvent, jobs);
          } catch (e) {
            this.#logger.error(`failed processing job ${jobs[0].id}`, e);
            await this.#retryStrategy.onFailure(jobs);
            await this.#storage.fail(jobs, transaction);
            this.#jobsterEmitter.emit('job.failed' as JobsterEvent, jobs);
          }
        }
      });

      if (jobs.length) {
        this.#jobsterEmitter.emit('job.finished' as JobsterEvent, jobs);
      }

      await new Promise((r) => (this.#timer = setTimeout(r, this.#pollFrequency)));
    }
  }

  stop() {
    this.#status = 'idling';
    clearTimeout(this.#timer);
  }
}
