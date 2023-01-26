import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM, getEM } from "utils/mikro";
import { Preset as Preset_db } from "../../server/database/models/preset.model";
import { roundDateToSecond } from "../../utils/formatting";
import { EntityData } from "@mikro-orm/core";

const handlePreset: NextApiHandler<WrappedResponse<Preset[] | Preset>> = async (
  req,
  res
): Promise<unknown> => {
  //Gets all Presets for a mission
  if (req.method === "GET" && req.query.missionId) {
    const {
      query: { missionId },
    } = req;
    const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
    if (typeof intMissionId !== "number") {
      return res.status(500).json({ status: "error", message: "Mission ID must be integer." });
    }
    try {
      if (req.session?.user) {
        const presets = await getAllPresetsForMission(intMissionId);
        if (!presets) {
          return res.status(404).json({ status: "failure", message: "Presets not found" });
        }

        return res.status(200).json({
          status: "success",
          message: "presets retrieved",
          data: presets,
        });
      } else {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
    } catch (error) {
      return res
        .status(500)
        .json({ status: "error", message: "Failed to get presets. : " + error });
    }
    // Upserts a preset
  } else if (req.method === "POST") {
    const presetBody = req.body.preset as Preset;
    if (req.session?.user) {
      try {
        const em = getEM();
        const presetToUpsert: EntityData<Preset_db> = {
          uuid: presetBody.uuid,
          owner: presetBody.ownerId,
          mission: presetBody.missionId,
          name: presetBody.name,
          description: presetBody.description,
          missionPreset: presetBody.missionPreset,
          missionPresetDefault: presetBody.missionPresetDefault,
          layerControls: presetBody.layerControls,
          createdAt: presetBody.createdAt || roundDateToSecond(new Date()),
          updatedAt: roundDateToSecond(new Date()),
        };
        const upsertedPreset = await em.upsert(Preset_db, presetToUpsert);
        await em.persistAndFlush(upsertedPreset);
        const responsePreset: Preset = {
          uuid: upsertedPreset.uuid,
          missionId: upsertedPreset.mission.id,
          ownerId: upsertedPreset.owner.id,
          name: upsertedPreset.name,
          description: upsertedPreset.description,
          missionPreset: upsertedPreset.missionPreset,
          missionPresetDefault: upsertedPreset.missionPresetDefault,
          layerControls: upsertedPreset.layerControls,
          createdAt: upsertedPreset.createdAt,
          updatedAt: upsertedPreset.updatedAt,
        };
        return res.status(200).json({
          status: "success",
          message: "Preset upserted",
          data: responsePreset,
        });
      } catch (error) {
        return res.status(500).json({ status: "error", message: "Failed to upsert preset." });
      }
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
    // Deletes a preset
  } else if (req.method === "DELETE") {
    const {
      query: { uuid },
    } = req;
    if (req.session?.user) {
      try {
        const em = getEM();
        const presetToDelete = await em.findOne(Preset_db, { uuid });
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
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } else {
    return res.status(405).json({ status: "failure", message: "Method not allowed" });
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
      layerControls: presetItem.layerControls,
      createdAt: presetItem.createdAt,
      updatedAt: presetItem.updatedAt,
    };
    transformedPresets.push(convertedPreset);
  }

  return transformedPresets;
}

export default withIronSessionApiRoute(withORM(handlePreset), ironOptions);
