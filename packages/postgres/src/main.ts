import { Job, Jobster, type JobsterTypes } from "@jobster/core";

import pg from "pg";

import { PgExecutor } from "./pg-executor.ts";
import { PostgresStorage } from "./postgres-storage.ts";

async function main() {
  const pool = new pg.Pool({ user: "dbadmin", password: "password", database: "jobster" });
  const executor = new PgExecutor(pool);
  const storage = new PostgresStorage({ run: executor.run, getQueryPlaceholder: executor.getQueryPlaceholder });
  const jobster = new Jobster({
    storage,
    executor,
    jobConfig: {
      event: {
        batchSize: 100,
        maxWorkers: 20,
        minWorkers: 2,
      },
      "tournament.started": {
        batchSize: 1,
        minWorkers: 1,
        maxWorkers: 10,
      },
    },
  });
  (({}) as JobsterTypes).jobNames;
  await jobster.initialize();

  // jobster.listen('event', async (data: Record<string, unknown>) => {
  //   await new Promise((resolve, reject) => {
  //     console.log({ message: 'resolve', data });
  //     resolve(void 0);
  //   });
  // });

  jobster.listen("event", async (job) => {
    await new Promise((resolve, reject) => {
      console.log({ message: "reject", data: job });
      reject(new Error("failed"));
    });
  });

  await jobster.start();

  await executor.transaction(async (transaction) => {
    await jobster.queue(new Job({ name: "event", payload: { hello: "world" } }), transaction);
  });

  process.on("SIGINT", async () => {
    jobster.stop();
    await pool.end();
  });
}

Error.stackTraceLimit = Number.POSITIVE_INFINITY;

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

main();
