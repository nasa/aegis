import type { EntityData } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";

import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { Preset_db } from "server/database/models/_allModels";
import { convertPresetsTypeDbToStore, convertPresetsTypeStoreToDb } from "store/storeUtils/preset";
import { getEM } from "utils/mikro";
import { hasPerms } from "utils/permissions";

import { emitStoreDelete, emitStoreUpsert } from "../sockets";

const router = express.Router();

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, presets } = req.body as PresetUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = await hasPerms({
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
    //add owner id to the evas
    const presetsToUpsert = presets.map((p) => {
      if (!p.ownerId) {
        return { ...p, ownerId: req.session?.appUser?.id || -1 };
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
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, socketId, presetUuids } = req.body as PresetDeleteRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = await hasPerms({
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

  const presetsToUpsert = cloneDeep(presets); //create a copy to manipulate
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
