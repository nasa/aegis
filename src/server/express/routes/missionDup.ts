import type { Request, Response } from "express";

import express from "express";

import { upsertDatabaseRetry } from "utils/database";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { globalValues } from "../global";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { DocHandle, AutomergeUrl } from "@automerge/automerge-repo/slim";
import { Doc_Listing_db } from "server/database/models/_allModels";
import { getAccurateNow } from "utils/formatting";
import { createAutomergeMission } from "server/express/routes/missionAutomerge";
import cloneDeep from "lodash/cloneDeep";
import { copyDirectoryContents } from "server/file/file";

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
    const newMissionId = await createMissionCopy(sourceData, {
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

/**
 * Set the new mission id on the map layer, preset, STM, and folder entities copied with the
 * mission doc. Entity uuids are preserved, so every cross-reference stays valid in the copy.
 */
const setMissionIdOnEntities = (m: Mission, missionId: number): void => {
  const collections = [m.folders, m.layers, m.sublayers, m.presets, m.stmLevel1s, m.stmRules];
  for (const collection of collections) {
    for (const entity of Object.values(collection ?? {})) {
      if ("missionId" in entity) entity.missionId = missionId;
    }
  }
};

// Main function to create a mission copy
export const createMissionCopy = async (
  sourceData: MissionSourceData,
  options: MissionCopyOptions
): Promise<number> => {
  try {
    // 1. Create new mission. All mission entities ride along on the mission doc copy.

    // We are unsure the state of the incoming original mission, so clone it in-case
    // there are existing Automerge proxy references
    const sourceMission = cloneDeep(sourceData.mission);
    const newMission: Mission = {
      ...sourceMission,
      id: null, // Let the database assign a new ID
      name: `${sourceMission.name} - ${options.nameSuffix}`,
      createdAt: getAccurateNow().getTime(),
      updatedAt: getAccurateNow().getTime(),
    };

    // create an mission automerge document; the copied entities get the assigned mission id
    const docListing: AutomergeDocListing = await createAutomergeMission(
      newMission,
      (m, missionId) => setMissionIdOnEntities(m, missionId)
    );
    // retrieve the mission object
    const missionDocHandle: DocHandle<Mission> = await globalValues.automergeRepo.find(
      docListing.automergeUrl as AutomergeUrl
    );
    await missionDocHandle.whenReady();
    const newMissionId = missionDocHandle.doc().id;

    // 2. Copy mission assets (layer tiles, grid coordinate file, etc.) if requested
    if (options.copyAssets && sourceData.mission.id) {
      await copyMissionAssets(sourceData.mission.id, newMissionId);
    }

    return newMissionId;
  } catch (error) {
    throw new Error(`Failed to create mission copy: ${error}`);
  }
};

// Fetch the source mission doc for duplication
export const fetchMissionSourceData = async (
  em: EntityManager,
  missionId: number
): Promise<MissionSourceData> => {
  const automergeDocListing = await em.findOne(Doc_Listing_db, { missionId });
  if (!automergeDocListing) {
    throw new Error(`Automerge document listing for mission ID ${missionId} not found`);
  }

  const missionDocHandle: DocHandle<Mission> = await globalValues.automergeRepo.find(
    automergeDocListing.automergeUrl as AutomergeUrl
  );
  await missionDocHandle.whenReady();
  return { mission: missionDocHandle.doc() };
};

// Copy mission assets
const copyMissionAssets = async (fromMissionId: number, toMissionId: number): Promise<void> => {
  try {
    serverLogger.info({
      logId: "duplicate",
      logValue: `Copying assets from mission ${fromMissionId} to mission ${toMissionId}`,
    });

    // Recursively copy directories and files
    await copyDirectoryContents(fromMissionId, toMissionId);

    serverLogger.info({
      logId: "duplicate",
      logValue: `Successfully copied mission assets from ${fromMissionId} to ${toMissionId}`,
    });
  } catch (error) {
    throw new Error(`Failed to copy mission assets: ${error}`);
  }
};
