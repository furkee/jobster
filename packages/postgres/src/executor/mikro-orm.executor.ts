import { type IExecutor, type ILogger, Logger } from "@jobster/core";
import type { EntityManager } from "@mikro-orm/postgresql";

export class MikroOrmExecutor implements IExecutor<EntityManager> {
  #logger: ILogger;
  readonly em: EntityManager;

  constructor({ em, logger }: { em: EntityManager; logger?: ILogger }) {
    this.em = em;
    this.#logger = logger || new Logger(MikroOrmExecutor.name);
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
      this.#logger.debug({ message: "failed sql", sql, params });
      throw e;
    }
  }

  getQueryPlaceholder(index: number): string {
    return "?";
  }
}
