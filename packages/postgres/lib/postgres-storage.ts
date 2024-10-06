import { type IExecutor, type IStorage, Job } from '@jobster/core';

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
};

export class PostgresStorage<Transaction> implements IStorage<Transaction> {
  #options: PostgresStorageOptions<Transaction>;

  constructor(opts: PostgresStorageOptions<Transaction>) {
    this.#options = opts;
  }

  async initialize(transaction: Transaction): Promise<void> {
    await this.#options.run(
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
    await this.#options.run(
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
  }

  async persist(job: Job, transaction: Transaction) {
    await this.#options.run(
      /* sql */ `
      INSERT INTO "JobsterJobs" (
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
        ${this.#options.getQueryPlaceholder(0)},
        ${this.#options.getQueryPlaceholder(1)},
        ${this.#options.getQueryPlaceholder(2)},
        ${this.#options.getQueryPlaceholder(3)},
        ${this.#options.getQueryPlaceholder(4)},
        ${this.#options.getQueryPlaceholder(5)},
        ${this.#options.getQueryPlaceholder(6)},
        ${this.#options.getQueryPlaceholder(7)}
      );
      `,
      [
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
  }

  async success(job: Job, transaction: Transaction) {
    await this.#updateJob(job, transaction);
  }

  async fail(job: Job, transaction: Transaction) {
    await this.#updateJob(job, transaction);
  }

  async #updateJob(job: Job, transaction: Transaction) {
    await this.#options.run(
      /* sql */ `
      UPDATE "JobsterJobs" SET
        status = ${this.#options.getQueryPlaceholder(0)},
        retries = ${this.#options.getQueryPlaceholder(1)},
        "lastRunAt" = ${this.#options.getQueryPlaceholder(2)},
        "nextRunAfter" = ${this.#options.getQueryPlaceholder(3)},
        "updatedAt" = ${this.#options.getQueryPlaceholder(4)}
      WHERE id = ${this.#options.getQueryPlaceholder(5)};
      `,
      [
        job.status,
        job.retries,
        job.lastRunAt?.toISOString() || null,
        job.nextRunAfter?.toISOString() || null,
        job.updatedAt.toISOString(),
        job.id,
      ],
      transaction,
    );
  }

  async getNextJob(transaction: Transaction) {
    const rows = await this.#options.run(
      /* sql */ `
      UPDATE "JobsterJobs" SET
        status = 'running',
        "updatedAt" = NOW()
      WHERE id = (
        SELECT id FROM "JobsterJobs"
          WHERE (
            status = 'pending'
              AND "nextRunAfter" < NOW()
              AND retries < 7
          ) OR (
            status = 'running'
              AND "updatedAt" < NOW() - INTERVAL '1 minutes'
          )
          ORDER BY "createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
      `,
      [],
      transaction,
    );

    if (rows && Array.isArray(rows) && rows.length === 1) {
      return new Job(rows[0]);
    }

    return null;
  }
}
