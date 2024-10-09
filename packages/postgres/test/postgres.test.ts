import { ExponentialBackoff, Job, type JobStatus, Jobster } from '@jobster/core';

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, suite, test } from 'node:test';
import pg from 'pg';

import { PgExecutor, PostgresStorage } from '../lib/index.ts';

suite('posgres', { timeout: 5000 }, () => {
  let jobster: Jobster<pg.PoolClient>;
  let pool: pg.Pool;
  let executor: PgExecutor;

  before(async () => {
    pool = new pg.Pool({ user: 'dbadmin', password: 'password', database: 'jobster' });
    executor = new PgExecutor(pool);
    jobster = new Jobster({
      executor,
      storage: new PostgresStorage({ run: executor.run, getQueryPlaceholder: executor.getQueryPlaceholder }),
      jobConfig: {
        test: {
          batchSize: 1,
          maxWorkers: 1,
          minWorkers: 1,
          pollFrequency: 0,
          retryStrategy: new ExponentialBackoff({ baseTimeoutMs: 0, maxRetries: 1 }),
        },
      },
    });

    await jobster.initializeDb();
  });

  after(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    jobster.start();
  });

  afterEach(async () => {
    jobster.stop();
    await pool.query('DELETE FROM "JobsterJobs"');
  });

  test('success run', async () => {
    const job = new Job({ name: 'test', payload: { hello: 'world' } });

    jobster.listen(job.name, ([resolvedJob]) => {
      assert.equal(resolvedJob.id, job.id);
    });

    await executor.transaction(async (transaction) => jobster.queue(job, transaction));

    await new Promise((r) => jobster.listenJobsterEvents('job.finished', r));

    const res = await pool.query('SELECT * FROM "JobsterJobs" WHERE id = $1', [job.id]);
    const updatedJob = res.rows[0] as Job;

    assert.equal(updatedJob.status, 'success' as JobStatus);
  });

  test('failure via throw run', async () => {
    const job = new Job({ name: 'test', payload: { hello: 'world' } });

    jobster.listen(job.name, ([resolvedJob]) => {
      assert.equal(resolvedJob.id, job.id);
      throw new Error('fail');
    });

    await executor.transaction(async (transaction) => jobster.queue(job, transaction));

    await new Promise((r) => jobster.listenJobsterEvents('job.finished', r));

    const res = await pool.query('SELECT * FROM "JobsterJobs" WHERE id = $1', [job.id]);
    const updatedJob = res.rows[0] as Job;

    assert.equal(updatedJob.status, 'failure' as JobStatus);
  });

  test('failure via returning job id run', async () => {
    const job = new Job({ name: 'test', payload: { hello: 'world' } });

    jobster.listen(job.name, ([resolvedJob]) => {
      assert.equal(resolvedJob.id, job.id);
      return Promise.resolve({ failedJobIds: [resolvedJob.id] });
    });

    await executor.transaction(async (transaction) => jobster.queue(job, transaction));
    jobster.start();

    await new Promise((r) => jobster.listenJobsterEvents('job.finished', r));

    const res = await pool.query('SELECT * FROM "JobsterJobs" WHERE id = $1', [job.id]);
    const updatedJob = res.rows[0] as Job;

    assert.equal(updatedJob.status, 'failure' as JobStatus);
  });
});
