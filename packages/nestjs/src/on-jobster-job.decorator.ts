import type { JobsterTypes } from "@jobster/core";

export const JOBSTER_JOB_LISTENER = "JOBSTER_JOB_LISTENER";

export function OnJobsterJob(jobName: JobsterTypes["jobNames"]): MethodDecorator {
  return (target, property, descriptor) => {
    if (!descriptor.value) {
      throw new Error();
    }

    if (!Reflect.hasMetadata(JOBSTER_JOB_LISTENER, descriptor.value)) {
      Reflect.defineMetadata(JOBSTER_JOB_LISTENER, jobName, descriptor.value);
    }
  };
}
