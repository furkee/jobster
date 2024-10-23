import { Jobster } from "@jobster/core";
import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService, MetadataScanner } from "@nestjs/core";

import { JOBSTER_JOB_LISTENER } from "./on-jobster-job.decorator.js";

@Injectable()
export class ListenerDiscoveryService implements OnApplicationBootstrap {
  constructor(
    private readonly jobster: Jobster,
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
  ) {}

  onApplicationBootstrap() {
    const providers = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      if (!wrapper.instance || !wrapper.isDependencyTreeStatic()) {
        continue;
      }

      const instance = wrapper.instance;
      const prototype = Object.getPrototypeOf(instance);

      for (const methodName of this.metadataScanner.getAllMethodNames(prototype)) {
        if (Reflect.hasMetadata(JOBSTER_JOB_LISTENER, prototype[methodName])) {
          const jobName = Reflect.getMetadata(JOBSTER_JOB_LISTENER, prototype[methodName]);
          this.jobster.listen(jobName, instance[methodName].bind(instance));
        }
      }
    }
  }
}
