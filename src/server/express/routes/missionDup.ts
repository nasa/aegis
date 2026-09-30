import type { Request, Response } from "express";

import express from "express";

import { fetchMissionSourceData, createMissionCopy } from "utils/dup/core";
import { upsertDatabaseRetry } from "utils/database";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { globalValues } from "../global";

const router = express.Router();
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId } = req.body;

  if (!req.session?.appUser?.isSuperAdmin) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "missionDup",
      appUsername: req.session?.appUser?.username,
      missionId: missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  if (missionId === undefined || missionId === null) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "missionDup",
      appUsername: req.session?.appUser?.username,
      missionId: missionId,
      message: "missionId is required in the request body",
    });
    res
      .status(400)
      .json({ status: "failure", message: "missionId is required in the request body" });
    return;
  }

  try {
    const newMissionId: number | null = await upsertDatabaseRetry(() =>
      duplicateMission(parseInt(missionId as string))
    );

    // Check response
    if (newMissionId === null || newMissionId === undefined) {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "missionDup",
        appUsername: req.session?.appUser?.username,
        missionId: parseInt(missionId as string),
        message: "Failed to duplicate mission after multiple tries due to optimistic locking",
        error: new Error(
          "Failed to duplicate mission after multiple tries due to optimistic locking"
        ),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to duplicate mission after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    res.status(200).json({
      status: "success",
      message: `Mission duplicated. New mission ID: ${newMissionId}`,
      data: newMissionId,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "missionDup",
      appUsername: req.session?.appUser?.username,
      missionId: parseInt(missionId as string),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

export default router;

const duplicateMission = async (missionId: number): Promise<number> => {
  if (!missionId) {
    throw new Error("Mission ID is required");
  }
  const em = globalValues.orm.em;
  await em.begin(); // Start a transaction

  try {
    // 1. Fetch the original mission and related entities
    const sourceData = await fetchMissionSourceData(em, missionId);

    // 2. Create a copy of the mission with related entities
    const newMissionId = await createMissionCopy(em, sourceData, {
      nameSuffix: "Copy",
      copyAssets: true,
    });

    await em.commit(); // Commit the transaction
    return newMissionId;
  } catch (error) {
    await em.rollback(); // Rollback the transaction
    throw new Error(`Failed to duplicate mission: ${error}`);
  }
};
