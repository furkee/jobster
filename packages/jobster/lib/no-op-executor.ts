import { type IExecutor } from './executor.interface.ts';

/** dummy executor to use alongside the MemoryStorage */
export class NoOpExecutor implements IExecutor<void> {
  async run(sql: string, params: any[], transaction: void): Promise<void> {}

  async transaction<QResult = void>(callback: (transaction: void) => Promise<QResult>): Promise<void> {
    callback();
  }
}
