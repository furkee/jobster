import { Jobster } from "@jobster/core";
import {
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type Provider,
  type Type,
} from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";

import { ListenerDiscoveryService } from "./listener-discovery.service";

type JobsterProvider<T extends Type> = {
  useFactory: (transactionProvider: InstanceType<T>) => Jobster;
  inject: T[];
};

@Module({})
export class JobsterModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(private readonly jobster: Jobster) {}

  static async forRoot<T extends Type>(opts: JobsterProvider<T>) {
    const jobsterProvider: Provider = {
      provide: Jobster,
      useFactory: opts.useFactory,
      inject: opts.inject,
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
