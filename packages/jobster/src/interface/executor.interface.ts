/**
 * A simple bridge to allow different drivers/ORMs to provide query/transaction execution
 * capabilities to different storages so that jobster stays driver/ORM agnostic.
 */
export interface IExecutor<Transaction> {
  /** callback to be used by jobster to initiate a new transaction to run queries in */
  transaction<QResult>(callback: (transaction: Transaction) => Promise<QResult>): Promise<QResult>;
  /** raw query runner to be used by jobster when it needs to run queries within transactions of the app */
  run(sql: string, params: any[], transaction: Transaction): Promise<any>;
  /**
   * Return the placeholder string based on the array index of the supplied values, eg
   *
   * SELECT * FROM SomeTable WHERE id = ? AND createdAt < ?
   *
   * Jobster will call this function twice for the above query, for the ID `?`, index will be 0 and ie node-postgres
   * would expect you to return $1 where as mikroorm expects a single `?` for each dynamic value.
   */
  getQueryPlaceholder(index: number): string;
}
