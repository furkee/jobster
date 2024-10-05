import { type ITransactionProvider } from './transaction-provider.interface.ts';

export class NoOpTransactionProvider implements ITransactionProvider<void> {
  // @ts-ignore
  async run(sql: string, transaction: void): Promise<void> {}

  async transaction<QResult = void>(callback: (transaction: void) => Promise<QResult>): Promise<void> {
    callback();
  }
}
