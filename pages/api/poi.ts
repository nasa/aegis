import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM, getEM } from "utils/mikro";
import { EntityData, QueryOrder } from "@mikro-orm/core";
import { roundDateToSecond } from "utils/formatting";
import { Poi as Poi_db } from "server/database/models/poi.model";
import { v4 as uuidv4 } from "uuid";

const handlePOI: NextApiHandler<WrappedResponse<POI[] | POI>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    const missionId = req.query.missionId ? req.query.missionId : req.body.missionId;
    const editPermission = req.session?.user?.permissionList.find(
      (p) => p.missionId == parseInt(missionId)
    )?.permissions.edit;
    const viewPermission = req.session?.user?.permissionList.find(
      (p) => p.missionId == parseInt(missionId)
    )?.permissions.view;

    if (editPermission || viewPermission) {
      if (req.method === "GET") {
        // If method is GET and there is a missionId query parameter, then get POIs by mission ID
        const {
          query: { missionId },
        } = req;
        const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
        if (isNaN(intMissionId) || typeof intMissionId !== "number") {
          return res.status(500).json({ status: "error", message: "Mission ID must be integer." });
        }
        try {
          const pois = await getPOIsByMission(intMissionId);
          return res.status(200).json({
            status: "success",
            message: "POIs retrieved",
            data: pois,
          });
        } catch (error) {
          return res
            .status(500)
            .json({ status: "error", message: "Failed to get POIs. : " + error });
        }
      }

      // If method is POST then upsert a POI
      if (req.method === "POST") {
        try {
          if (!editPermission) {
            return res.status(401).json({ status: "failure", message: "Unauthorized" });
          }
          const em = getEM();

          const validPoiBody: POI = req.body as POI;
          //build poi to upsert
          const updateDateString = roundDateToSecond(new Date()).toISOString();
          //convert fks
          const convertedPoi: EntityData<Poi_db> = {
            uuid: validPoiBody.uuid || uuidv4(),
            owner: validPoiBody.ownerId,
            mission: validPoiBody.missionId,
            actionOrderUuids: validPoiBody.actionOrderUuids,
            name: validPoiBody.name,
            description: validPoiBody.description,
            priorityOverride: validPoiBody.priorityOverride,
            radius: validPoiBody.radius,
            location: validPoiBody.location,
            elevation: validPoiBody.elevation,
            icon: validPoiBody.icon,
            tags: validPoiBody.tags,
            status: validPoiBody.status,
            createdAt: new Date(validPoiBody.createdAt || updateDateString),
            updatedAt: new Date(updateDateString),
          };
          const poiUpsertReference: Poi_db = await em.upsert(Poi_db, convertedPoi);
          await em.persistAndFlush(poiUpsertReference);

          const responsePoi: POI = {
            uuid: poiUpsertReference.uuid,
            missionId: poiUpsertReference.mission.id,
            ownerId: poiUpsertReference.owner.id,
            actionOrderUuids: poiUpsertReference.actionOrderUuids,
            name: poiUpsertReference.name,
            description: poiUpsertReference.description,
            priorityOverride: poiUpsertReference.priorityOverride,
            radius: poiUpsertReference.radius,
            location: poiUpsertReference.location,
            elevation: poiUpsertReference.elevation,
            icon: poiUpsertReference.icon,
            tags: poiUpsertReference.tags,
            status: poiUpsertReference.status,
            createdAt: poiUpsertReference.createdAt.toISOString(),
            updatedAt: poiUpsertReference.updatedAt.toISOString(),
          };

          return res.status(200).json({
            status: "success",
            message: "POI upserted",
            data: responsePoi,
          });
        } catch (error) {
          return res
            .status(500)
            .json({ status: "error", message: "Failed to upsert POI: " + error });
        }
      }

      // If method is DELETE then delete a POI
      if (req.method === "DELETE") {
        if (!editPermission) {
          return res.status(401).json({ status: "failure", message: "Unauthorized" });
        }
        const {
          query: { uuid },
        } = req;
        try {
          const em = getEM();
          const poiToDelete = await em.findOne(Poi_db, { uuid });
          if (poiToDelete) {
            // delete the POI
            await em.removeAndFlush(poiToDelete);
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
      }
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: "error", message: "Error in query" });
  }
};

export default withIronSessionApiRoute(withORM(handlePOI), ironOptions);

async function getPOIsByMission(missionId: number): Promise<POI[]> {
  const em = getEM();
  const dbPois = await em.find(
    Poi_db,
    { mission: missionId },
    { orderBy: { name: QueryOrder.ASC } }
  );

  /** transform the Mikro Poi objects into POI objects used in the Store */
  const transformedPois: POI[] = [];
  for (const poiItem of dbPois) {
    const convertedPoi: POI = {
      uuid: poiItem.uuid,
      ownerId: poiItem.owner.id,
      missionId: poiItem.mission.id,
      actionOrderUuids: poiItem.actionOrderUuids,
      name: poiItem.name,
      description: poiItem.description,
      priorityOverride: poiItem.priorityOverride,
      radius: poiItem.radius,
      location: poiItem.location,
      elevation: poiItem.elevation,
      icon: poiItem.icon,
      tags: poiItem.tags,
      status: poiItem.status,
      createdAt: poiItem.createdAt.toISOString(),
      updatedAt: poiItem.updatedAt.toISOString(),
    };
    transformedPois.push(convertedPoi);
  }

  return transformedPois;
}
