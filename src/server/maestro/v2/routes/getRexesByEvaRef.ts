import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { emssTokenIsValid } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { getAutomergeMissions } from "../../../express/routes/missionAutomerge";
import type { RefRex } from "server/maestro/v2/types/socketioRequests";

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
    serverLogger.apiRoute({
      logLevel: "warning",
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
    serverLogger.apiRoute({
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
    const refRexes = await getRexesByEvaRefData(queryObj.evaRefUuid);
    res.status(200).json({
      status: "success",
      message: `Rexes retrieved`,
      data: refRexes,
    });
  } catch (e) {
    serverLogger.apiRoute({
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

export async function getRexesByEvaRefData(evaRefUuid: string): Promise<RefRex[]> {
  const allMissions = await getAutomergeMissions();

  const matchingRexes = allMissions.flatMap((mission) => {
    const evaUuidsWithMatchingRef = Object.values(mission.evas || {})
      .filter((e) => e.refUuid === evaRefUuid)
      .map((e) => e.uuid);
    return Object.values(mission.rexes || {}).filter(
      (r) => evaUuidsWithMatchingRef.includes(r.evaUuid) && !r.maestroEventId
    );
  });

  return matchingRexes.map((rex) => ({
    uuid: rex.uuid,
    name: rex.name,
    createdAt: rex.createdAt,
    updatedAt: rex.updatedAt,
    isRunning: rex.isRunning,
  }));
}

export default router;
