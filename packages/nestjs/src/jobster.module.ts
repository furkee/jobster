import { Jobster, type JobsterOptions } from "@jobster/core";
import { MikroOrmExecutor, PostgresStorage } from "@jobster/postgres";
import { MikroORM } from "@mikro-orm/postgresql";
import {
  type DynamicModule,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type Provider,
} from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";

import { ListenerDiscoveryService } from "./listener-discovery.service.js";

@Module({})
export class JobsterModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(private readonly jobster: Jobster) {}

  static forRoot(opts: Omit<JobsterOptions, "executor" | "storage">): DynamicModule {
    const jobsterProvider: Provider = {
      provide: Jobster,
      useFactory: (orm: MikroORM) => {
        const executor = new MikroOrmExecutor({ em: orm.em });
        const storage = new PostgresStorage({ executor });
        return new Jobster({ ...opts, executor, storage });
      },
      inject: [MikroORM],
    };
    return {
      module: JobsterModule,
      global: true,
      imports: [DiscoveryModule],
      providers: [jobsterProvider, ListenerDiscoveryService],
      exports: [Jobster],
    };
  }

  async onApplicationBootstrap() {
    await this.jobster.initialize();
    await this.jobster.start();
  }

  async onApplicationShutdown(signal?: string) {
    await this.jobster.stop();
  }
}
