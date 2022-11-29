import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { QueryOrder } from "@mikro-orm/core";
import { roundDateToSecond } from "utils/formatting";
import { Poi as Poi_db } from "server/database/models/poi.model";
import { Action as Action_db } from "server/database/models/action.model";

export const handlePOI: NextApiHandler<WrappedResponse<POI[] | POI>> = async (
  req,
  res
): Promise<unknown> => {
  // If method is GET and there is a missionId query parameter, then get POIs by mission ID
  if (req.method === "GET" && req.query.missionId) {
    const {
      query: { missionId },
    } = req;
    const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
    if (typeof intMissionId !== "number") {
      return res.status(500).json({ status: "error", message: "Mission ID must be integer." });
    }
    try {
      if (req.session?.user) {
        const pois = await getPOIsByMission(intMissionId);
        return res.status(200).json({
          status: "success",
          message: "POIs retrieved",
          data: pois,
        });
      } else {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
    } catch (error) {
      return res.status(500).json({ status: "error", message: "Failed to get POIs." });
    }
  }

  // If method is POST then upsert a POI
  if (req.method === "POST") {
    const { poi, updateActions } = <{ poi: POI; updateActions: boolean }>req.body;
    if (req.session?.user) {
      try {
        await Mikro.getORM();
        const em = await Mikro.getEM();
        // strip actions from POI before upserting it
        const { actions, ...validPoiBody } = poi;

        const poiToUpsert = {
          ...validPoiBody,
          createdAt: validPoiBody.createdAt || roundDateToSecond(new Date()),
          updatedAt: roundDateToSecond(new Date()),
        };
        const poiUpsertReference = await em.upsert(Poi_db, poiToUpsert);
        await em.persistAndFlush(poiUpsertReference);

        // upsert all action records associated with this POI if updateActions is true and there are actions to update
        let actionsReferences: Action[] = [];
        if (updateActions && actions) {
          const actionsToUpsert = actions.map((action) => {
            return {
              ...action,
              poi: poiUpsertReference,
              createdAt: action.createdAt || roundDateToSecond(new Date()),
              updatedAt: roundDateToSecond(new Date()),
            };
          });
          for (const actionToUpsert of actionsToUpsert) {
            const actionUpsertReference = await em.upsert(Action_db, actionToUpsert);
            await em.persistAndFlush(actionUpsertReference);
            actionsReferences.push({
              ...actionUpsertReference,
              poi: actionUpsertReference.poi.id,
            });
          }
          // find actions that are in the database but not in the request body
          const actionsInDb = await em.find(Action_db, { poi: poiUpsertReference });
          const actionsToDelete = actionsInDb.filter(
            (actionInDb) =>
              !actionsToUpsert.some((actionToUpsert) => actionToUpsert.id === actionInDb.id)
          );
          // delete actions that are in the database but not in the request body
          for (const actionToDelete of actionsToDelete) {
            await em.removeAndFlush(actionToDelete);
          }
          await Mikro.closeORM();
        } else {
          actionsReferences = actions;
        }

        const responsePoi: POI = {
          ...poiUpsertReference,
          actions: actionsReferences,
          mission: poiUpsertReference.mission.id,
          owner: poiUpsertReference.owner.id,
        };

        return res.status(200).json({
          status: "success",
          message: "POI upserted",
          data: responsePoi,
        });
      } catch (error) {
        return res.status(500).json({ status: "error", message: "Failed to upsert POI: " + error });
      }
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  }

  // If method is DELETE then delete a POI
  if (req.method === "DELETE") {
    const {
      query: { uuid },
    } = req;
    if (req.session?.user) {
      try {
        await Mikro.getORM();
        const em = await Mikro.getEM();
        const poiToDelete = await em.findOne(Poi_db, { uuid });
        if (poiToDelete) {
          // find actions that are associated with this POI and delete them
          const actionsToDelete = await em.find(Action_db, { poi: poiToDelete });
          for (const actionToDelete of actionsToDelete) {
            await em.removeAndFlush(actionToDelete);
          }
          // delete the POI
          await em.removeAndFlush(poiToDelete);
          await Mikro.closeORM();
          return res.status(200).json({
            status: "success",
            message: "POI deleted",
          });
        } else {
          return res.status(200).json({
            status: "failure",
            message: "No such POI found to delete",
          });
        }
      } catch (error) {
        return res.status(500).json({ status: "error", message: "Failed to delete POI." });
      }
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  }
};

export default withIronSessionApiRoute(Mikro.withORM(handlePOI), ironOptions);

export async function getPOIsByMission(missionId: number): Promise<POI[]> {
  await Mikro.getORM();
  const em = await Mikro.getEM();
  const pois = await em.find(Poi_db, { mission: missionId }, { orderBy: { id: QueryOrder.ASC } });

  /** transform the Mikro Poi objects into POI objects used in the Store.
   * also transform and populate the actions
   */
  const transformedPois: POI[] = [];
  for (const poiItem of pois) {
    let convertedPoi: POI = { ...poiItem, owner: poiItem.owner.id, mission: poiItem.mission.id };

    const actions = await em.find(Action_db, { poi: poiItem }, { orderBy: { id: QueryOrder.ASC } });
    const convertedActions: Action[] = actions.map((action) => ({
      ...action,
      poi: action.poi.id,
    }));

    convertedPoi = { ...convertedPoi, actions: convertedActions };
    transformedPois.push(convertedPoi);
  }

  return transformedPois;
}
