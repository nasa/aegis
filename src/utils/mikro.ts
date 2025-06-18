import { MikroORM, RequestContext } from "@mikro-orm/postgresql";
import type {
  AbstractSqlConnection,
  AbstractSqlDriver,
  AbstractSqlPlatform,
  EntityManager,
} from "@mikro-orm/postgresql";
import config from "../server/database/mikro-orm.config";
import { globalValues } from "../server/express/global";

export const getORM = async (): Promise<
  MikroORM<EntityManager<AbstractSqlDriver<AbstractSqlConnection, AbstractSqlPlatform>>>
> => {
  if (!globalValues.ormCache) {
    globalValues.ormCache = await MikroORM.init(config);
  }
  return globalValues.ormCache;
};

export const getEM = (): EntityManager<
  AbstractSqlDriver<AbstractSqlConnection, AbstractSqlPlatform>
> => {
  let em = RequestContext.getEntityManager() as EntityManager;
  if (!globalValues.ormCache) {
    throw new Error("Run Mikro.getORM() first");
  }
  if (!em) {
    em = globalValues.ormCache.em.fork();
    if (!em) {
      throw new Error("Entity Manager not initialized");
    }
  }
  return em;
};

export const closeORM = async (): Promise<void> => {
  if (globalValues.ormCache) {
    await globalValues.ormCache.close();
    globalValues.ormCache = null;
  }
};
