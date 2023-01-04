import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import _ from "lodash";
import { Layer as Layer_db } from "server/database/models/layer.model";
import { ForeignKeyConstraintViolationException, Loaded, QueryOrder } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";

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
export const handleLayer: NextApiHandler<WrappedResponse<Layer[] | Layer>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    if (req.session?.user) {
      const { missionId, uuid } = req.query;
      const layerUUID = Array.isArray(uuid) ? uuid[0] : uuid;
      const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);

      // retrieve record
      if (req.method === "GET") {
        try {
          if (!intMissionId || _.isNaN(intMissionId)) {
            return res.status(500).json({ status: "error", message: "Invalid mission ID" });
          }

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
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: "error", message: "Error in query" });
  }
};

/**
 * get layer(s) from the database
 * @param missionId required. Mission ID for the layers.
 * @param layerUUID optional. UUID of the layer to retrieve
 * @returns array of layers
 */
export async function getLayers(missionId: number, layerUUID?: string): Promise<Layer[]> {
  await Mikro.getORM();
  const em = Mikro.getEM();

  let layers: Loaded<Layer_db, never>[];
  if (layerUUID) {
    //find by layer uuid
    layers = await em.find(
      Layer_db,
      { uuid: layerUUID },
      { orderBy: [{ layerConfig: { name: QueryOrder.ASC } }] }
    );
  } else {
    //find by mission id
    layers = await em.find(
      Layer_db,
      { mission: { id: missionId } },
      { orderBy: [{ layerConfig: { name: QueryOrder.ASC } }] }
    );
  }

  await Mikro.closeORM();

  if (layers) {
    //convert fks
    const convertedLayers = layers.map((layers_db) => {
      const layer = { ...layers_db, missionId: layers_db.mission.id };
      delete layer.mission;
      return layer;
    });
    return convertedLayers;
  } else {
    return [];
  }
}

/**
 * Inserts or Updates a layer into the database
 * @param layer the layer object to upsert
 * @returns a copy of the layer object that was upserted
 */
export async function upsertLayer(layer: Layer): Promise<Layer> {
  await Mikro.getORM();
  const em = Mikro.getEM();

  const upsertRecord: Layer = _.cloneDeep(layer);

  const updateDate = new Date();
  upsertRecord.layerConfig.time.current = updateDate; //the time property on this config item is the save date
  upsertRecord.updatedAt = updateDate;
  //we're creating a new record
  if (!layer.uuid) {
    upsertRecord.createdAt = updateDate;
    upsertRecord.uuid = uuidv4();
  }

  //convert fks and upsert
  const convertedRecord = { ...upsertRecord, mission: upsertRecord.missionId };
  delete convertedRecord.missionId;
  const upsertReference = await em.upsert(Layer_db, convertedRecord);

  await em.persistAndFlush(upsertReference);
  await Mikro.closeORM();

  //convert fks back
  const result: Layer = {
    ...upsertReference,
    missionId: upsertReference.mission.id,
  };

  return result;
}

/**
 * Deletes a single layer
 * @param uuid layer uuid to delete
 * @returns the uuid of the deleted layer, or null if nothing was deleted
 */
export async function deleteLayer(uuid: string): Promise<string | null> {
  await Mikro.getORM();
  const em = Mikro.getEM();
  let returnVal = uuid;
  const entity = await em.findOne(Layer_db, uuid);
  if (entity) {
    await em.removeAndFlush(entity);
  } else {
    returnVal = null;
  }
  await Mikro.closeORM();
  return returnVal;
}

export default withIronSessionApiRoute(Mikro.withORM(handleLayer), ironOptions);
