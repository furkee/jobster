import type { IExecutor } from "@jobster/core";
import type { EntityManager } from "@mikro-orm/postgresql";

export class MikroOrmExecutor implements IExecutor<EntityManager> {
  readonly em: EntityManager;

  constructor(em: EntityManager) {
    this.em = em;
  }

  async transaction<T>(callback: (client: EntityManager) => Promise<T>) {
    const em = await this.em.fork();
    try {
      await em.begin();
      const res = await callback(em);
      await em.flush();
      await em.commit();
      return res;
    } catch (e) {
      await em.rollback();
      throw e;
    }
  }

  async run(sql: string, params: any[], em: EntityManager) {
    try {
      return await em.execute(sql, params);
    } catch (e) {
      console.log({ sql, params });
      throw e;
    }
  }

  getQueryPlaceholder(index: number): string {
    return "?";
  }
}
