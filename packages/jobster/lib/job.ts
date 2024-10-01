export type JobStatus = 'pending' | 'running' | 'success' | 'failure';

export class Job<T extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  payload: T;
  readonly id = crypto.randomUUID();
  status: JobStatus = 'pending';
  retries: number = 0;
  lastRunAt: Date | null = null;
  nextRunAfter: Date | null = new Date();
  createdAt = new Date();
  updatedAt = new Date();

  constructor(name: string, payload: T) {
    this.name = name;
    this.payload = payload;
  }
}
