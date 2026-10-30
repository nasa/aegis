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
import { emssTokenIsValid } from "utils/permissions";

const router = express.Router();
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId } = req.body;
  const emssToken = req.headers["emss-token"] as string;

  if (!req.session?.appUser?.isSuperAdmin && !emssTokenIsValid(emssToken)) {
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

  const parsedMissionId = Number(missionId);
  if (
    (typeof missionId !== "number" && typeof missionId !== "string") ||
    !Number.isSafeInteger(parsedMissionId) ||
    parsedMissionId <= 0
  ) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "missionDup",
      appUsername: req.session?.appUser?.username,
      missionId: missionId,
      message: "missionId must be a positive integer",
    });
    res.status(400).json({ status: "failure", message: "missionId must be a positive integer" });
    return;
  }

  // Keep existing API clients on JSON; the admin UI opts into progress streaming.
  const streamProgress = req.get("Accept")?.includes("application/x-ndjson");
  const startedAt = Date.now();
  let progressMessage = "Loading source mission...";
  const writeProgress = (message = progressMessage) => {
    progressMessage = message;
    if (streamProgress && !res.destroyed && !res.writableEnded) {
      const progress: MissionDuplicationProgress = {
        type: "progress",
        message,
        elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
      };
      res.write(`${JSON.stringify(progress)}\n`);
    }
  };
  const sendResult = (statusCode: number, response: WrappedResponse<number>) => {
    if (res.destroyed || res.writableEnded) return;
    if (streamProgress) {
      // Headers are already sent; the final event carries success or failure.
      res.end(`${JSON.stringify(response)}\n`);
    } else {
      res.status(statusCode).json(response);
    }
  };
  if (streamProgress) {
    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    writeProgress();
  }
  // GIS file copies can be silent for minutes. Send traffic through every proxy.
  const heartbeat = streamProgress ? setInterval(writeProgress, 10_000) : undefined;
  const stopHeartbeat = () => clearInterval(heartbeat);
  res.once("close", stopHeartbeat);

  try {
    const newMissionId: number | null = await upsertDatabaseRetry(() =>
      duplicateMission(parsedMissionId, writeProgress)
    );

    // Check response
    if (newMissionId === null || newMissionId === undefined) {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "missionDup",
        appUsername: req.session?.appUser?.username,
        missionId: parsedMissionId,
        message: "Failed to duplicate mission after multiple tries due to optimistic locking",
        error: new Error(
          "Failed to duplicate mission after multiple tries due to optimistic locking"
        ),
      });
      sendResult(500, {
        status: "error",
        message: "Failed to duplicate mission after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    sendResult(200, {
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
      missionId: parsedMissionId,
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    sendResult(500, { status: "error", message: `Error processing the POST request ${e}` });
  } finally {
    stopHeartbeat();
    res.off("close", stopHeartbeat);
  }
});

export default router;

const duplicateMission = async (
  missionId: number,
  onProgress: (message: string) => void
): Promise<number> => {
  if (!missionId) {
    throw new Error("Mission ID is required");
  }
  const em = globalValues.orm.em;
  await em.begin(); // Start a transaction

  try {
    // 1. Fetch the original mission and related entities
    const sourceData = await fetchMissionSourceData(em, missionId);

    // 2. Create a copy of the mission with related entities
    onProgress("Creating mission copy...");
    const newMissionId = await createMissionCopy(
      sourceData,
      { nameSuffix: "Copy", copyGISAssets: true },
      onProgress
    );

    onProgress("Saving duplicated mission...");
    await em.commit(); // Commit the transaction
    return newMissionId;
  } catch (error) {
    await em.rollback(); // Rollback the transaction
    throw new Error(`Failed to duplicate mission: ${error}`);
  }
};

// Main function to create a mission copy
export const createMissionCopy = async (
  sourceData: MissionSourceData,
  options: MissionCopyOptions,
  onProgress?: (message: string) => void
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

    // create an mission automerge document; entities ride along and are scoped by the new doc
    const docListing: AutomergeDocListing = await createAutomergeMission(newMission);
    // retrieve the mission object
    const missionDocHandle: DocHandle<Mission> = await globalValues.automergeRepo.find(
      docListing.automergeUrl as AutomergeUrl
    );
    await missionDocHandle.whenReady();
    const newMissionId = missionDocHandle.doc().id;

    // Scramble the connection event maestro id/url on any REXes
    missionDocHandle.change((m) => {
      for (const rex of Object.values(m.rexes ?? {})) {
        if (rex.maestroEventId || rex.maestroEventUrl) {
          rex.maestroEventId = "DupRexDisconnectedFromMaestro";
          rex.maestroEventUrl = "DupRexDisconnectedFromMaestro";
        }
      }
    });

    // 2. Copy mission GIS assets (layer tiles, grid coordinate file, etc.) if requested
    if (options.copyGISAssets && sourceData.mission.id) {
      onProgress?.("Copying GIS files...");
      await copyMissionGISAssets(sourceData.mission.id, newMissionId);
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

// Copy mission GIS assets
const copyMissionGISAssets = async (fromMissionId: number, toMissionId: number): Promise<void> => {
  try {
    serverLogger.info({
      logId: "duplicate",
      logValue: `Copying GIS assets from mission ${fromMissionId} to mission ${toMissionId}`,
    });

    // Recursively copy directories and files
    await copyDirectoryContents(fromMissionId, toMissionId);

    serverLogger.info({
      logId: "duplicate",
      logValue: `Successfully copied mission GIS assets from ${fromMissionId} to ${toMissionId}`,
    });
  } catch (error) {
    throw new Error(`Failed to copy mission GIS assets: ${error}`);
  }
};
