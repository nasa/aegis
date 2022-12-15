import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { Preset as Preset_db } from "../../server/database/models/preset.model";
import { roundDateToSecond } from "../../utils/formatting";

export const handlePreset: NextApiHandler<WrappedResponse<Preset[] | Preset>> = async (
  req,
  res
): Promise<unknown> => {
  //Gets all Presets for a mission
  if (req.method === "GET" && req.query.missionID) {
    const {
      query: { missionID },
    } = req;
    const intMissionId = parseInt(Array.isArray(missionID) ? missionID[0] : missionID);
    if (typeof intMissionId !== "number") {
      return res.status(500).json({ status: "error", message: "Mission ID must be integer." });
    }
    try {
      if (req.session?.user) {
        const presets = await getAllPresetsForMission(intMissionId);
        await Mikro.closeORM();
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
      return res.status(500).json({ status: "error", message: "Failed to find presets." });
    }
    // Upserts a preset
  } else if (req.method === "POST") {
    const presetBody = req.body.preset as Preset;
    if (req.session?.user) {
      try {
        await Mikro.getORM();
        const em = await Mikro.getEM();
        const presetToUpsert = {
          ...presetBody,
          createdAt: presetBody.createdAt || roundDateToSecond(new Date()),
          updatedAt: roundDateToSecond(new Date()),
        };
        const upsertedPreset = await em.upsert(Preset_db, presetToUpsert);
        await em.persistAndFlush(upsertedPreset);
        await Mikro.closeORM();
        const responsePreset: Preset = {
          ...upsertedPreset,
          mission: upsertedPreset.mission.id,
          owner: upsertedPreset.owner.id,
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
        await Mikro.getORM();
        const em = await Mikro.getEM();
        const presetToDelete = await em.findOne(Preset_db, { uuid });
        if (!presetToDelete) {
          return res.status(404).json({ status: "failure", message: "Preset not found" });
        }
        await em.removeAndFlush(presetToDelete);
        await Mikro.closeORM();
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

export default withIronSessionApiRoute(Mikro.withORM(handlePreset), ironOptions);

export async function getAllPresetsForMission(missionId: number): Promise<Preset[] | false> {
  await Mikro.getORM();
  const model = await Mikro.getEM();
  const presets = await model.find(Preset_db, { mission: missionId });

  /** transform the Mikro Preset_db objects into Preset objects used in the Store.
   */
  const transformedPresets: Preset[] = [];
  for (const presetItem of presets) {
    const convertedPreset: Preset = {
      ...presetItem,
      owner: presetItem.owner.id,
      mission: presetItem.mission.id,
    };
    transformedPresets.push(convertedPreset);
  }

  return transformedPresets;
}
