import eventemitter from "eventemitter2";

import type { Job } from "./entity/job.ts";
import { ExponentialBackoff } from "./exponential-backoff.ts";
import type { IExecutor } from "./interface/executor.interface.ts";
import type { JobsterTypes } from "./interface/jobster-types.interface.ts";
import type { IRetryStrategy } from "./interface/retry-strategy.interface.ts";
import type { IStorage } from "./interface/storage.interface.ts";
import { times } from "./util/array.ts";
import { type ILogger, Logger } from "./util/logger.ts";
import { Worker } from "./worker.ts";

export type JobConfig = {
  /** @default 1 */
  minWorkers?: number;
  /** @default 20 */
  maxWorkers?: number;
  /**
   * how many jobs the worker should fetch per iteration. by default each worker will handle
   * a single job per iteration, to enable batch processing, increase the number.
   *
   * @default 1
   */
  batchSize?: number;
  /**
   * poll frequency of the worker in milliseconds.
   *
   * @default 1000
   */
  pollFrequency?: number;
  /**
   * @default {@link ExponentialBackoff}
   */
  retryStrategy?: IRetryStrategy;
  disabled?: boolean;
};

/**
 * if a handler rejects or throws, all the jobs within the batch will be regarded as failed.
 * if a handler returns a list of failed job IDs, those job IDs are marked as failed. this helps
 * with having partially succesful batch processing.
 */
export type JobHandler = (
  jobs: Job[],
) => void | Promise<void> | { failedJobIds: string[] } | Promise<{ failedJobIds: string[] }>;

export type JobsterOptions<
  Transaction = JobsterTypes["transaction"],
  JobNames extends string = JobsterTypes["jobNames"],
> = {
  storage: IStorage<Transaction>;
  executor: IExecutor<Transaction>;
  jobConfig: Record<JobNames, JobConfig>;
  /**
   * heartbeat frequency in ms. jobster also fetches active listeners data through the hearbeat
   * query and scales its workers based on number of available jobs and number of jobster instances
   * handling that job.
   *
   * @default 5000
   */
  heartbeatFrequency?: number;
  logger?: ILogger;
};

export type JobsterEvent = "job.started" | "job.finished" | "jobster.scale.up" | "jobster.scale.down";

export class Jobster<Transaction = JobsterTypes["transaction"], JobNames extends string = JobsterTypes["jobNames"]> {
  #logger: ILogger;

  #jobsterId = crypto.randomUUID();
  #jobEmitter = new eventemitter.EventEmitter2({ wildcard: false, ignoreErrors: false });
  /** event emitter that will let library users know about whats happening in jobsters, not actual job handling */
  #jobsterEmitter = new eventemitter.EventEmitter2({ wildcard: false, ignoreErrors: true });
  #workers: Map<JobNames, Worker<Transaction, JobNames>[]>;
  #storage: IStorage<Transaction>;
  #executor: IExecutor<Transaction>;
  #heartbeatFrequency: number;
  #heartbeatTimer: NodeJS.Timeout | undefined;
  #jobConfig: JobsterOptions<Transaction, JobNames>["jobConfig"];

  constructor({
    logger,
    storage,
    executor,
    jobConfig,
    heartbeatFrequency = 5000,
  }: JobsterOptions<Transaction, JobNames>) {
    this.#logger = logger ?? new Logger(Jobster.name);
    this.#executor = executor;
    this.#storage = storage;
    this.#jobConfig = jobConfig;
    this.#heartbeatFrequency = heartbeatFrequency;
    this.#workers = new Map(
      Object.keys(jobConfig).map((jobName) => {
        const { minWorkers = 1, disabled = false } = jobConfig[jobName as JobNames];
        return [
          jobName as JobNames,
          disabled
            ? []
            : times(minWorkers, () => this.#createWorker(jobName as JobNames, jobConfig[jobName as JobNames]!)),
        ];
      }),
    );
  }

  #createWorker<T extends JobNames>(jobName: T, jobConfig: JobsterOptions<Transaction, JobNames>["jobConfig"][T]) {
    const { pollFrequency = 1000, batchSize = 1, retryStrategy = new ExponentialBackoff() } = jobConfig;
    return new Worker({
      batchSize,
      emitter: this.#jobEmitter,
      executor: this.#executor,
      jobName,
      jobsterEmitter: this.#jobsterEmitter,
      logger: this.#logger instanceof Logger ? undefined : this.#logger,
      pollFrequency,
      retryStrategy,
      storage: this.#storage,
    });
  }

  async initialize(skipDb = false) {
    if (!skipDb) {
      await this.#executor.transaction((transaction) => this.#storage.initialize(transaction));
    }
  }

  async start() {
    await this.heartbeat();
    this.#heartbeatTimer = setInterval(() => this.heartbeat(), this.#heartbeatFrequency);

    for (const workers of this.#workers.values()) {
      for (const worker of workers) {
        worker.start();
      }
    }

    this.#logger.debug("jobster started");
  }

  async heartbeat() {
    const listenerData = await this.#executor.transaction((transaction) =>
      // TODO filter disabled jobs and also store the job config on DB to calculate ideal runner count
      this.#storage.heartbeat(this.#jobsterId, Object.keys(this.#jobConfig), transaction),
    );

    for (const [job, { numberOfListeners, numberOfPendingJobs }] of listenerData.entries()) {
      const workerConfig = this.#jobConfig[job as JobNames];

      if (!workerConfig || workerConfig.disabled) {
        continue;
      }

      let workers = this.#workers.get(job as JobNames);

      if (!workers) {
        workers = [];
        this.#workers.set(job as JobNames, workers);
      }

      const { minWorkers = 1, maxWorkers = 20, batchSize = 1 } = workerConfig;
      const numActiveWorkers = workers.length;
      const idealNumWorkers = Math.round(numberOfPendingJobs / (numberOfListeners * batchSize));
      let change = idealNumWorkers - numActiveWorkers;

      if (change > maxWorkers) {
        change = maxWorkers - numActiveWorkers;
      } else if (change < minWorkers) {
        change = minWorkers - numActiveWorkers;
      }

      this.#logger.debug(`scaling for job "${job}"`, {
        numberOfListeners,
        numberOfPendingJobs,
        numActiveWorkers,
        minWorkers,
        maxWorkers,
        idealNumWorkers,
        change,
      });

      if (change > 0) {
        const newWorkers = times(change, () => this.#createWorker(job as JobNames, workerConfig));
        workers.concat(newWorkers);

        for (const worker of newWorkers) {
          worker.start();
        }

        this.#jobsterEmitter.emit("jobster.scale.up" as JobsterEvent, { job, change, numWorkers: workers.length });
      } else if (change < 0) {
        const removed = workers.splice(0, Math.abs(change));

        await Promise.all(removed.map((worker) => worker.stop()));

        this.#jobsterEmitter.emit("jobster.scale.down" as JobsterEvent, { job, change, numWorkers: workers.length });
      }
    }
  }

  async stop() {
    clearInterval(this.#heartbeatTimer);

    await Promise.allSettled(
      Array.from(this.#workers.values())
        .flat()
        .map((worker) => worker.stop()),
    );

    this.#jobEmitter.removeAllListeners();
    this.#jobsterEmitter.removeAllListeners();

    this.#logger.debug("jobster stopped");
  }

  listen(jobName: JobNames, listener: JobHandler) {
    if (this.#jobEmitter.listeners(jobName).length) {
      throw new Error(`Job ${jobName} already has a listener`);
    }
    this.#jobEmitter.on(jobName, listener);
  }

  async queue(jobs: Job | Job[], transaction: Transaction) {
    await this.#storage.persist(Array.isArray(jobs) ? jobs : [jobs], transaction);
  }

  listenJobsterEvents(event: JobsterEvent, listener: (data: unknown) => void) {
    this.#jobsterEmitter.on(event, listener);
  }
}
