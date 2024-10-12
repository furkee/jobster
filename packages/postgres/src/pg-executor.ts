import type { IExecutor } from "@jobster/core";
import type pg from "pg";

export class PgExecutor implements IExecutor<pg.PoolClient> {
  readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await callback(client);
      await client.query("COMMIT");
      return res;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async run(sql: string, params: any[], client: pg.PoolClient) {
    try {
      const data = await client.query(sql, params);
      return data.rows;
    } catch (e) {
      console.log({ sql, params });
      throw e;
    }
  }

  getQueryPlaceholder(index: number): string {
    return `$${index + 1}`;
  }
}