import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM, getEM } from "utils/mikro";
import { Preset as Preset_db } from "server/database/models/preset.model";
import { EntityData } from "@mikro-orm/core";
import { hasPerms } from "utils/permissions";
import { emitStoreDelete, emitStoreUpsert } from "./socketio";
import { v4 as uuidv4 } from "uuid";
import { upsertLog } from "./log";

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
        const presets = await getAllPresetsForMission(intMissionId);
        if (!presets) {
          return res.status(404).json({ status: "failure", message: "Presets not found" });
        }

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
      const presetToUpsert = req.body as Preset;
      try {
        const em = getEM();
        const convertedPreset: EntityData<Preset_db> = {
          uuid: presetToUpsert.uuid || uuidv4(),
          owner: presetToUpsert.ownerId || req.session.user.id,
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
        await em.persistAndFlush(upsertedPreset);
        const responsePreset: Preset = {
          uuid: upsertedPreset.uuid,
          missionId: upsertedPreset.mission.id,
          ownerId: upsertedPreset.owner.id,
          name: upsertedPreset.name,
          description: upsertedPreset.description,
          missionPreset: upsertedPreset.missionPreset,
          missionPresetDefault: upsertedPreset.missionPresetDefault,
          mapSublayerControls: upsertedPreset.mapSublayerControls,
          mapCircleControls: upsertedPreset.mapCircleControls,
          layerOrder: upsertedPreset.layerOrder,
          createdAt: upsertedPreset.createdAt.toISOString(),
          updatedAt: upsertedPreset.updatedAt.toISOString(),
        };

        // emit the upserted preset to all clients via socket.io
        emitStoreUpsert({
          missionId: intMissionId,
          socketId,
          type: "preset",
          data: [responsePreset],
        } as StoreUpsert<Preset>);

        if (logAction) {
          // log this upsert to the log table
          upsertLog({
            uuid: uuidv4(),
            missionId: intMissionId,
            type: "presetUpsert",
            payloadJson: JSON.stringify(presetToUpsert),
            createdAt: new Date().toISOString(),
          } as Log);
        }

        return res.status(200).json({
          status: "success",
          message: "Preset upserted",
          data: responsePreset,
        });
      } catch (error) {
        return res.status(500).json({ status: "error", message: "Failed to upsert preset." });
      }
      // Deletes a preset
    }
    if (req.method === "DELETE") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      const { uuid } = req.query;
      const presetUuid = Array.isArray(uuid) ? uuid[0] : uuid;

      try {
        const em = getEM();
        const presetToDelete = await em.findOne(Preset_db, { uuid: presetUuid });
        if (!presetToDelete) {
          return res.status(404).json({ status: "failure", message: "Preset not found" });
        }
        await em.removeAndFlush(presetToDelete);

        // emit the deleted preset to all clients via socket.io
        emitStoreDelete({
          missionId: intMissionId,
          socketId,
          type: "preset",
          uuid: presetToDelete.uuid,
        } as StoreDelete);

        if (logAction) {
          // log this deletion to the log table
          upsertLog({
            uuid: uuidv4(),
            missionId: intMissionId,
            type: "presetDelete",
            payloadJson: JSON.stringify({ presetUuid }),
            createdAt: new Date().toISOString(),
          } as Log);
        }

        return res.status(200).json({
          status: "success",
          message: "Preset deleted",
        });
      } catch (error) {
        return res.status(500).json({ status: "error", message: "Failed to delete preset." });
      }
    }
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Error in query " + e });
  }
};

async function getAllPresetsForMission(missionId: number): Promise<Preset[] | false> {
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

export default withIronSessionApiRoute(withORM(handlePreset), ironOptions);
