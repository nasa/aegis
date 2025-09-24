import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { getEM } from "utils/mikro";
import { Eva_db, Rex_db } from "server/database/models/_allModels";
import { emssTokenIsValid } from "utils/permissions";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { evaRefUuid } = query;
  const queryObj = {
    evaRefUuid: evaRefUuid ? (evaRefUuid as string) : undefined,
  };
  return queryObj;
};

// Used by Maestro to get all REX executions for a given as-planned EVA
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions
  const viewPermissions = emssTokenIsValid(emssToken);

  if (!viewPermissions) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "emss/getRexesByEvaRef",
      message: "Unauthorized access attempt",
      uuids: [queryObj.evaRefUuid],
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  // validate inputs
  if (!queryObj.evaRefUuid) {
    apiRouteLogger({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "emss/getRexesByEvaRef",
      message: "No EVA Ref given",
    });
    res.status(400).json({ status: "failure", message: "No EVA Ref given" });
    return;
  }

  try {
    const em = getEM();

    const refEvaSubQuery = em
      .createQueryBuilder(Eva_db)
      .select("uuid")
      .where({ refUuid: queryObj.evaRefUuid });

    const rexEvasQuery = em
      .createQueryBuilder(Rex_db)
      .select(["uuid", "name", "createdAt", "updatedAt", "isRunning"])
      .where({
        evaUuid: { $in: refEvaSubQuery.getKnexQuery() },
        maestroEventId: null,
      });

    const dbRexes = await rexEvasQuery.execute();

    const refRexes = dbRexes.map((rex) => ({
      uuid: rex.uuid,
      name: rex.name,
      createdAt: rex.createdAt.toISOString(),
      updatedAt: rex.updatedAt.toISOString(),
      isRunning: rex.isRunning,
    }));

    res.status(200).json({
      status: "success",
      message: `Rexes retrieved`,
      data: refRexes,
    });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "emss/getRexesByEvaRef",
      message: "Error getting rexes",
      uuids: [queryObj.evaRefUuid],
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error getting rexes ${e}` });
  }
});

export default router;
