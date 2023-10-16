import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM, getEM } from "utils/mikro";
import { EntityData, QueryOrder } from "@mikro-orm/core";
import { Poi_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { hasPerms } from "utils/permissions";
import { emitStoreDelete, emitStoreUpsert } from "./socketio";
import { upsertLog } from "./log";

const handlePOI: NextApiHandler<WrappedResponse<POI[] | POI>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    const { missionId, socketId, log } = req.query;
    const intMissionId = parseInt(missionId as string);
    const logAction = log === "true";

    if (isNaN(intMissionId) || typeof intMissionId !== "number") {
      return res.status(500).json({ status: "error", message: "Mission ID must be integer." });
    }
    const editPermission = await hasPerms(intMissionId, "edit", req.session?.user);

    if (req.method === "GET") {
      const viewPermission = await hasPerms(intMissionId, "view", req.session.user);
      if (!viewPermission && !editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      try {
        const pois = await getPOIsByMission(intMissionId);
        return res.status(200).json({
          status: "success",
          message: "POIs retrieved",
          data: pois,
        });
      } catch (error) {
        return res.status(500).json({ status: "error", message: "Failed to get POIs. : " + error });
      }
    }

    // If method is POST then upsert a POI
    if (req.method === "POST") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        const em = getEM();

        const poiToUpsert: POI = req.body as POI;
        //build poi to upsert
        //convert fks
        const convertedPoi: EntityData<Poi_db> = {
          uuid: poiToUpsert.uuid || uuidv4(),
          owner: poiToUpsert.ownerId || req.session.user.id,
          mission: poiToUpsert.missionId,
          actionOrderUuids: poiToUpsert.actionOrderUuids,
          name: poiToUpsert.name,
          description: poiToUpsert.description,
          priorityOverride: poiToUpsert.priorityOverride,
          radius: poiToUpsert.radius,
          location: poiToUpsert.location,
          elevation: poiToUpsert.elevation,
          icon: poiToUpsert.icon,
          tags: poiToUpsert.tags,
          status: poiToUpsert.status,
          createdAt: new Date(poiToUpsert.createdAt),
          updatedAt: new Date(poiToUpsert.updatedAt),
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

        // emit the upserted item to all clients via socket.io
        emitStoreUpsert({
          missionId: intMissionId,
          socketId,
          type: "poi",
          data: [responsePoi],
        } as StoreUpsert<POI>);

        if (logAction) {
          // log this upsert to the log table
          upsertLog({
            uuid: uuidv4(),
            missionId: intMissionId,
            type: "poiUpsert",
            payloadJson: JSON.stringify(poiToUpsert),
            createdAt: new Date().toISOString(),
          } as Log);
        }

        return res.status(200).json({
          status: "success",
          message: "POI upserted",
          data: responsePoi,
        });
      } catch (error) {
        return res.status(500).json({ status: "error", message: "Failed to upsert POI: " + error });
      }
    }

    // If method is DELETE then delete a POI
    if (req.method === "DELETE") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      const { uuid } = req.query;
      const actionUUID = Array.isArray(uuid) ? uuid[0] : uuid;

      try {
        const em = getEM();
        const poiToDelete = await em.findOne(Poi_db, { uuid: actionUUID });
        if (poiToDelete) {
          // delete the POI
          await em.removeAndFlush(poiToDelete);

          // emit the deleted item to all clients via socket.io
          emitStoreDelete({
            missionId: intMissionId,
            socketId,
            type: "poi",
            uuid: poiToDelete.uuid,
          } as StoreDelete);

          if (logAction) {
            // log this deletion to the log table
            upsertLog({
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "poiDelete",
              payloadJson: JSON.stringify({ poiUuid: poiToDelete.uuid }),
              createdAt: new Date().toISOString(),
            } as Log);
          }

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
  } catch (e) {
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
