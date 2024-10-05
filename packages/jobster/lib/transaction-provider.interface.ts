export interface ITransactionProvider<Transaction> {
  /** raw query runner to be used by jobster when it needs to run queries within transactions of the app */
  run<QResult>(sql: string, transaction: Transaction): Promise<QResult>;
  /** callback to be used by jobster to initiate a new transaction to run queries in */
  transaction<QResult>(callback: (transaction: Transaction) => Promise<QResult>): Promise<void>;
}
