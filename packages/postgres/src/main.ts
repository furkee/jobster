import { Job, Jobster } from "@jobster/core";
import { MikroORM, PostgreSqlDriver } from "@mikro-orm/postgresql";
import pg from "pg";

import { MikroOrmExecutor } from "./executor/mikro-orm.executor.ts";
import { NodePgExecutor } from "./executor/node-pg.executor.ts";
import { PostgresStorage } from "./postgres-storage.ts";

let jobster: Jobster;

async function main() {
  const pool = new pg.Pool({ user: "dbadmin", password: "password", database: "jobster" });
  const orm = await MikroORM.init({
    user: "dbadmin",
    password: "password",
    dbName: "jobster",
    driver: PostgreSqlDriver,
    entities: [],
    validate: false,
    discovery: { warnWhenNoEntities: false },
  });
  const executor = new MikroOrmExecutor({ em: orm.em });
  const _executor = new NodePgExecutor({ pool });
  const storage = new PostgresStorage({ executor });
  jobster = new Jobster({
    storage,
    executor,
    jobConfig: {
      test: {
        batchSize: 100,
        maxWorkers: 20,
        minWorkers: 2,
      },
      batchTest: {
        batchSize: 1,
        minWorkers: 1,
        maxWorkers: 10,
      },
    },
  });
  await jobster.initialize();

  jobster.listen("test", async ([job]) => {
    console.log({ job });
    await new Promise((r) => setTimeout(r, 1000));
  });

  jobster.listen("batchTest", async (jobs) => {
    console.log({ jobLn: jobs.length });
    await new Promise((r) => setTimeout(r, 1000));
  });

  await jobster.start();

  while (jobster) {
    await executor.transaction(async (transaction) => {
      const jobs = new Array(Math.round(Math.random() * 50))
        .fill(null)
        .map(() => new Job({ name: "batchTest", payload: {} }));
      await jobster.queue([new Job({ name: "test", payload: { naber: "co" } }), ...jobs], transaction);
    });

    await new Promise((r) => setTimeout(r, 1000));
  }
}

Error.stackTraceLimit = Number.POSITIVE_INFINITY;

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

process.on("SIGINT", async () => {
  await jobster?.stop();
  // @ts-ignore
  jobster = undefined;
});

main();
