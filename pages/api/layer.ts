import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import _ from "lodash";
import { Layer as Layer_db } from "server/database/models/layer.model";
import { ForeignKeyConstraintViolationException } from "@mikro-orm/core";

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
          const reference = await deleteLayer(layerUUID);

          return res.status(200).json({
            status: "success",
            message: "Layer Deleted",
            data: reference,
          });
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
    layers = await em.find(Layer_db, { uuid: layerUUID });
  } else {
    layers = await em.find(Layer_db, { mission: { id: missionId } });
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

  layer.updatedAt = new Date();
  layer.createdAt = layer.createdAt || new Date();
  const upsertReference = await em.upsert(Layer_db, layer);

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
 */
export async function deleteLayer(uuid: string): Promise<Layer_db> {
  await Mikro.getORM();
  const em = Mikro.getEM();
  const recordReference = em.getReference(Layer_db, uuid);
  await em.removeAndFlush(recordReference);
  await Mikro.closeORM();
  return recordReference;
}

export default withIronSessionApiRoute(Mikro.withORM(handleLayer), ironOptions);
