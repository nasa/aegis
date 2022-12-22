import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import _ from "lodash";
import { Layer as Layer_db } from "server/database/models/layer.model";
import { ForeignKeyConstraintViolationException, QueryOrder } from "@mikro-orm/core";
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
 *    POST = upsert a layer (defined in POST body) into the DB
 *      A full layer object (with an uuid for new layers) should be specified in the request body
 *    DELETE = delete the mission for a given missionId
 *       Required URL parameters are:
 *        uuid=  uuid of the layer to delete
 */
export async function handleLayer(req: NextApiRequest, res: NextApiResponse): Promise<unknown> {
  try {
    if (req.session?.user) {
      const { missionId, uuid } = req.query;

      // retrieve record
      if (req.method === "GET") {
        try {
          const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
          if (intMissionId && _.isNaN(intMissionId)) {
            return res.status(500).json({ status: "error", message: "Invalid mission ID" });
          }

          const records: Layer[] = await getLayers(intMissionId);

          if (records.length === 0) {
            return res.status(404).json({
              status: "failure",
              message: "No layers found",
              data: records,
            });
          } else {
            return res.status(200).json({
              status: "success",
              message: "layers retrieved",
              data: records,
            });
          }
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
          const layerUUID = Array.isArray(uuid) ? uuid[0] : uuid;
          const deletedUUID = await deleteLayer(layerUUID);

          if (deletedUUID) {
            return res.status(200).json({
              status: "success",
              message: "Layer Deleted",
              data: deletedUUID,
            });
          } else {
            return res.status(404).json({
              status: "failure",
              message: "Record not found. Nothing deleted",
              data: null,
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
}

/**
 * get layer(s) from the database
 * @param missionId the mission id.
 * @returns array of layers
 */
export async function getLayers(missionId: number, layerUUID?: string): Promise<Layer[]> {
  await Mikro.getORM();
  const em = Mikro.getEM();

  let layers;
  if (layerUUID) {
    layers = await em.find(
      Layer_db,
      { uuid: layerUUID },
      { orderBy: [{ layerConfig: { name: QueryOrder.ASC } }] }
    );
  } else {
    layers = await em.find(
      Layer_db,
      { mission: { id: missionId } },
      { orderBy: [{ layerConfig: { name: QueryOrder.ASC } }] }
    );
  }

  await Mikro.closeORM();
  return layers;
}

/**
 * Inserts or Updates a layer into the database
 * @param layer the layer object to upsert
 * @returns a copy of the layer object that was upserted
 */
export async function upsertLayer(layer: Layer): Promise<Layer> {
  await Mikro.getORM();
  const em = Mikro.getEM();

  const updateDate = new Date();
  const upsertRecord = _.cloneDeep(layer);
  upsertRecord.layerConfig.time.current = updateDate; //the time property on this config item is the save date
  upsertRecord.updatedAt = updateDate;

  if (!layer.uuid) {
    upsertRecord.createdAt = updateDate;
    upsertRecord.uuid = uuidv4();
  }

  const upsertReference = await em.upsert(Layer_db, upsertRecord);

  await em.persistAndFlush(upsertReference);
  await Mikro.closeORM();

  const result: Layer = {
    ...upsertReference,
    mission: upsertReference.mission.id,
  };

  return result;
}

/**
 * Deletes a single layer
 * @param uuid layer uuid to delete
 * @returns the uuid of the deleted layer
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
