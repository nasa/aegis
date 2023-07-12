import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM, getEM } from "utils/mikro";
import { Preset as Preset_db } from "server/database/models/preset.model";
import { roundDateToSecond } from "utils/formatting";
import { EntityData } from "@mikro-orm/core";
import { hasPerms } from "utils/permissions";

const handlePreset: NextApiHandler<WrappedResponse<Preset[] | Preset>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    const missionId = req.query.missionId ? req.query.missionId : req.body.missionId;
    const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
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
      const presetBody = req.body as Preset;
      try {
        const em = getEM();
        const updateDateString = roundDateToSecond(new Date()).toISOString();
        const convertedPreset: EntityData<Preset_db> = {
          uuid: presetBody.uuid,
          owner: presetBody.ownerId || req.session.user.id,
          mission: presetBody.missionId,
          name: presetBody.name,
          description: presetBody.description,
          missionPreset: presetBody.missionPreset,
          missionPresetDefault: presetBody.missionPresetDefault,
          mapLayerControls: presetBody.mapLayerControls,
          layerOrder: presetBody.layerOrder,
          createdAt: new Date(presetBody.createdAt || updateDateString),
          updatedAt: new Date(updateDateString),
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
          mapLayerControls: upsertedPreset.mapLayerControls,
          layerOrder: upsertedPreset.layerOrder,
          createdAt: upsertedPreset.createdAt.toISOString(),
          updatedAt: upsertedPreset.updatedAt.toISOString(),
        };
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
      const poiUuid = Array.isArray(uuid) ? uuid[0] : uuid;

      try {
        const em = getEM();
        const presetToDelete = await em.findOne(Preset_db, { uuid: poiUuid });
        if (!presetToDelete) {
          return res.status(404).json({ status: "failure", message: "Preset not found" });
        }
        await em.removeAndFlush(presetToDelete);
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
      mapLayerControls: presetItem.mapLayerControls,
      layerOrder: presetItem.layerOrder,
      createdAt: presetItem.createdAt.toISOString(),
      updatedAt: presetItem.updatedAt.toISOString(),
    };
    transformedPresets.push(convertedPreset);
  }

  return transformedPresets;
}

export default withIronSessionApiRoute(withORM(handlePreset), ironOptions);
