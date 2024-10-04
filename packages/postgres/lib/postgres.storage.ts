import { type IStorage, Job, type RawQueryRunner } from '@jobster/core';

export type PostgresStorageOptions<Transaction> = {
  run: RawQueryRunner<Transaction>;
};

const INIT_QUERY = /*sql*/ `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'JobsterJobStatus') THEN
    CREATE TYPE "JobsterJobStatus" AS ENUM ('pending', 'running', 'success', 'failure');
  END IF;
END $$;

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
`;

export class PostgresStorage<Transaction> implements IStorage<Transaction> {
  #options: PostgresStorageOptions<Transaction>;

  constructor(opts: PostgresStorageOptions<Transaction>) {
    this.#options = opts;
  }

  async initialize(transaction: Transaction): Promise<void> {
    await this.#options.run(INIT_QUERY, transaction);
  }

  async persist(job: Job, transaction: Transaction) {
    this.#options.run(`insert into`, transaction);
  }

  async success(job: Job, transaction: Transaction) {
    this.#options.run(`update set`, transaction);
  }

  async fail(job: Job, transaction: Transaction) {
    this.#options.run(`update set`, transaction);
  }

  async getNextJob() {
    return null;
  }
}
