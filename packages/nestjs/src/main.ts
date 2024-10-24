import { FixedTimeout, Job, Jobster } from "@jobster/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { EntityManager, PostgreSqlDriver } from "@mikro-orm/postgresql";
import { Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { MikroOrmExecutor, PostgresStorage } from "@jobster/postgres";
import { JobsterModule } from "./jobster.module";
import { OnJobsterJob } from "./on-jobster-job.decorator";

@Injectable()
class JobService implements OnModuleInit {
  constructor(
    private readonly jobster: Jobster,
    private readonly em: EntityManager,
  ) {}

  @OnJobsterJob("test")
  async onTestJob(jobs: Job[]) {
    console.log(jobs);
    await new Promise((_, reject) => setTimeout(() => reject("job failed"), 500));
  }

  async onModuleInit() {
    await this.jobster.queue(new Job({ name: "test", payload: { hello: "world" } }), this.em);
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
            test: { retryStrategy: new FixedTimeout({ maxRetries: 3, timeoutMs: 2500 }) },
          },
        });
      },
    }),
  ],
  providers: [JobService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  await app.init();
}

bootstrap();
