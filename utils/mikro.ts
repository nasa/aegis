import { MikroORM, RequestContext } from "@mikro-orm/core";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import config from "../mikro-orm.config";

export default class Mikro {
  static getORM = async () => {
    if (!global.__MikroORM__) {
      global.__MikroORM__ = await MikroORM.init(config).then(async (orm) => {
        return orm;
      });
    }
    return global.__MikroORM__;
  };

  static withORM =
    (handler: NextApiHandler) => async (req: NextApiRequest, res: NextApiResponse) => {
      const orm = await this.getORM();
      return RequestContext.createAsync(orm.em, async () => handler(req, res));
    };

  static getEM = () => {
    let em = RequestContext.getEntityManager();
    if (!em) {
      em = global.__MikroORM__?.em;
      if (!em) {
        throw new Error("Entity Manager not initialized");
      }
    }
    return em;
  };

  static closeORM = async () => {
    if (global.__MikroORM__) {
      await global.__MikroORM__.close();
      delete global.__MikroORM__;
    }
  };
}
