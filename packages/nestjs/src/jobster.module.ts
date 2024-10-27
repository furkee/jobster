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
  /** @default true */
  global?: boolean;
  useFactory: (transactionProvider: InstanceType<T>) => Jobster;
  inject: T[];
};

@Module({})
export class JobsterModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    private readonly jobster: Jobster,
    private readonly discovery: ListenerDiscoveryService,
  ) {}

  static async forRoot<T extends Type>(opts: JobsterProvider<T>) {
    const jobsterProvider: Provider = {
      provide: Jobster,
      useFactory: opts.useFactory,
      inject: opts.inject,
    };
    return {
      module: JobsterModule,
      global: opts.global ?? true,
      imports: [DiscoveryModule],
      providers: [jobsterProvider, ListenerDiscoveryService],
      exports: [Jobster],
    };
  }

  async onApplicationBootstrap() {
    await this.jobster.initialize();
    this.discovery.discoverListeners();
    await this.jobster.start();
  }

  async onApplicationShutdown(signal?: string) {
    await this.jobster.stop();
  }
}
