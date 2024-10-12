import {
  type IExecutor,
  type ILogger,
  type IStorage,
  type Job,
  type JobsterJobListener,
  type JobsterTypes,
  type ListenerData,
  Logger,
} from '@jobster/core';

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

export class PostgresStorage<Transaction = JobsterTypes['transaction']> implements IStorage<Transaction> {
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
          CREATE TYPE "JobsterJobStatus" AS ENUM ('pending', 'running', 'failure');
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
    await this.#run(
      /* sql */ `
      CREATE TABLE IF NOT EXISTS "JobsterJobListeners" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payload JSONB NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      `,
      [],
      transaction,
    );
    const indexQuery = (idxName: string, idxCol: string) => /* sql */ `
      DO $$
      BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'  -- Replace with your schema name if different
            AND indexname = '${idxName}'
        ) THEN
            CREATE INDEX ${idxName} ON "JobsterJobs" ("${idxCol}");
        END IF;
      END $$;
    `;
    await Promise.all([
      this.#run(indexQuery('jobster_job_name_idx', 'name'), [], transaction),
      this.#run(indexQuery('jobster_job_status_idx', 'status'), [], transaction),
      this.#run(indexQuery('jobster_job_next_run_after_idx', 'nextRunAfter'), [], transaction),
      this.#run(indexQuery('jobster_job_created_at_idx', 'createdAt'), [], transaction),
      this.#run(indexQuery('jobster_job_updated_at_idx', 'updatedAt'), [], transaction),
    ]);
    this.#logger.debug('postgres storage initialized ');
  }

  async heartbeat(jobsterId: string, jobNames: string[], transaction: Transaction) {
    const payload = JSON.stringify({ jobNames } as JobsterJobListener['payload']);
    const [activeListeners, availableJobs] = await Promise.all([
      // collect active listener data
      this.#run(
        /* sql*/ `
        SELECT * FROM "JobsterJobListeners" WHERE id != ${this.#getQueryPlaceholder(0)} AND "updatedAt" > NOW() - INTERVAL '1 minutes';
      `,
        [jobsterId],
        transaction,
      ) as Promise<JobsterJobListener[]>,
      // collect available number of jobs per jobName
      this.#run(
        /* sql */ `
        SELECT name, COUNT(*) as count FROM "JobsterJobs"
          WHERE (
            status = 'pending'
              AND "nextRunAfter" < NOW()
            ) OR (
            status = 'running'
              AND "updatedAt" < NOW() - INTERVAL '1 minutes'
          )
          GROUP BY name
      `,
        [],
        transaction,
      ) as Promise<{ name: string; count: number }[]>,
      // insert current jobster into jobster listeners table
      this.#run(
        /* sql */ `
        INSERT INTO "JobsterJobListeners" (id, payload)
          VALUES (${this.#getQueryPlaceholder(0)}, ${this.#getQueryPlaceholder(1)})
        ON CONFLICT (id)
          DO UPDATE SET payload = ${this.#getQueryPlaceholder(2)}, "updatedAt" = ${this.#getQueryPlaceholder(3)}
      `,
        [jobsterId, payload, payload, new Date().toISOString()],
        transaction,
      ),
      // cleanup inactive jobster listeners
      this.#run(
        /* sql */ `DELETE FROM "JobsterJobListeners" where "updatedAt" < NOW() - INTERVAL '5 minutes'`,
        [],
        transaction,
      ),
    ]);

    const listenerData = new Map<string, ListenerData>();
    const jobData = new Map(availableJobs.map((j) => [j.name, j.count]));

    for (const listener of activeListeners) {
      for (const job of listener.payload.jobNames) {
        const cur = listenerData.get(job);
        listenerData.set(job, {
          numberOfListeners: (cur?.numberOfListeners ?? 0) + 1,
          numberOfPendingJobs: jobData.get(job) ?? 0,
        });
      }
    }

    return listenerData;
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
    await this.#run(
      /* sql */ `DELETE FROM "JobsterJobs" WHERE id IN (${jobs.map((_, i) => `${this.#getQueryPlaceholder(i)}`).join(',')})`,
      jobs.map((job) => job.id),
      transaction,
    );
  }

  async fail(jobs: Job[], transaction: Transaction) {
    if (!jobs.length) {
      return;
    }

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
      WHERE id IN (
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
