import { Jobster } from "@jobster/core";
import { Injectable, Logger } from "@nestjs/common";
import { DiscoveryService, MetadataScanner } from "@nestjs/core";

import { JOBSTER_JOB_LISTENER } from "./on-jobster-job.decorator";

@Injectable()
export class ListenerDiscoveryService {
  private readonly logger = new Logger(ListenerDiscoveryService.name);

  constructor(
    private readonly jobster: Jobster,
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
  ) {}

  discoverListeners() {
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
          this.logger.debug(`Registered ${wrapper.name}.${methodName} to listen "${jobName}"`);
        }
      }
    }
  }
}
