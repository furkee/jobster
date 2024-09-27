export type JobStatus = 'created' | 'running' | 'success' | 'fail';

export class Job<T extends Record<string, unknown> = Record<string, unknown>> {
  readonly id = crypto.randomUUID();
  status: JobStatus = 'created';
  retries: number = 0;
  lastRunAt: Date | null = null;
  nextRunAfter: Date | null = new Date();

  constructor(
    readonly name: string,
    readonly payload: T,
  ) {
    this.name = name;
    this.payload = payload;
  }

  succeed() {
    this.status = 'success';
    this.lastRunAt = new Date();
    this.nextRunAfter = null;
  }

  fail() {
    this.status = 'fail';
    this.retries += 1;
    this.lastRunAt = new Date();
    this.nextRunAfter = new Date(Date.now() + Math.pow(2, this.retries) * 1000);
  }
}
