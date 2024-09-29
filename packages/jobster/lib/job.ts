export type JobStatus = 'pending' | 'running' | 'success' | 'failure';

export class Job<T extends Record<string, unknown> = Record<string, unknown>> {
  readonly id = crypto.randomUUID();
  status: JobStatus = 'pending';
  retries: number = 0;
  lastRunAt: Date | null = null;
  nextRunAfter: Date | null = new Date();
  createdAt = new Date();
  updatedAt = new Date();

  constructor(
    readonly name: string,
    readonly payload: T,
  ) {
    this.name = name;
    this.payload = payload;
  }
}
