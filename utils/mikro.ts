import {
  Connection,
  EntityManager,
  IDatabaseDriver,
  MikroORM,
  RequestContext,
} from "@mikro-orm/core";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import config from "../mikro-orm.config";

export default class Mikro {
  static getORM = async (): Promise<MikroORM<IDatabaseDriver<Connection>>> => {
    if (global.__MikroORM__) {
      return global.__MikroORM__;
    }
    const orm = await MikroORM.init(config).then(async (orm) => {
      return orm;
    });
    global.__MikroORM__ = orm;
    return orm;
  };

  static withORM =
    (handler: NextApiHandler) =>
    async (req: NextApiRequest, res: NextApiResponse): Promise<unknown> => {
      const orm = await this.getORM();
      return RequestContext.createAsync(orm.em, async () => handler(req, res));
    };

  static getEM = (): EntityManager<IDatabaseDriver<Connection>> => {
    let em = RequestContext.getEntityManager();
    if (!em) {
      em = global.__MikroORM__?.em;
      if (!em) {
        throw new Error("Entity Manager not initialized");
      }
    }
    return em;
  };

  static closeORM = async (): Promise<void> => {
    if (global.__MikroORM__) {
      await global.__MikroORM__.close();
      delete global.__MikroORM__;
    }
  };
}
