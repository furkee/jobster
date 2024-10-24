import { Job, Jobster, Logger } from "@jobster/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { EntityManager, PostgreSqlDriver } from "@mikro-orm/postgresql";
import { Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

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
      jobConfig: { test: {} },
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
