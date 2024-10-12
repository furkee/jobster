import type { JobsterTypes } from './@types/jobster-types.js';

export type JobStatus = 'pending' | 'running' | 'success' | 'failure';

export type JobParams<
  Payload extends Record<string, unknown> = Record<string, unknown>,
  JobNames extends string = JobsterTypes['jobNames'],
> = {
  id?: string;
  name: JobNames;
  payload: Payload;
  status?: JobStatus;
  retries?: number;
  lastRunAt?: Date;
  nextRunAfter?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export class Job<
  Payload extends Record<string, unknown> = Record<string, unknown>,
  JobNames extends string = JobsterTypes['jobNames'],
> {
  id: string;
  name: JobNames;
  payload: Payload;
  status: JobStatus;
  retries = 0;
  lastRunAt: Date | null;
  nextRunAfter: Date | null;
  createdAt: Date;
  updatedAt: Date;

  constructor({
    id,
    name,
    payload,
    status,
    retries,
    lastRunAt,
    nextRunAfter,
    createdAt,
    updatedAt,
  }: JobParams<Payload, JobNames>) {
    if (!name || !payload) {
      throw new Error('Cannot create a job without name or payload');
    }
    this.id = id || crypto.randomUUID();
    this.name = name;
    this.payload = payload;
    this.status = status || 'pending';
    this.retries = retries || 0;
    this.lastRunAt = lastRunAt || null;
    this.nextRunAfter = nextRunAfter || new Date();
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }
}
