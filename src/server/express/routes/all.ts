import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { getFolders } from "./folder";
import { getLayers } from "./layer";
import { getSublayers } from "./sublayer";
import { getPresets } from "./preset";
import { getLevel1s, getLevel2s, getLevel3s } from "./stm";
import { getStmRules } from "./stmRules";
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { getAutomergeMissions } from "./missionAutomerge";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session?.appUser,
    emssToken,
  });
  if (!viewPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "all",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "all",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  try {
    const record: OneMissionToRuleThemAll = await getAll(queryObj.missionId);
    res.status(200).json({
      status: "success",
      message: "everything retrieved",
      data: record,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "all",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: `Error getting everything ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error getting everything ${e}` });
  }
});

export default router;

/**
 * get everything from the database
 * @returns a mission
 * @param missionId
 */
export async function getAll(missionId: number): Promise<OneMissionToRuleThemAll> {
  if (!missionId || isNaN(missionId)) {
    throw new Error("Invalid mission ID");
  }
  const [mission, layers, sublayers, presets, level1s, level2s, level3s, stmRules, folders] =
    await Promise.all([
      getAutomergeMissions([missionId]),
      getLayers(missionId),
      getSublayers(missionId),
      getPresets(missionId),
      getLevel1s(missionId),
      getLevel2s(missionId),
      getLevel3s(missionId),
      getStmRules(missionId),
      getFolders(missionId),
    ]);
  const allData: OneMissionToRuleThemAll = {
    mission: mission[0],
    layers,
    sublayers,
    presets,
    level1s,
    level2s,
    level3s,
    stmRules,
    folders,
  };
  return allData;
}
