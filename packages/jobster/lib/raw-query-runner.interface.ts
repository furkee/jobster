/** transaction provider for jobster storages */
export type RawQueryRunner<Transaction, QResult = any> = (sql: string, transaction: Transaction) => Promise<QResult>;
