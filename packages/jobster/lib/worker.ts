import { EventEmitter } from './event-emitter.js';
import { IStorage } from './storage/storage.interface.js';

export type WorkerOptions = {
  /** @default 5000 */
  pollFrequency?: number;
};

export class Worker {
  #timer: NodeJS.Timeout | undefined = undefined;
  #status: 'running' | 'idling' = 'idling';
  #pollFrequency = 5000;

  constructor(
    readonly storage: IStorage,
    readonly emitter: InstanceType<typeof EventEmitter>,
    { pollFrequency = 5000 }: WorkerOptions = {},
  ) {
    this.#pollFrequency = pollFrequency;
  }

  get status() {
    return this.#status;
  }

  async start() {
    if (this.#status === 'running') {
      return;
    }

    this.#status = 'running';

    while (this.#status === 'running') {
      const job = await this.storage.getNextJob();
      const start = Date.now();

      if (job) {
        try {
          await this.emitter.emitAsync(job.name, job.payload);
          this.storage.success(job);
        } catch (e) {
          this.storage.fail(job);
        }
      }

      const runtime = Date.now() - start;
      const sleep = runtime > this.#pollFrequency ? 500 : this.#pollFrequency - runtime;
      await new Promise((r) => (this.#timer = setTimeout(r, sleep)));
    }
  }

  stop() {
    this.#status = 'idling';
    clearTimeout(this.#timer);
  }
}
