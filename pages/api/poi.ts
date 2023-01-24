import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { EntityData, QueryOrder } from "@mikro-orm/core";
import { roundDateToSecond } from "utils/formatting";
import { Poi as Poi_db } from "server/database/models/poi.model";

const handlePOI: NextApiHandler<WrappedResponse<POI[] | POI>> = async (
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
      return res.status(500).json({ status: "error", message: "Failed to get POIs. : " + error });
    }
  }

  // If method is POST then upsert a POI
  if (req.method === "POST") {
    if (req.session?.user) {
      try {
        const em = Mikro.getEM();

        const validPoiBody: POI = req.body as POI;
        //build poi to upsert
        const poiToUpsert: POI = {
          ...validPoiBody,
          createdAt: validPoiBody.createdAt || roundDateToSecond(new Date()),
          updatedAt: roundDateToSecond(new Date()),
        };
        //convert fks
        const convertedPoi: EntityData<Poi_db> = {
          uuid: poiToUpsert.uuid,
          owner: poiToUpsert.ownerId,
          mission: poiToUpsert.missionId,
          actionOrderUuids: poiToUpsert.actionOrderUuids,
          name: poiToUpsert.name,
          description: poiToUpsert.description,
          priorityOverride: poiToUpsert.priorityOverride,
          radius: poiToUpsert.radius,
          location: poiToUpsert.location,
          color: poiToUpsert.color,
          tags: poiToUpsert.tags,
          status: poiToUpsert.status,
          createdAt: poiToUpsert.createdAt,
          updatedAt: poiToUpsert.updatedAt,
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
          color: poiUpsertReference.color,
          tags: poiUpsertReference.tags,
          status: poiUpsertReference.status,
          createdAt: poiUpsertReference.createdAt,
          updatedAt: poiUpsertReference.updatedAt,
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
        const em = Mikro.getEM();
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
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  }
};

export default withIronSessionApiRoute(Mikro.withORM(handlePOI), ironOptions);

export async function getPOIsByMission(missionId: number): Promise<POI[]> {
  const em = Mikro.getEM();
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
      color: poiItem.color,
      tags: poiItem.tags,
      status: poiItem.status,
      createdAt: poiItem.createdAt,
      updatedAt: poiItem.updatedAt,
    };
    transformedPois.push(convertedPoi);
  }

  return transformedPois;
}
