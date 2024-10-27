import assert from "node:assert/strict";
import { type Mock, afterEach, beforeEach, describe, mock, test } from "node:test";
import { FixedTimeout, Job, Jobster } from "@jobster/core";
import { MikroOrmExecutor, PostgresStorage } from "@jobster/postgres";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { EntityManager, PostgreSqlDriver } from "@mikro-orm/postgresql";
import { type INestApplicationContext, Injectable, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { JobsterModule, OnJobsterJob } from "../src/index";

@Injectable()
class JobService {
  constructor(readonly jobster: Jobster) {}

  @OnJobsterJob("test")
  async onTestJob(jobs: Job[]) {
    console.log("original test handler called");
  }
}

@Module({
  imports: [
    MikroOrmModule.forRoot({
      user: "dbadmin",
      password: "password",
      dbName: "jobster",
      driver: PostgreSqlDriver,
      entities: [],
      validate: false,
      discovery: { warnWhenNoEntities: false },
    }),
    JobsterModule.forRoot({
      inject: [EntityManager],
      useFactory: (em) => {
        const executor = new MikroOrmExecutor({ em });
        const storage = new PostgresStorage({ executor });
        return new Jobster({
          executor,
          storage,
          jobConfig: {
            test: { pollFrequency: 50, retryStrategy: new FixedTimeout({ maxRetries: 0 }) },
          },
        });
      },
    }),
  ],
  providers: [JobService],
})
class AppModule {}

describe("nest js", { timeout: 500 }, () => {
  let app: INestApplicationContext;

  let jobsterStartSpy: Mock<Jobster["start"]>;

  let jobster: Jobster;
  let jobService: JobService;
  let em: EntityManager;

  beforeEach(async () => {
    jobsterStartSpy = mock.method(Jobster.prototype, "start");
    mock.method(Jobster.prototype, "heartbeat", () => new Map());

    app = await NestFactory.createApplicationContext(AppModule);
    await app.init();

    jobster = app.get(Jobster);
    jobService = app.get(JobService);
    em = app.get(EntityManager);
  });

  afterEach(async () => {
    await em.execute('DELETE FROM "JobsterJobs"');
    await app.close();
    mock.reset();
  });

  test("jobster is initialized and available through DI", async () => {
    assert.equal(jobsterStartSpy.mock.calls.length, 1);
    assert.ok(jobService.jobster);
  });

  test("on jobster job decorator works", async () => {
    const job = new Job({ name: "test", payload: { hello: "world" } });

    await Promise.all([new Promise((r) => jobster.listenJobsterEvents("job.finished", r)), jobster.queue(job, em)]);

    const updatedJob = await em.execute(`SELECT * FROM "JobsterJobs" WHERE id = ?`, [job.id]);

    assert.equal(updatedJob.length, 0);
  });
});
