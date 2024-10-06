/**
 * A simple bridge to allow different drivers/ORMs to provide query/transaction execution
 * capabilities to different storages so that jobster stays driver/ORM agnostic.
 *
 * Only restriction is to use a driver/ORM that allows you to run raw queries as jobster will
 * always run plain SQLs
 */
export interface IExecutor<Transaction> {
  /** callback to be used by jobster to initiate a new transaction to run queries in */
  transaction<QResult>(callback: (transaction: Transaction) => Promise<QResult>): Promise<void>;
  /** raw query runner to be used by jobster when it needs to run queries within transactions of the app */
  run(sql: string, params: any[], transaction: Transaction): Promise<any>;
}
