import type { EventEmitter2 } from "eventemitter2";

import type { Job } from "./entity/job.ts";
import type { IExecutor } from "./interface/executor.interface.ts";
import type { JobsterTypes } from "./interface/jobster-types.interface.ts";
import type { IRetryStrategy } from "./interface/retry-strategy.interface.ts";
import type { IStorage } from "./interface/storage.interface.ts";
import type { JobHandler, JobsterEvent } from "./jobster.ts";
import { partition } from "./util/array.ts";
import { type ILogger, Logger } from "./util/logger.ts";

export type WorkerOptions<Transaction = JobsterTypes["transaction"], JobNames = JobsterTypes["jobNames"]> = {
  batchSize: number;
  emitter: InstanceType<typeof EventEmitter2>;
  executor: IExecutor<Transaction>;
  jobName: JobNames;
  jobsterEmitter: InstanceType<typeof EventEmitter2>;
  logger?: ILogger;
  pollFrequency: number;
  retryStrategy: IRetryStrategy;
  storage: IStorage<Transaction>;
};

export class Worker<Transaction = JobsterTypes["transaction"], JobNames extends string = JobsterTypes["jobNames"]> {
  #logger: ILogger;

  #batchSize: number;
  #emitter: InstanceType<typeof EventEmitter2>;
  #executor: IExecutor<Transaction>;
  #jobName: JobNames;
  #jobsterEmitter: InstanceType<typeof EventEmitter2>;
  #pollFrequency: number;
  #retryStrategy: IRetryStrategy;
  #status: "running" | "idling" = "idling";
  #storage: IStorage<Transaction, JobNames>;
  #timer: NodeJS.Timeout | undefined = undefined;
  #promises = new Set<Promise<void>>();

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
  }: WorkerOptions<Transaction, JobNames>) {
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

  async #execute() {
    const start = performance.now();
    let jobs: Job[] = [];

    await this.#executor.transaction(async (transaction) => {
      jobs = await this.#storage.getNextJobs(this.#jobName, this.#batchSize, transaction);

      if (jobs.length) {
        this.#jobsterEmitter.emit("job.started" as JobsterEvent, jobs);
        try {
          if (!this.#emitter.hasListeners(jobs[0].name)) {
            throw new Error(
              `job ${jobs[0].name} does not have any listeners. current attempt will count as a failure.`,
            );
          }

          const [res]: Awaited<ReturnType<JobHandler>>[] = await this.#emitter.emitAsync(jobs[0].name, jobs);
          const failedJobSet = new Set(res ? res.failedJobIds : null);
          const [failedJobs, succeededJobs] = partition(jobs, (job) => failedJobSet.has(job.id));

          if (failedJobs.length) {
            this.#retryStrategy.onFailure(failedJobs);
          }

          await Promise.all([
            succeededJobs.length ? this.#storage.success(succeededJobs, transaction) : null,
            failedJobs.length ? this.#storage.fail(failedJobs, transaction) : null,
          ]);
        } catch (e) {
          this.#logger.error(`failed processing job ${jobs[0].id}`, e);
          await this.#retryStrategy.onFailure(jobs);
          await this.#storage.fail(jobs, transaction);
        }
      }
    });

    if (jobs.length) {
      this.#jobsterEmitter.emit("job.finished" as JobsterEvent, jobs);
      this.#logger.debug(`worker ran in ${performance.now() - start} ms for ${jobs.length} jobs`);
    }
  }

  async start() {
    if (this.#status === "running") {
      this.#logger.warn("worker is already started");
      return;
    }

    this.#status = "running";

    while (this.#status === "running") {
      // do not await so polling frequency is respected
      const promise = this.#execute().finally(() => this.#promises.delete(promise));
      this.#promises.add(promise);
      await new Promise((r) => {
        this.#timer = setTimeout(r, this.#pollFrequency);
      });
    }
  }

  async stop() {
    this.#status = "idling";
    clearTimeout(this.#timer);

    await Promise.allSettled(Array.from(this.#promises));
  }
}
