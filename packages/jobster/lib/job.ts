export type JobStatus = 'pending' | 'running' | 'success' | 'failure';

export type JobParams<Payload extends Record<string, unknown> = Record<string, unknown>> = {
  id?: string;
  name: string;
  payload: Payload;
  status?: JobStatus;
  retries?: number;
  lastRunAt?: Date;
  nextRunAfter?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export class Job<Payload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  name: string;
  payload: Payload;
  status: JobStatus;
  retries: number = 0;
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
  }: JobParams<Payload>) {
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

  success() {
    this.status = 'success';
    this.lastRunAt = new Date();
    this.createdAt = new Date();
    this.nextRunAfter = null;
  }

  fail() {
    this.retries += 1;
    this.lastRunAt = new Date();
    this.createdAt = new Date();

    if (this.retries >= 10) {
      this.status = 'failure';
    } else {
      this.status = 'pending';
      this.nextRunAfter = new Date(Date.now() + Math.pow(2, this.retries) * 5000);
    }
  }
}
