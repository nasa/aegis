import type { EntityData } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";

import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { Preset_db } from "server/database/models/_allModels";
import { convertPresetsTypeDbToStore, convertPresetsTypeStoreToDb } from "store/storeUtils/preset";
import { hasPerms } from "utils/permissions";
import { globalValues } from "../global";

import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { upsertDatabaseRetry } from "utils/database";
import { ConsoleLogger as serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, presets } = req.body as PresetUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "preset",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: presets?.map((p) => p.uuid),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    // validate
    if (!presets || presets.length === 0) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "preset",
        appUsername: req.session?.appUser?.username,
        missionId,
        message: "No presets provided in request body",
      });
      res.status(400).json({ status: "failure", message: "No presets provided in request body" });
      return;
    }

    // Add owner id to the presets
    const presetsToUpsert = presets.map((p) => {
      if (!p.ownerId) {
        return { ...p, ownerId: req.session?.appUser?.id || -1 };
      } else {
        return p;
      }
    });

    const upsertResponse: Preset[] = await upsertDatabaseRetry(() =>
      upsertPresets(presetsToUpsert)
    );

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "preset",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: presets?.map((p) => p.uuid),
        message: "Failed to update preset after multiple tries due to optimistic locking",
        error: new Error("Failed to update preset after multiple tries due to optimistic locking"),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update preset after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    // Emit the upserted preset to all clients via socket.io
    emitStoreUpsert({
      missionId,
      socketId,
      type: "preset",
      data: upsertResponse,
    } as StoreUpsert);

    res.status(200).json({
      status: "success",
      message: "Preset upserted",
      data: upsertResponse,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "preset",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: presets?.map((p) => p.uuid),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, presetUuids } = req.body as PresetDeleteRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "preset",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: presetUuids,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedUuids = await deletePresets(presetUuids);
    if (deletedUuids.length > 0) {
      // emit the deleted preset to all clients via socket.io
      emitStoreDelete({
        missionId,
        socketId,
        type: "preset",
        uuids: deletedUuids,
      } as StoreDelete);

      res.status(200).json({
        status: "success",
        message: "Preset deleted",
      });
    } else {
      res.status(200).json({
        status: "failure",
        message: "No such Preset found to delete",
      });
    }
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "DELETE",
      responseStatus: 500,
      routeName: "preset",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: presetUuids,
      message: `Error processing the DELETE request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the DELETE request ${e}` });
  }
});

export default router;

export async function getPresets(missionId: number): Promise<Preset[]> {
  const model = globalValues.orm.em;
  const dbPresets = await model.find(Preset_db, { missionId });

  /** transform the Mikro Preset_db types into Preset types used in the Store.
   */
  return convertPresetsTypeDbToStore(dbPresets);
}

async function upsertPresets(presets: Preset[]): Promise<Preset[]> {
  const em = globalValues.orm.em;
  await em.begin(); // Start a transaction

  const presetsToUpsert = cloneDeep(presets); // Create a copy to manipulate
  const presetsUpsertedToDb = [];

  try {
    for (const presetToUpsert of presetsToUpsert) {
      const convertedPreset: EntityData<Preset_db> = convertPresetsTypeStoreToDb([
        presetToUpsert,
      ])[0];
      const upsertedPreset = await em.upsert(Preset_db, convertedPreset);

      em.persist(upsertedPreset);
      presetsUpsertedToDb.push(upsertedPreset);
    }

    await em.commit(); // Flush and commit the transaction
  } catch (e) {
    await em.rollback(); // Rollback the transaction
    throw e; // Re-throw the error to be handled by the caller
  }

  // Convert foreign keys
  return convertPresetsTypeDbToStore(presetsUpsertedToDb);
}

async function deletePresets(presetUuids: string[]): Promise<string[]> {
  const em = globalValues.orm.em;
  const deletedUuids = [];
  for (const presetUuid of presetUuids) {
    const entity = await em.findOne(Preset_db, { uuid: presetUuid });
    if (entity) {
      em.remove(entity); //delete preset
      deletedUuids.push(presetUuid);
    }
  }

  await em.flush(); //perform deletes
  return deletedUuids;
}
