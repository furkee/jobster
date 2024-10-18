import { ExponentialBackoff, Job, type JobStatus, Jobster } from "@jobster/core";

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, suite, test } from "node:test";
import { type EntityManager, MikroORM, PostgreSqlDriver } from "@mikro-orm/postgresql";

import { MikroOrmExecutor, PostgresStorage } from "../src/index.ts";

suite("mikro-orm", { timeout: 5000 }, () => {
  let jobster: Jobster<EntityManager, "test" | "batchTest">;
  let orm: MikroORM;
  let executor: MikroOrmExecutor;

  before(async () => {
    orm = await MikroORM.init({
      user: "dbadmin",
      password: "password",
      dbName: "jobster",
      driver: PostgreSqlDriver,
      entities: [],
      validate: false,
      discovery: { warnWhenNoEntities: false },
    });
    executor = new MikroOrmExecutor({ em: orm.em });
    jobster = new Jobster({
      executor,
      storage: new PostgresStorage({ executor }),
      jobConfig: {
        test: { pollFrequency: 0, batchSize: 1, retryStrategy: new ExponentialBackoff({ maxRetries: 0 }) },
        batchTest: { pollFrequency: 0, batchSize: 50, retryStrategy: new ExponentialBackoff({ maxRetries: 0 }) },
      },
    });

    mock.method(jobster, "heartbeat", () => new Map());

    await jobster.initialize();
  });

  after(async () => {
    await orm.close();
  });

  beforeEach(async () => {
    await orm.em.execute('DELETE FROM "JobsterJobs"');
    await jobster.start();
  });

  afterEach(async () => {
    await jobster.stop();
  });

  test("does not persist job if the transaction fails", async () => {
    const job = new Job({ name: "test", payload: { hello: "world" } });

    await executor
      .transaction(async (transaction) => {
        await jobster.queue(job, transaction);
        throw new Error("fail the transaction");
      })
      .catch(() => {});

    const res = await orm.em.execute('SELECT * FROM "JobsterJobs"');

    assert.equal(res.length, 0);
  });

  test("success run", async () => {
    const job = new Job({ name: "test", payload: { hello: "world" } });

    jobster.listen(job.name, async ([resolvedJob]) => {
      assert.equal(resolvedJob.id, job.id);
    });

    await executor.transaction(async (transaction) => jobster.queue(job, transaction));

    await new Promise((r) => jobster.listenJobsterEvents("job.finished", r));

    const res = await orm.em.execute('SELECT * FROM "JobsterJobs" WHERE id = ?', [job.id]);

    assert.equal(res.length, 0);
  });

  test("failure via throw run", async () => {
    const job = new Job({ name: "test", payload: { hello: "world" } });

    jobster.listen(job.name, ([resolvedJob]) => {
      assert.equal(resolvedJob.id, job.id);
      throw new Error("fail");
    });

    await executor.transaction(async (transaction) => jobster.queue(job, transaction));

    await new Promise((r) => jobster.listenJobsterEvents("job.finished", r));

    const res = await orm.em.execute('SELECT * FROM "JobsterJobs" WHERE id = ?', [job.id]);
    const updatedJob = res[0] as Job;

    assert.equal(updatedJob.status, "failure" as JobStatus);
  });

  test("failure via returning job id run", async () => {
    const job = new Job({ name: "test", payload: { hello: "world" } });

    jobster.listen(job.name, ([resolvedJob]) => {
      assert.equal(resolvedJob.id, job.id);
      return Promise.resolve({ failedJobIds: [resolvedJob.id] });
    });

    await executor.transaction(async (transaction) => jobster.queue(job, transaction));

    await new Promise((r) => jobster.listenJobsterEvents("job.finished", r));

    const res = await orm.em.execute('SELECT * FROM "JobsterJobs" WHERE id = ?', [job.id]);
    const updatedJob = res[0] as Job;

    assert.equal(updatedJob.status, "failure" as JobStatus);
  });

  test("partial success for batch jobs", async () => {
    const jobs = new Array(50).fill(null).map((_, index) => new Job({ name: "batchTest", payload: { index } }));
    const failedJobs = new Set(jobs.slice(0, 25).map((j) => j.id));

    jobster.listen(jobs[0].name, (triggeredJobs) => {
      assert.equal(triggeredJobs.length, jobs.length);
      return Promise.resolve({ failedJobIds: Array.from(failedJobs) });
    });

    await executor.transaction((transaction) => jobster.queue(jobs, transaction));

    await new Promise((r) => jobster.listenJobsterEvents("job.finished", r));

    const res = await orm.em.execute(
      `SELECT * FROM "JobsterJobs" WHERE id IN (${jobs.map((j) => `'${j.id}'`).join(",")});`,
      [],
    );
    const updatedJobs = res as Job[];

    assert.equal(updatedJobs.length, failedJobs.size);
    assert.equal(
      updatedJobs.every((j) => j.status === "failure"),
      true,
    );
  });
});
