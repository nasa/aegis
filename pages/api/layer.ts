import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { getEM, withORM } from "utils/mikro";
import _ from "lodash";
import { Layer as Layer_db } from "server/database/models/layer.model";
import {
  EntityData,
  ForeignKeyConstraintViolationException,
  Loaded,
  QueryOrder,
} from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { roundDateToSecond } from "utils/formatting";
import { hasPerms } from "utils/permissions";

/**
 * /api/layer
 *
 * API endpoint for layer
 *
 * The request method will determine what action to perform
 *    GET = get all, subset, or single record
 *      Required URL parameters are:
 *        missionId=  mission ID number
 *      Opitonal URL parameters are:
 *        uuid= uuid of the layer to retrieve
 *    POST = upsert a layer (defined in POST body) into the DB
 *      A full layer object (with an uuid for new layers) should be specified in the request body
 *    DELETE = delete the layer for a given layer uuid
 *       Required URL parameters are:
 *        uuid=  uuid of the layer to delete
 */
const handleLayer: NextApiHandler<WrappedResponse<Layer[] | Layer>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    const { uuid } = req.query;
    const missionId = req.query.missionId ? req.query.missionId : req.body.missionId;
    const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
    const layerUUID = Array.isArray(uuid) ? uuid[0] : uuid;
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

        const records: Layer[] = await getLayers(intMissionId, layerUUID);

        return res.status(200).json({
          status: "success",
          message: "layers retrieved",
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
        const upsertObject: Layer = req.body as Layer;
        const upsertResponse: Layer = await upsertLayer(upsertObject);

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
            message: `Layer upserted with ID ${upsertResponse.uuid}`,
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
        const deletedUUID = await deleteLayer(layerUUID);

        if (deletedUUID) {
          return res.status(200).json({
            status: "success",
            message: "Layer Deleted",
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
            message: "Cannot delete layer. This layer is referenced elsewhere",
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
 * get layer(s) from the database
 * @param missionId required. Mission ID for the layers.
 * @param layerUUID optional. UUID of the layer to retrieve
 * @returns array of layers
 */
async function getLayers(missionId: number, layerUUID?: string): Promise<Layer[]> {
  const em = getEM();

  let layers_db: Loaded<Layer_db, never>[];
  if (layerUUID) {
    //find by layer uuid
    layers_db = await em.find(
      Layer_db,
      { uuid: layerUUID },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
  } else {
    //find by mission id
    layers_db = await em.find(
      Layer_db,
      { mission: { id: missionId } },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
  }

  if (layers_db) {
    //convert fks
    return layers_db.map((layer_db) => {
      const layer: Layer = {
        uuid: layer_db.uuid,
        missionId: layer_db.mission.id,
        name: layer_db.name,
        createdAt: layer_db.createdAt.toISOString(),
        updatedAt: layer_db.updatedAt.toISOString(),
      };
      return layer;
    });
  } else {
    return [];
  }
}

/**
 * Inserts or Updates a layer into the database
 * @param layer the layer object to upsert
 * @returns a copy of the layer object that was upserted
 */
async function upsertLayer(layer: Layer): Promise<Layer> {
  const em = getEM();
  const upsertRecord: Layer = _.cloneDeep(layer);

  const updateDateString = roundDateToSecond(new Date()).toISOString();

  //convert fks and upsert
  const convertedRecord: EntityData<Layer_db> = {
    uuid: upsertRecord.uuid || uuidv4(),
    mission: upsertRecord.missionId,
    name: upsertRecord.name,
    createdAt: new Date(upsertRecord.createdAt || updateDateString),
    updatedAt: new Date(updateDateString),
  };
  const upsertReference = await em.upsert(Layer_db, convertedRecord);

  await em.persistAndFlush(upsertReference);

  //convert fks back
  const result: Layer = {
    uuid: upsertReference.uuid,
    missionId: upsertReference.mission.id,
    name: upsertReference.name,
    createdAt: upsertReference.createdAt.toISOString(),
    updatedAt: upsertReference.updatedAt.toISOString(),
  };

  return result;
}

/**
 * Deletes a single layer
 * @param uuid layer uuid to delete
 * @returns the uuid of the deleted layer, or null if nothing was deleted
 */
async function deleteLayer(uuid: string): Promise<string | null> {
  const em = getEM();
  let returnVal = uuid;
  const entity = await em.findOne(Layer_db, uuid);
  if (entity) {
    await em.removeAndFlush(entity);
  } else {
    returnVal = null;
  }
  return returnVal;
}

export default withIronSessionApiRoute(withORM(handleLayer), ironOptions);
