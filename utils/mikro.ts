import {
  Connection,
  EntityManager,
  IDatabaseDriver,
  MikroORM,
  RequestContext,
} from "@mikro-orm/core";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import config from "../mikro-orm.config";

let ormCache: null | MikroORM<IDatabaseDriver<Connection>> = null;

export default class Mikro {
  static getORM = async (): Promise<MikroORM<IDatabaseDriver<Connection>>> => {
    if (!ormCache) {
      ormCache = await MikroORM.init(config);
    }
    return ormCache;
  };

  static withORM =
    (handler: NextApiHandler) =>
    async (req: NextApiRequest, res: NextApiResponse): Promise<unknown> => {
      const orm = await this.getORM();
      return RequestContext.createAsync(orm.em, async () => handler(req, res));
    };

  static withORM_Func<TArgument, TResult>(handler: (arg: TArgument) => Promise<TResult>) {
    return async (arg: TArgument): Promise<TResult> => {
      const orm = await this.getORM();
      return RequestContext.createAsync(orm.em, async () => handler(arg));
    };
  }

  static getEM = (): EntityManager<IDatabaseDriver<Connection>> => {
    let em = RequestContext.getEntityManager();
    if (!ormCache) {
      throw new Error("Run Mikro.getORM() first");
    }
    if (!em) {
      em = ormCache.em.fork();
      if (!em) {
        throw new Error("Entity Manager not initialized");
      }
    }
    return em;
  };

  static closeORM = async (): Promise<void> => {
    if (ormCache) {
      await ormCache.close();
      ormCache = null;
    }
  };
}
