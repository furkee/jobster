import {
  type IExecutor,
  type ILogger,
  type IStorage,
  Job,
  type JobParams,
  type JobsterJobListener,
  type JobsterTypes,
  type ListenerData,
  Logger,
} from "@jobster/core";

export type PostgresStorageOptions<Transaction> = {
  executor: IExecutor<Transaction>;
  logger?: ILogger;
};

export class PostgresStorage<Transaction = JobsterTypes["transaction"]> implements IStorage<Transaction> {
  #logger: ILogger;

  #executor: IExecutor<Transaction>;

  constructor({ executor, logger }: PostgresStorageOptions<Transaction>) {
    this.#logger = logger ?? new Logger(PostgresStorage.name);
    this.#executor = executor;
  }

  async initialize(transaction: Transaction): Promise<void> {
    await this.#executor.run(
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
    await this.#executor.run(
      /* sql */ `
      CREATE TABLE IF NOT EXISTS "JobsterJobs" (
        id UUID PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL,
        status "JobsterJobStatus" NOT NULL DEFAULT 'pending',
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
    await this.#executor.run(
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
            WHERE indexname = '${idxName}'
        ) THEN
            CREATE INDEX ${idxName} ON "JobsterJobs" ("${idxCol}");
        END IF;
      END $$;
    `;
    await Promise.all([
      this.#executor.run(indexQuery("jobster_job_name_idx", "name"), [], transaction),
      this.#executor.run(indexQuery("jobster_job_status_idx", "status"), [], transaction),
      this.#executor.run(indexQuery("jobster_job_next_run_after_idx", "nextRunAfter"), [], transaction),
      this.#executor.run(indexQuery("jobster_job_created_at_idx", "createdAt"), [], transaction),
      this.#executor.run(indexQuery("jobster_job_updated_at_idx", "updatedAt"), [], transaction),
    ]);
    this.#logger.debug("postgres storage initialized ");
  }

  async heartbeat(jobsterId: string, jobNames: string[], transaction: Transaction) {
    const payload = JSON.stringify({ jobNames } as JobsterJobListener["payload"]);
    const [activeListeners, availableJobs] = await Promise.all([
      // collect active listener data
      this.#executor.run(
        /* sql*/ `
        SELECT * FROM "JobsterJobListeners" WHERE id != ${this.#executor.getQueryPlaceholder(0)} AND "updatedAt" > NOW() - INTERVAL '1 minutes';
      `,
        [jobsterId],
        transaction,
      ) as Promise<JobsterJobListener[]>,
      // collect available number of jobs per jobName
      this.#executor.run(
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
      this.#executor.run(
        /* sql */ `
        INSERT INTO "JobsterJobListeners" (id, payload)
          VALUES (${this.#executor.getQueryPlaceholder(0)}, ${this.#executor.getQueryPlaceholder(1)})
        ON CONFLICT (id)
          DO UPDATE SET payload = ${this.#executor.getQueryPlaceholder(2)}, "updatedAt" = ${this.#executor.getQueryPlaceholder(3)}
      `,
        [jobsterId, payload, payload, new Date().toISOString()],
        transaction,
      ),
      // cleanup inactive jobster listeners
      this.#executor.run(
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

  async persist(jobs: Job[], transaction: Transaction) {
    if (!jobs.length) {
      return;
    }

    await this.#executor.run(
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
      VALUES ${jobs.map(
        (job, index) =>
          `(${new Array(9)
            .fill(null)
            .map((_, j) => this.#executor.getQueryPlaceholder(index * 9 + j))
            .join(",")})`,
      )};
      `,
      jobs.flatMap((job) => [
        job.id,
        job.name,
        JSON.stringify(job.payload),
        job.status,
        job.retries,
        job.lastRunAt?.toISOString() || null,
        job.nextRunAfter?.toISOString() || null,
        job.createdAt.toISOString(),
        job.updatedAt.toISOString(),
      ]),
      transaction,
    );
    this.#logger.debug(`Persisted ${jobs.length} jobs`);
  }

  async success(jobs: Job[], transaction: Transaction) {
    await this.#executor.run(
      /* sql */ `DELETE FROM "JobsterJobs" WHERE id IN (${jobs.map((_, i) => `${this.#executor.getQueryPlaceholder(i)}`).join(",")})`,
      jobs.map((job) => job.id),
      transaction,
    );
  }

  async fail(jobs: Job[], transaction: Transaction) {
    if (!jobs.length) {
      return;
    }

    await this.#executor.run(
      /* sql */ `
      UPDATE "JobsterJobs" AS j SET
        status = (v.status)::"JobsterJobStatus",
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
                  .map((_, j) => this.#executor.getQueryPlaceholder(i * 6 + j))
                  .join(",")})`,
            )
            .join(",")}
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
    const rows = await this.#executor.run(
      /* sql */ `
      UPDATE "JobsterJobs" SET
        status = 'running',
        "updatedAt" = NOW()
      WHERE id IN (
        SELECT id FROM "JobsterJobs"
          WHERE
            name = ${this.#executor.getQueryPlaceholder(0)} AND ((
              status = 'pending'
                AND "nextRunAfter" < NOW()
              ) OR (
              status = 'running'
                AND "updatedAt" < NOW() - INTERVAL '1 minutes'
            ))
          ORDER BY "createdAt" ASC
          LIMIT ${this.#executor.getQueryPlaceholder(1)}
          FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
      `,
      [jobName, batchSize],
      transaction,
    );
    return rows.map((row: JobParams<Record<string, unknown>, JobsterTypes["jobNames"]>) => new Job(row));
  }
}
