import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import _ from "lodash";

import { hasPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import { EntityData } from "@mikro-orm/core";
import { v4 as uuidv4 } from "uuid";
import { Preset_db } from "server/database/models/_allModels";
import { emitStoreDelete, emitStoreUpsert } from "../sockets";
import { upsertLogs } from "./log";

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
  const queryObj = parseQuery(req.query);
  const editPermission = await hasPerms(queryObj.missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const presets = req.body as Preset[];
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
    emitStoreUpsert({
      missionId: queryObj.missionId,
      socketId: queryObj.socketId,
      type: "preset",
      data: upsertResponse,
    } as StoreUpsert<Preset>);

    if (queryObj.logAction) {
      // log this upsert to the log table
      const log: Log = {
        uuid: uuidv4(),
        missionId: queryObj.missionId,
        type: "presetUpsert",
        payloadJson: JSON.stringify(presetsToUpsert),
        createdAt: new Date().toISOString(),
      };
      upsertLogs([log]);
    }

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
  const queryObj = parseQuery(req.query);
  const editPermission = await hasPerms(queryObj.missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const uuidsToDelete: string[] = req.body;
    const deletedUuids = await deletePresets(uuidsToDelete);
    if (deletedUuids.length > 0) {
      // emit the deleted preset to all clients via socket.io
      emitStoreDelete({
        missionId: queryObj.missionId,
        socketId: queryObj.socketId,
        type: "preset",
        uuids: deletedUuids,
      } as StoreDelete);

      if (queryObj.logAction) {
        // log this deletion to the log table
        const log: Log = {
          uuid: uuidv4(),
          missionId: queryObj.missionId,
          type: "presetDelete",
          payloadJson: JSON.stringify({ uuidsToDelete }),
          createdAt: new Date().toISOString(),
        };
        upsertLogs([log]);
      }

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

  /** transform the Mikro Preset_db objects into Preset objects used in the Store.
   */
  const transformedPresets: Preset[] = [];
  for (const presetItem of dbPresets) {
    const convertedPreset: Preset = {
      uuid: presetItem.uuid,
      ownerId: presetItem.owner.id,
      missionId: presetItem.mission.id,
      name: presetItem.name,
      description: presetItem.description,
      missionPreset: presetItem.missionPreset,
      missionPresetDefault: presetItem.missionPresetDefault,
      mapSublayerControls: presetItem.mapSublayerControls,
      mapCircleControls: presetItem.mapCircleControls,
      layerOrder: presetItem.layerOrder,
      createdAt: presetItem.createdAt.toISOString(),
      updatedAt: presetItem.updatedAt.toISOString(),
    };
    transformedPresets.push(convertedPreset);
  }

  return transformedPresets;
}

export async function upsertPresets(presets: Preset[]): Promise<Preset[]> {
  const em = getEM();

  const presetsToUpsert = _.cloneDeep(presets); //create a copy to manipulate
  const presetsUpsertedToDb = [];

  for (const presetToUpsert of presetsToUpsert) {
    const em = getEM();
    const convertedPreset: EntityData<Preset_db> = {
      uuid: presetToUpsert.uuid || uuidv4(),
      owner: presetToUpsert.ownerId,
      mission: presetToUpsert.missionId,
      name: presetToUpsert.name,
      description: presetToUpsert.description,
      missionPreset: presetToUpsert.missionPreset,
      missionPresetDefault: presetToUpsert.missionPresetDefault,
      mapSublayerControls: presetToUpsert.mapSublayerControls,
      mapCircleControls: presetToUpsert.mapCircleControls,
      layerOrder: presetToUpsert.layerOrder,
      createdAt: new Date(presetToUpsert.createdAt),
      updatedAt: new Date(presetToUpsert.updatedAt),
    };
    const upsertedPreset = await em.upsert(Preset_db, convertedPreset);

    //upsert poi
    em.persist(upsertedPreset);
    presetsUpsertedToDb.push(upsertedPreset);
  }

  await em.flush();
  //convert foreign keys
  const convertedPresets = presetsUpsertedToDb.map((p) => {
    return {
      uuid: p.uuid,
      missionId: p.mission.id,
      ownerId: p.owner.id,
      name: p.name,
      description: p.description,
      missionPreset: p.missionPreset,
      missionPresetDefault: p.missionPresetDefault,
      mapSublayerControls: p.mapSublayerControls,
      mapCircleControls: p.mapCircleControls,
      layerOrder: p.layerOrder,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  });
  return convertedPresets;
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
