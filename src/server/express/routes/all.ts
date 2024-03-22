import express, { Request, Response } from "express";
import _ from "lodash";
import { hasPerms } from "utils/permissions";
import { Query } from "express-serve-static-core";

import { getMission } from "./mission";
import { getActions } from "./action";
import { getEVAs } from "./eva";
import { getLayers } from "./layer";
import { getSublayers } from "./sublayer";
import { getPois } from "./poi";
import { getPresets } from "./preset";
import { getRexes } from "./rex";
import { getStations } from "./station";
import { getLevel1s, getLevel2s, getLevel3s } from "./stm";
import { getTraverses } from "./traverse";

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
  const viewPermission = await hasPerms(queryObj.missionId, "view", req.session?.user);
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || _.isNaN(queryObj.missionId)) {
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
  const everything: OneMissionToRuleThemAll = {
    mission: null,
    actions: [],
    evas: [],
    layers: [],
    sublayers: [],
    pois: [],
    presets: [],
    rexes: [],
    stations: [],
    level1s: [],
    level2s: [],
    level3s: [],
    traverses: [],
  };

  everything.mission = (await getMission(missionId))?.[0];
  everything.actions = await getActions({ missionId });
  everything.evas = await getEVAs(missionId);
  everything.layers = await getLayers(missionId);
  everything.sublayers = await getSublayers(missionId);
  everything.pois = await getPois(missionId);
  everything.presets = await getPresets(missionId);
  everything.rexes = await getRexes(missionId);
  everything.stations = await getStations(missionId);
  everything.level1s = await getLevel1s(missionId);
  everything.level2s = await getLevel2s(missionId);
  everything.level3s = await getLevel3s(missionId);
  everything.traverses = await getTraverses(missionId);

  return everything;
}
