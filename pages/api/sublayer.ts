import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { getEM, withORM } from "utils/mikro";
import _ from "lodash";
import { Sublayer as Sublayer_db } from "server/database/models/sublayer.model";
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
    const editPermission = await hasPerms(intMissionId, "edit", req.session?.user);

    // retrieve record
    if (req.method === "GET") {
      try {
        if (!intMissionId || _.isNaN(intMissionId)) {
          return res.status(500).json({ status: "error", message: "Invalid mission ID" });
        }

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
      if (
        missionId &&
        !editPermission &&
        !req.session.user.isAdmin &&
        !req.session.user.isSuperAdmin
      ) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      try {
        //perform the upsert
        const upsertObject: Sublayer = req.body as Sublayer;
        const upsertResponse: Sublayer = await upsertSublayer(upsertObject);

        //check response
        if (!upsertResponse) {
          return res.status(500).json({
            status: "error",
            message: "Upsert response did not return a value",
            data: null,
          });
        } else {
          return res.status(200).json({
            status: "success",
            message: `Sublayer upserted with ID ${upsertResponse.uuid}`,
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
      if (!intMissionId || _.isNaN(intMissionId)) {
        return res.status(500).json({ status: "error", message: "Invalid mission ID" });
      }

      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      try {
        const deletedUUID = await deleteSublayer(sublayerUUID);

        if (deletedUUID) {
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
async function getSublayers(missionId: number, sublayerUUID?: string): Promise<Sublayer[]> {
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
 * Inserts or Updates a sublayer into the database
 * @param sublayer the sublayer object to upsert
 * @returns a copy of the sublayer object that was upserted
 */
async function upsertSublayer(sublayer: Sublayer): Promise<Sublayer> {
  const em = getEM();
  const upsertRecord: Sublayer = _.cloneDeep(sublayer);

  //convert fks and upsert
  const convertedRecord: EntityData<Sublayer_db> = {
    uuid: upsertRecord.uuid || uuidv4(),
    mission: upsertRecord.missionId,
    layer: upsertRecord.layerUuid,
    name: upsertRecord.name,
    description: upsertRecord.description,
    legend: upsertRecord.legend,
    type: upsertRecord.type,
    url: upsertRecord.url,
    filePath: upsertRecord.filePath,
    boundingBox: upsertRecord.boundingBox,
    tileFormat: upsertRecord.tileFormat,
    minNativeZoom: upsertRecord.minNativeZoom,
    maxNativeZoom: upsertRecord.maxNativeZoom,
    maxZoom: upsertRecord.maxZoom,
    color: upsertRecord.color,
    opacity: upsertRecord.opacity,
    fillColor: upsertRecord.fillColor,
    fillOpacity: upsertRecord.fillOpacity,
    weight: upsertRecord.weight,
    createdAt: new Date(upsertRecord.createdAt),
    updatedAt: new Date(upsertRecord.updatedAt),
  };
  const upsertReference = await em.upsert(Sublayer_db, convertedRecord);

  await em.persistAndFlush(upsertReference);

  //convert fks back
  const result: Sublayer = {
    uuid: upsertReference.uuid,
    missionId: upsertReference.mission.id,
    layerUuid: upsertReference.layer.uuid,
    name: upsertReference.name,
    description: upsertReference.description,
    legend: upsertReference.legend,
    url: upsertReference.url,
    type: upsertReference.type,
    filePath: upsertReference.filePath,
    boundingBox: upsertReference.boundingBox,
    tileFormat: upsertReference.tileFormat,
    minNativeZoom: upsertReference.minNativeZoom,
    maxNativeZoom: upsertReference.maxNativeZoom,
    maxZoom: upsertReference.maxZoom,
    color: upsertReference.color,
    opacity: upsertReference.opacity,
    fillColor: upsertReference.fillColor,
    fillOpacity: upsertReference.fillOpacity,
    weight: upsertReference.weight,
    createdAt: upsertReference.createdAt.toISOString(),
    updatedAt: upsertReference.updatedAt.toISOString(),
  };

  return result;
}

/**
 * Deletes a single sublayer
 * @param uuid sublayer uuid to delete
 * @returns the uuid of the deleted sublayer, or null if nothing was deleted
 */
async function deleteSublayer(uuid: string): Promise<string | null> {
  const em = getEM();
  let returnVal = uuid;
  const entity = await em.findOne(Sublayer_db, uuid);
  if (entity) {
    await em.removeAndFlush(entity);
  } else {
    returnVal = null;
  }
  return returnVal;
}

export default withIronSessionApiRoute(withORM(handleSublayer), ironOptions);
