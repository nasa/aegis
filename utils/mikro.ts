import {
  Connection,
  EntityManager,
  IDatabaseDriver,
  MikroORM,
  RequestContext,
} from "@mikro-orm/core";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import config from "../mikro-orm.config";

export const getORM = async (): Promise<MikroORM<IDatabaseDriver<Connection>>> => {
  if (!global.__ormCache__) {
    global.__ormCache__ = await MikroORM.init(config);
  }
  return global.__ormCache__;
};

export const withORM =
  (handler: NextApiHandler) =>
  async (req: NextApiRequest, res: NextApiResponse): Promise<unknown> => {
    const orm = await getORM();
    return RequestContext.createAsync(orm.em, async () => handler(req, res));
  };

export const getEM = (): EntityManager<IDatabaseDriver<Connection>> => {
  let em = RequestContext.getEntityManager();
  if (!global.__ormCache__) {
    throw new Error("Run Mikro.getORM() first");
  }
  if (!em) {
    em = global.__ormCache__.em.fork();
    if (!em) {
      throw new Error("Entity Manager not initialized");
    }
  }
  return em;
};

export const closeORM = async (): Promise<void> => {
  if (global.__ormCache__) {
    await global.__ormCache__.close();
    global.__ormCache__ = null;
  }
};
