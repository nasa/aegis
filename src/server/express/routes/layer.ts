import type { EntityData, Loaded } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import { ForeignKeyConstraintViolationException, QueryOrder } from "@mikro-orm/postgresql";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { Layer_db } from "server/database/models/_allModels";
import { convertLayersTypeDbToStore, convertLayersTypeStoreToDb } from "store/storeUtils/layer";
import { hasPerms } from "utils/permissions";
import { getEM } from "utils/mikro";
import { upsertDatabaseRetry } from "utils/database";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, uuid } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    uuid: uuid ? uuid.toString() : null,
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  try {
    const records: Layer[] = await getLayers(queryObj.missionId, queryObj.uuid);

    res.status(200).json({
      status: "success",
      message: "layers retrieved",
      data: records,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, layers } = req.body as LayerUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const upsertResponse: Layer[] = await upsertDatabaseRetry(() => upsertLayers(layers));

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      res.status(500).json({
        status: "error",
        message: "Failed to update layer after multiple tries",
        data: null,
      });
      return;
    }

    res.status(200).json({
      status: "success",
      message: `Layer upserted with ID ${upsertResponse.map((l) => l.uuid)}`,
      data: upsertResponse,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, layerUuids } = req.body as LayerDeleteRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedUUIDs = await deleteLayers(layerUuids);

    if (deletedUUIDs.length > 0) {
      res.status(200).json({
        status: "success",
        message: "Layer Deleted",
      });
    } else {
      res.status(404).json({
        status: "failure",
        message: "Record not found. Nothing deleted",
      });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ForeignKeyConstraintViolationException) {
      res.status(500).json({
        status: "error",
        message: "Cannot delete layer. This layer is referenced elsewhere",
      });
    } else {
      res
        .status(500)
        .json({ status: "error", message: `Error processing the DELETE request ${e}` });
    }
  }
});

export default router;

/**
 * get layer(s) from the database
 * @param missionId required. Mission ID for the layers.
 * @param layerUUID optional. UUID of the layer to retrieve
 * @returns array of layers
 */
export async function getLayers(missionId: number, layerUUID?: string): Promise<Layer[]> {
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
      const layer: Layer = convertLayersTypeDbToStore([layer_db])[0];
      return layer;
    });
  } else {
    return [];
  }
}

/**
 * Inserts or Updates layers into the database
 * @param layers the layer objects to upsert
 * @returns a copy of the layer objects that was upserted
 */
async function upsertLayers(layers: Layer[]): Promise<Layer[]> {
  const em = getEM();
  await em.begin(); // Start a transaction

  const layersToUpsert: Layer[] = cloneDeep(layers);
  const layersUpsertedToDb = [];

  try {
    for (const layerToUpsert of layersToUpsert) {
      // Convert foreign keys and upsert
      const convertedRecord: EntityData<Layer_db> = convertLayersTypeStoreToDb([layerToUpsert])[0];
      const upsertReference = await em.upsert(Layer_db, convertedRecord);

      em.persist(upsertReference);

      // Convert foreign keys back
      const convertedLayer: Layer = convertLayersTypeDbToStore([upsertReference])[0];
      layersUpsertedToDb.push(convertedLayer);
    }

    await em.commit(); // Flush and commit the transaction
  } catch (e) {
    await em.rollback(); // Rollback the transaction
    throw e; // Re-throw the error to be handled by the caller
  }

  return layersUpsertedToDb;
}

/**
 * Deletes layers
 * @param uuids layer uuids to delete
 * @returns the uuids of the deleted layers
 */
async function deleteLayers(uuids: string[]): Promise<string[]> {
  const em = getEM();
  const deletedUuids = [];
  for (const uuid of uuids) {
    const entity = await em.findOne(Layer_db, uuid);
    if (entity) {
      deletedUuids.push(uuid);
      em.remove(entity); //delete layer
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}
