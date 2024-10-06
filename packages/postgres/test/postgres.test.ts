import { ExponentialBackoff, Job, type JobStatus, Jobster } from '@jobster/core';

import assert from 'node:assert/strict';
import { afterEach, beforeEach, suite, test } from 'node:test';
import pg from 'pg';

import { PgExecutor, PostgresStorage } from '../lib/index.ts';

suite('posgres', { timeout: 500 }, () => {
  let jobster: Jobster<pg.PoolClient>;
  let pool: pg.Pool;
  let executor: PgExecutor;
  let storage: PostgresStorage<pg.PoolClient>;

  beforeEach(async () => {
    pool = new pg.Pool({ user: 'dbadmin', password: 'password', database: 'jobster' });
    executor = new PgExecutor(pool);
    storage = new PostgresStorage({ run: executor.run, getQueryPlaceholder: executor.getQueryPlaceholder });
    jobster = new Jobster({
      storage,
      executor,
      workerOptions: { pollFrequency: 0, retryStrategy: new ExponentialBackoff({ baseTimeoutMs: 0, maxRetries: 1 }) },
    });

    await jobster.start();
  });

  afterEach(async () => {
    jobster.stop();
    await pool.query('DELETE FROM "JobsterJobs"');
    await pool.end();
  });

  test('success run', async () => {
    const job = new Job({ name: 'success', payload: { hello: 'world' } });

    jobster.listen(job.name, (resolvedJob) => {
      assert.equal(resolvedJob.id, job.id);
    });

    await executor.transaction(async (transaction) => jobster.queue(job, transaction));

    await new Promise((r) => jobster.listenJobsterEvents('job.finished', r));

    const res = await pool.query('SELECT * FROM "JobsterJobs" WHERE id = $1', [job.id]);
    const updatedJob = res.rows[0] as Job;

    assert.equal(updatedJob.status, 'success' as JobStatus);
  });

  test('failure run', async () => {
    const job = new Job({ name: 'failure', payload: { hello: 'world' } });

    jobster.listen(job.name, (resolvedJob) => {
      assert.equal(resolvedJob.id, job.id);
      throw new Error('fail');
    });

    await executor.transaction(async (transaction) => jobster.queue(job, transaction));

    await new Promise((r) => jobster.listenJobsterEvents('job.finished', r));

    const res = await pool.query('SELECT * FROM "JobsterJobs" WHERE id = $1', [job.id]);
    const updatedJob = res.rows[0] as Job;

    assert.equal(updatedJob.status, 'failure' as JobStatus);
  });
});
