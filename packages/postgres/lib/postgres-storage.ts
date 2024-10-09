import { type IExecutor, type ILogger, type IStorage, Job, Logger } from '@jobster/core';

export type PostgresStorageOptions<Transaction> = {
  run: IExecutor<Transaction>['run'];
  /**
   * Return the placeholder string based on the array index of the supplied values, eg
   *
   * SELECT * FROM SomeTable WHERE id = ? AND createdAt < ?
   *
   * Jobster will call this function twice for the above query, for the ID `?`, index will be 0 and ie node-postgres
   * would expect you to return $1 where as mikroorm expects a single `?` for each dynamic value.
   */
  getQueryPlaceholder(index: number): string;
  logger?: ILogger;
};

export class PostgresStorage<Transaction> implements IStorage<Transaction> {
  #logger: ILogger;

  #run: PostgresStorageOptions<Transaction>['run'];
  #getQueryPlaceholder: PostgresStorageOptions<Transaction>['getQueryPlaceholder'];

  constructor({ run, getQueryPlaceholder, logger }: PostgresStorageOptions<Transaction>) {
    this.#logger = logger ?? new Logger(PostgresStorage.name);
    this.#run = run;
    this.#getQueryPlaceholder = getQueryPlaceholder;
  }

  async initialize(transaction: Transaction): Promise<void> {
    await this.#run(
      /* sql */ `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'JobsterJobStatus') THEN
          CREATE TYPE "JobsterJobStatus" AS ENUM ('pending', 'running', 'success', 'failure');
        END IF;
      END $$;
      `,
      [],
      transaction,
    );
    await this.#run(
      /* sql */ `
      CREATE TABLE IF NOT EXISTS "JobsterJobs" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        status JobsterJobStatus NOT NULL DEFAULT 'pending',
        retries INTEGER NOT NULL DEFAULT 0,
        "lastRunAt" TIMESTAMP WITH TIME ZONE,
        "nextRunAfter" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      `,
      [],
      transaction,
    );
    this.#logger.debug('postgres storage initialized ');
  }

  async persist(job: Job, transaction: Transaction) {
    await this.#run(
      /* sql */ `
      INSERT INTO "JobsterJobs" (
        id,
        name,
        payload,
        status,
        retries,
        "lastRunAt",
        "nextRunAfter",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${this.#getQueryPlaceholder(0)},
        ${this.#getQueryPlaceholder(1)},
        ${this.#getQueryPlaceholder(2)},
        ${this.#getQueryPlaceholder(3)},
        ${this.#getQueryPlaceholder(4)},
        ${this.#getQueryPlaceholder(5)},
        ${this.#getQueryPlaceholder(6)},
        ${this.#getQueryPlaceholder(7)},
        ${this.#getQueryPlaceholder(8)}
      );
      `,
      [
        job.id,
        job.name,
        JSON.stringify(job.payload),
        job.status,
        job.retries,
        job.lastRunAt?.toISOString() || null,
        job.nextRunAfter?.toISOString() || null,
        job.createdAt.toISOString(),
        job.updatedAt.toISOString(),
      ],
      transaction,
    );
    this.#logger.debug(`Persisted job ${job.id}`);
  }

  async success(jobs: Job[], transaction: Transaction) {
    await this.#updateJobs(jobs, transaction);
  }

  async fail(jobs: Job[], transaction: Transaction) {
    await this.#updateJobs(jobs, transaction);
  }

  async #updateJobs(jobs: Job[], transaction: Transaction) {
    await this.#run(
      /* sql */ `
      UPDATE "JobsterJobs" AS j SET
        status = (v.status)::JobsterJobStatus,
        retries = (v.retries)::int,
        "lastRunAt" = (v."lastRunAt")::timestamp,
        "nextRunAfter" = (v."nextRunAfter")::timestamp,
        "updatedAt" = (v."updatedAt")::timestamp
      FROM (VALUES
          ${jobs
            .map(
              (job, i) =>
                `(${new Array(6)
                  .fill(null)
                  .map((_, j) => this.#getQueryPlaceholder(i * 6 + j))
                  .join(',')})`,
            )
            .join(',')}
      ) AS v(id, status, retries, "lastRunAt", "nextRunAfter", "updatedAt")
      WHERE j.id = (v.id)::uuid;
      `,
      jobs.flatMap((job) => [
        job.id,
        job.status,
        job.retries,
        job.lastRunAt?.toISOString() || null,
        job.nextRunAfter?.toISOString() || null,
        job.updatedAt.toISOString(),
      ]),
      transaction,
    );
  }

  async getNextJobs(jobName: string, batchSize: number, transaction: Transaction) {
    const rows = await this.#run(
      /* sql */ `
      UPDATE "JobsterJobs" SET
        status = 'running',
        "updatedAt" = NOW()
      WHERE id = (
        SELECT id FROM "JobsterJobs"
          WHERE
            name = ${this.#getQueryPlaceholder(0)} AND ((
              status = 'pending'
                AND "nextRunAfter" < NOW()
              ) OR (
              status = 'running'
                AND "updatedAt" < NOW() - INTERVAL '1 minutes'
            ))
          ORDER BY "createdAt" ASC
          LIMIT ${this.#getQueryPlaceholder(1)}
          FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
      `,
      [jobName, batchSize],
      transaction,
    );
    return rows;
  }
}
