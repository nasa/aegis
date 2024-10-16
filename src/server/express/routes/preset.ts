import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import _ from "lodash";

import { hasPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import { EntityData } from "@mikro-orm/core";
import { Preset_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { convertPresetsTypeDbToStore, convertPresetsTypeStoreToDb } from "store/storeUtils/preset";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, socketId, log } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    socketId: socketId ? (socketId as string) : undefined,
    logAction: log === "true",
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const viewPermission = await hasPerms(queryObj.missionId, "view", req.session.user);
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || _.isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  try {
    const presets = await getPresets(queryObj.missionId);
    res.status(200).json({
      status: "success",
      message: "presets retrieved",
      data: presets,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, log, presets } = req.body as PresetUpsertRequest;
  const editPermission = await hasPerms(missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    //add owner id to the evas
    const presetsToUpsert = presets.map((p) => {
      if (!p.ownerId) {
        return { ...p, ownerId: req.session.user.id };
      } else {
        return p;
      }
    });
    const upsertResponse: Preset[] = await upsertPresets(presetsToUpsert);
    //check response
    if (upsertResponse.length === 0) {
      res.status(500).json({
        status: "error",
        message: "Upsert response did not return a value",
        data: null,
      });
      return;
    }
    // emit the upserted preset to all clients via socket.io
    emitStoreUpsert(
      {
        missionId,
        socketId,
        type: "preset",
        data: upsertResponse,
      } as StoreUpsert,
      log
    );

    res.status(200).json({
      status: "success",
      message: "Preset upserted",
      data: upsertResponse,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, log, presetUuids } = req.body as PresetDeleteRequest;
  const editPermission = await hasPerms(missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedUuids = await deletePresets(presetUuids);
    if (deletedUuids.length > 0) {
      // emit the deleted preset to all clients via socket.io
      emitStoreDelete(
        {
          missionId,
          socketId,
          type: "preset",
          uuids: deletedUuids,
        } as StoreDelete,
        log
      );

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
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the DELETE request ${e}` });
  }
});

export default router;

export async function getPresets(missionId: number): Promise<Preset[]> {
  const model = getEM();
  const dbPresets = await model.find(Preset_db, { mission: missionId });

  /** transform the Mikro Preset_db types into Preset types used in the Store.
   */
  return convertPresetsTypeDbToStore(dbPresets);
}

export async function upsertPresets(presets: Preset[]): Promise<Preset[]> {
  const em = getEM();

  const presetsToUpsert = _.cloneDeep(presets); //create a copy to manipulate
  const presetsUpsertedToDb = [];

  for (const presetToUpsert of presetsToUpsert) {
    const em = getEM();
    const convertedPreset: EntityData<Preset_db> = convertPresetsTypeStoreToDb([presetToUpsert])[0];
    const upsertedPreset = await em.upsert(Preset_db, convertedPreset);

    //upsert poi
    em.persist(upsertedPreset);
    presetsUpsertedToDb.push(upsertedPreset);
  }

  await em.flush();
  //convert foreign keys
  return convertPresetsTypeDbToStore(presetsUpsertedToDb);
}

export async function deletePresets(presetUuids: string[]): Promise<string[]> {
  const em = getEM();
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
