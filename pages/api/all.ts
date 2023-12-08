import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM } from "utils/mikro";
import _ from "lodash";
import { hasPerms } from "utils/permissions";
import { getMission } from "./mission";
import { getActions } from "./action";
import { getEVAs } from "./eva";
import { getLayers } from "./layer";
import { getSublayers } from "./sublayer";
import { getPois } from "./poi";
import { getPresets } from "./preset";
import { getRexes } from "./rex";
import { getStations } from "./station";
import { getGoals, getInvestigations, getObjectives } from "./stm";
import { getTraverses } from "./traverse";
/**
 * /api/all?missionId=
 *
 * API endpoint for pulling all things related to a mission
 *
 * The request method will determine what action to perform
 *    GET = get all, subset, or single record
 */
const handleOneMissionToRuleThemAll: NextApiHandler<
  WrappedResponse<OneMissionToRuleThemAll>
> = async (req, res): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    //missionId is required
    const { missionId } = req.query;
    const intMissionId = missionId ? parseInt(missionId as string) : null;
    if (!intMissionId || _.isNaN(intMissionId)) {
      return res.status(500).json({ status: "error", message: "Invalid mission ID" });
    }

    if (req.method === "GET") {
      const viewPermission = await hasPerms(intMissionId, "view", req.session?.user);
      if (!viewPermission)
        return res.status(401).json({ status: "failure", message: "Unauthorized" });

      try {
        const record: OneMissionToRuleThemAll = await getAll(intMissionId);

        return res.status(200).json({
          status: "success",
          message: "everything retrieved",
          data: record,
        });
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the GET request" });
      }
    } else {
      return res.status(500).json({ status: "error", message: "Request method not allowed" });
    }
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Error in query: " + e });
  }
};

/**
 * get everything from the database
 * @returns a mission
 * @param missionId
 */
async function getAll(missionId: number): Promise<OneMissionToRuleThemAll> {
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
    objectives: [],
    goals: [],
    invstgs: [],
    traverses: [],
  };

  try {
    everything.mission = (await getMission(missionId))?.[0];
    everything.actions = await getActions({ missionId });
    everything.evas = await getEVAs(missionId);
    everything.layers = await getLayers(missionId);
    everything.sublayers = await getSublayers(missionId);
    everything.pois = await getPois(missionId);
    everything.presets = await getPresets(missionId);
    everything.rexes = await getRexes(missionId);
    everything.stations = await getStations(missionId);
    everything.objectives = await getObjectives(missionId);
    everything.goals = await getGoals(missionId);
    everything.invstgs = await getInvestigations(missionId);
    everything.traverses = await getTraverses(missionId);
  } catch (e) {
    throw new Error("Error getting everything for a mission: " + e);
  }

  return everything;
}

export default withIronSessionApiRoute(withORM(handleOneMissionToRuleThemAll), ironOptions);
