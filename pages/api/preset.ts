import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM, getEM } from "utils/mikro";
import { Preset as Preset_db } from "server/database/models/preset.model";
import { roundDateToSecond } from "utils/formatting";
import { EntityData } from "@mikro-orm/core";

const handlePreset: NextApiHandler<WrappedResponse<Preset[] | Preset>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    const missionId = req.query.missionId ? req.query.missionId : req.body.missionId;
    const editPermission = req.session?.user?.permissionList.find(
      (p) => p.missionId == parseInt(missionId)
    )?.permissions.edit;
    const viewPermission = req.session?.user?.permissionList.find(
      (p) => p.missionId == parseInt(missionId)
    )?.permissions.view;

    if (editPermission || viewPermission) {
      //Gets all Presets for a mission
      if (req.method === "GET") {
        const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
        if (typeof intMissionId !== "number") {
          return res.status(500).json({ status: "error", message: "Mission ID must be integer." });
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
        const presetBody = req.body.preset as Preset;
        if (!editPermission) {
          return res.status(401).json({ status: "failure", message: "Unauthorized" });
        }
        if (req.session?.user) {
          try {
            const em = getEM();
            const updateDateString = roundDateToSecond(new Date()).toISOString();
            const convertedPreset: EntityData<Preset_db> = {
              uuid: presetBody.uuid,
              owner: presetBody.ownerId,
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
        } else {
          return res.status(401).json({ status: "failure", message: "Unauthorized" });
        }
        // Deletes a preset
      }
      if (req.method === "DELETE") {
        if (!editPermission) {
          return res.status(401).json({ status: "failure", message: "Unauthorized" });
        }
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
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: "error", message: "Failed to get presets. : " + e });
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
