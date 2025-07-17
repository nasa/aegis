import express, { Request, Response } from "express";
import { getEM } from "utils/mikro";
import { fetchMissionEntities, createMissionCopy } from "utils/dup/core";

const router = express.Router();

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId } = req.body;

  if (!req.session?.appUser?.isSuperAdmin) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  if (missionId === undefined || missionId === null) {
    res
      .status(400)
      .json({ status: "failure", message: "missionId is required in the request body" });
    return;
  }

  try {
    // duplicate mission
    const newMissionId = await duplicateMission(parseInt(missionId as string));

    res.status(200).json({
      status: "success",
      message: `mission duplicated. New mission ID: ${newMissionId}`,
      data: newMissionId,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

export default router;

const duplicateMission = async (missionId: number | undefined): Promise<number> => {
  if (!missionId) {
    throw new Error("Mission ID is required");
  }
  const em = getEM();

  try {
    // 1. Fetch the original mission and related entities
    const sourceData = await fetchMissionEntities(em, missionId);

    // 2. Create a copy of the mission with related entities
    const newMissionId = await createMissionCopy(em, sourceData, {
      nameSuffix: "Copy",
      copyAssets: true,
    });

    return newMissionId;
  } catch (error) {
    throw new Error(`Failed to duplicate mission: ${error}`);
  }
};
