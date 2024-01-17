import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "utils/ironSession";
import { withORM, getEM } from "utils/mikro";
import { Preset_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";
import { hasPerms } from "utils/permissions";
import { emitStoreDelete, emitStoreUpsert } from "./socketio";
import { v4 as uuidv4 } from "uuid";
import { upsertLogs } from "./log";
import _ from "lodash";

const handlePreset: NextApiHandler<WrappedResponse<Preset[] | Preset>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    const { missionId, socketId, log } = req.query;
    const intMissionId = parseInt(missionId as string);
    const logAction = log === "true";
    if (typeof intMissionId !== "number") {
      return res.status(500).json({ status: "error", message: "Mission ID must be integer." });
    }
    const editPermission = await hasPerms(intMissionId, "edit", req.session?.user);

    //Gets all Presets for a mission
    if (req.method === "GET") {
      const viewPermission = await hasPerms(intMissionId, "view", req.session.user);
      if (!viewPermission && !editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        const presets = await getPresets(intMissionId);
        return res.status(200).json({
          status: "success",
          message: "presets retrieved",
          data: presets,
        });
      } catch (error) {
        return res
          .status(500)
          .json({ status: "error", message: "Failed to get presets. : " + error });
      }
    }
    // Upsert a Preset
    if (req.method === "POST") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
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
          return res.status(500).json({
            status: "error",
            message: "Upsert response did not return a value",
            data: null,
          });
        } else {
          // emit the upserted preset to all clients via socket.io
          emitStoreUpsert({
            missionId: intMissionId,
            socketId,
            type: "preset",
            data: upsertResponse,
          } as StoreUpsert<Preset>);

          if (logAction) {
            // log this upsert to the log table
            const log: Log = {
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "presetUpsert",
              payloadJson: JSON.stringify(presetsToUpsert),
              createdAt: new Date().toISOString(),
            };
            upsertLogs([log]);
          }

          return res.status(200).json({
            status: "success",
            message: "Preset upserted",
            data: upsertResponse,
          });
        }
      } catch (error) {
        return res.status(500).json({ status: "error", message: "Failed to upsert preset." });
      }
      // Deletes a preset
    }
    if (req.method === "DELETE") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        const uuidsToDelete: string[] = req.body;
        const deletedUuids = await deletePresets(uuidsToDelete);
        if (deletedUuids.length > 0) {
          // emit the deleted preset to all clients via socket.io
          emitStoreDelete({
            missionId: intMissionId,
            socketId,
            type: "preset",
            uuids: deletedUuids,
          } as StoreDelete);

          if (logAction) {
            // log this deletion to the log table
            const log: Log = {
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "presetDelete",
              payloadJson: JSON.stringify({ uuidsToDelete }),
              createdAt: new Date().toISOString(),
            };
            upsertLogs([log]);
          }

          return res.status(200).json({
            status: "success",
            message: "Preset deleted",
          });
        } else {
          return res.status(200).json({
            status: "failure",
            message: "No such Preset found to delete",
          });
        }
      } catch (error) {
        return res.status(500).json({ status: "error", message: "Failed to delete preset." });
      }
    }
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Error in query " + e });
  }
};

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

async function upsertPresets(presets: Preset[]): Promise<Preset[]> {
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

async function deletePresets(presetUuids: string[]): Promise<string[]> {
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

export default withIronSessionApiRoute(withORM(handlePreset), ironOptions);
