import { EventEmitter } from './event-emitter.js';
import { IStorage } from './storage/storage.interface.js';

export class Worker {
  private timer: NodeJS.Timeout | undefined = undefined;
  private isStopped = false;

  constructor(
    readonly storage: IStorage,
    readonly emitter: InstanceType<typeof EventEmitter>,
  ) {}

  async start() {
    while (!this.isStopped) {
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

      const sleep = Math.min(5000, Date.now() - start);
      await new Promise((r) => (this.timer = setTimeout(r, sleep)));
    }
  }

  stop() {
    this.isStopped = true;
    clearTimeout(this.timer);
  }
}
