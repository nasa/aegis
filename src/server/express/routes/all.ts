import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { getActions } from "./action";
import { getEVAs } from "./eva";
import { getFolders } from "./folder";
import { getLayers } from "./layer";
import { getMission } from "./mission";
import { getSublayers } from "./sublayer";
import { getPois } from "./poi";
import { getPresets } from "./preset";
import { getRexes } from "./rex";
import { getStations } from "./station";
import { getLevel1s, getLevel2s, getLevel3s } from "./stm";
import { getStmRules } from "./stmRules";
import { getTraverses } from "./traverse";
import { hasPerms } from "utils/permissions";

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
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
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
    console.error(e);
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
  // All queries start simultaneously and use different connections from the pool
  const [
    mission,
    actions,
    evas,
    layers,
    sublayers,
    pois,
    presets,
    rexes,
    stations,
    level1s,
    level2s,
    level3s,
    stmRules,
    traverses,
    folders,
  ] = await Promise.all([
    getMission(missionId).then((result) => result?.[0] || null),
    getActions({ missionId }),
    getEVAs(missionId),
    getLayers(missionId),
    getSublayers(missionId),
    getPois(missionId),
    getPresets(missionId),
    getRexes(missionId),
    getStations(missionId),
    getLevel1s(missionId),
    getLevel2s(missionId),
    getLevel3s(missionId),
    getStmRules(missionId),
    getTraverses(missionId),
    getFolders(missionId),
  ]);
  const allData: OneMissionToRuleThemAll = {
    mission,
    actions,
    evas,
    layers,
    sublayers,
    pois,
    presets,
    rexes,
    stations,
    level1s,
    level2s,
    level3s,
    stmRules,
    traverses,
    folders,
  };
  return allData;
}
