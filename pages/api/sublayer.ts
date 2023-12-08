import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { getEM, withORM } from "utils/mikro";
import _ from "lodash";
import { Sublayer_db } from "server/database/models/_allModels";
import {
  EntityData,
  ForeignKeyConstraintViolationException,
  Loaded,
  QueryOrder,
} from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { hasPerms } from "utils/permissions";

/**
 * /api/sublayer
 *
 * API endpoint for sublayer
 *
 * The request method will determine what action to perform
 *    GET = get all, subset, or single record
 *      Required URL parameters are:
 *        missionId=  mission ID number
 *      Opitonal URL parameters are:
 *        uuid= uuid of the sublayer to retrieve
 *    POST = upsert a sublayer (defined in POST body) into the DB
 *      A full sublayer object (with an uuid for new sublayers) should be specified in the request body
 *    DELETE = delete the sublayer for a given sublayer uuid
 *       Required URL parameters are:
 *        uuid=  uuid of the sublayer to delete
 */
const handleSublayer: NextApiHandler<WrappedResponse<Sublayer[] | Sublayer>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    const { uuid, missionId } = req.query;
    const intMissionId = parseInt(missionId as string);
    const sublayerUUID = uuid as string;

    if (!intMissionId || _.isNaN(intMissionId)) {
      return res.status(500).json({ status: "error", message: "Invalid mission ID" });
    }

    const editPermission = await hasPerms(intMissionId, "edit", req.session?.user);

    // retrieve record
    if (req.method === "GET") {
      try {
        const viewPermission = await hasPerms(intMissionId, "view", req.session?.user);
        if (!viewPermission && !editPermission)
          return res.status(401).json({ status: "failure", message: "Unauthorized" });

        const records: Sublayer[] = await getSublayers(intMissionId, sublayerUUID);

        return res.status(200).json({
          status: "success",
          message: "sublayers retrieved",
          data: records,
        });
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the GET request" });
      }
    }

    //upsert a record
    if (req.method === "POST") {
      //must have edit permission for a given mission id
      //  or must be an admin to the back end (during mission create)
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      try {
        //perform the upsert
        const upsertObjects: Sublayer[] = req.body as Sublayer[];
        const upsertResponse: Sublayer[] = await upsertSublayers(upsertObjects);

        //check response
        if (upsertResponse.length === 0) {
          return res.status(500).json({
            status: "error",
            message: "Upsert response did not return a value",
            data: null,
          });
        } else {
          return res.status(200).json({
            status: "success",
            message: `Sublayer upserted with ID ${upsertResponse.map((s) => s.uuid)}`,
            data: upsertResponse,
          });
        }
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the POST request" });
      }
    }

    //delete a record
    if (req.method === "DELETE") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      try {
        const uuidsToDelete: string[] = req.body;
        const deletedUUIDs = await deleteSublayers(uuidsToDelete);

        if (deletedUUIDs.length > 0) {
          return res.status(200).json({
            status: "success",
            message: "Sublayer Deleted",
          });
        } else {
          return res.status(404).json({
            status: "failure",
            message: "Record not found. Nothing deleted",
          });
        }
      } catch (e) {
        console.error(e);
        if (e instanceof ForeignKeyConstraintViolationException) {
          return res.status(500).json({
            status: "error",
            message: "Cannot delete sublayer. This sublayer is referenced elsewhere",
          });
        } else {
          return res
            .status(500)
            .json({ status: "error", message: "Error processing the DELETE request" });
        }
      }
    }
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Error in query: " + e });
  }
};

/**
 * get sublayer(s) from the database
 * @param missionId required. Mission ID for the sublayers.
 * @param sublayerUUID optional. UUID of the sublayer to retrieve
 * @returns array of sublayers
 */
export async function getSublayers(missionId: number, sublayerUUID?: string): Promise<Sublayer[]> {
  const em = getEM();

  let sublayers_db: Loaded<Sublayer_db, never>[];
  if (sublayerUUID) {
    //find by sublayer uuid
    sublayers_db = await em.find(
      Sublayer_db,
      { uuid: sublayerUUID },
      { orderBy: [{ layer: { uuid: QueryOrder.ASC }, name: QueryOrder.ASC }] }
    );
  } else {
    //find by mission id
    sublayers_db = await em.find(
      Sublayer_db,
      { mission: { id: missionId } },
      { orderBy: [{ layer: { uuid: QueryOrder.ASC }, name: QueryOrder.ASC }] }
    );
  }

  if (sublayers_db) {
    //convert fks
    return sublayers_db.map((sublayer_db) => {
      const sublayer: Sublayer = {
        uuid: sublayer_db.uuid,
        missionId: sublayer_db.mission.id,
        layerUuid: sublayer_db.layer.uuid,
        name: sublayer_db.name,
        description: sublayer_db.description,
        legend: sublayer_db.legend,
        url: sublayer_db.url,
        type: sublayer_db.type,
        filePath: sublayer_db.filePath,
        boundingBox: sublayer_db.boundingBox,
        tileFormat: sublayer_db.tileFormat,
        minNativeZoom: sublayer_db.minNativeZoom,
        maxNativeZoom: sublayer_db.maxNativeZoom,
        maxZoom: sublayer_db.maxZoom,
        color: sublayer_db.color,
        opacity: sublayer_db.opacity,
        fillColor: sublayer_db.fillColor,
        fillOpacity: sublayer_db.fillOpacity,
        weight: sublayer_db.weight,
        createdAt: sublayer_db.createdAt.toISOString(),
        updatedAt: sublayer_db.updatedAt.toISOString(),
      };
      return sublayer;
    });
  } else {
    return [];
  }
}

/**
 * Inserts or Updates sublayers into the database
 * @param sublayers the sublayers to upsert
 * @returns a copy of the sublayers  that was upserted
 */
async function upsertSublayers(sublayers: Sublayer[]): Promise<Sublayer[]> {
  const em = getEM();
  const sublayersToUpsert: Sublayer[] = _.cloneDeep(sublayers);
  const sublayersUpsertedToDb = [];

  for (const sublayerToUpsert of sublayersToUpsert) {
    //convert fks and upsert
    const convertedRecord: EntityData<Sublayer_db> = {
      uuid: sublayerToUpsert.uuid || uuidv4(),
      mission: sublayerToUpsert.missionId,
      layer: sublayerToUpsert.layerUuid,
      name: sublayerToUpsert.name,
      description: sublayerToUpsert.description,
      legend: sublayerToUpsert.legend,
      type: sublayerToUpsert.type,
      url: sublayerToUpsert.url,
      filePath: sublayerToUpsert.filePath,
      boundingBox: sublayerToUpsert.boundingBox,
      tileFormat: sublayerToUpsert.tileFormat,
      minNativeZoom: sublayerToUpsert.minNativeZoom,
      maxNativeZoom: sublayerToUpsert.maxNativeZoom,
      maxZoom: sublayerToUpsert.maxZoom,
      color: sublayerToUpsert.color,
      opacity: sublayerToUpsert.opacity,
      fillColor: sublayerToUpsert.fillColor,
      fillOpacity: sublayerToUpsert.fillOpacity,
      weight: sublayerToUpsert.weight,
      createdAt: new Date(sublayerToUpsert.createdAt),
      updatedAt: new Date(sublayerToUpsert.updatedAt),
    };
    const upsertReference = await em.upsert(Sublayer_db, convertedRecord);
    em.persist(upsertReference);
    sublayersUpsertedToDb.push(upsertReference);
  }

  await em.flush();

  //convert fks back
  const convertedSublayers = sublayersUpsertedToDb.map((s) => {
    return {
      uuid: s.uuid,
      missionId: s.mission.id,
      layerUuid: s.layer.uuid,
      name: s.name,
      description: s.description,
      legend: s.legend,
      url: s.url,
      type: s.type,
      filePath: s.filePath,
      boundingBox: s.boundingBox,
      tileFormat: s.tileFormat,
      minNativeZoom: s.minNativeZoom,
      maxNativeZoom: s.maxNativeZoom,
      maxZoom: s.maxZoom,
      color: s.color,
      opacity: s.opacity,
      fillColor: s.fillColor,
      fillOpacity: s.fillOpacity,
      weight: s.weight,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  });

  return convertedSublayers;
}

/**
 * Deletes sublayers
 * @param uuids sublayer uuids to delete
 * @returns the uuids of the deleted sublayers
 */
async function deleteSublayers(uuids: string[]): Promise<string[]> {
  const em = getEM();
  const deletedUuids = [];
  for (const uuid of uuids) {
    const entity = await em.findOne(Sublayer_db, uuid);
    if (entity) {
      em.remove(entity);
      deletedUuids.push(uuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}

export default withIronSessionApiRoute(withORM(handleSublayer), ironOptions);
