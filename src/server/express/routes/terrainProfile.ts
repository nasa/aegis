import path from "node:path";
import { performance } from "node:perf_hooks";
import type { Request, Response } from "express";
import { asError } from "@emss/utils";

import express from "express";

import {
  MAX_RASTER_PROFILE_SAMPLES,
  readTerrainProfileInWorker,
} from "server/terrain/readTerrainProfile";
import {
  RasterSamplingWorkerPoolSupersededError,
  RasterSamplingWorkerPoolUnavailableError,
} from "server/raster/rasterSamplingWorkerPool";
import { serverLogger } from "utils/logging/serverLogger";
import { apiHasPerms, logUsername } from "utils/permissionsServer";

import { getAutomergeMissionHandle } from "./missionAutomerge";

const router = express.Router();
const ENTITY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const samplesForDistance = (distance: number, resolutionMeters: number): number =>
  Math.max(2, Math.ceil(distance / resolutionMeters) + 1);

const missionIdFromRequest = (req: Request): number | undefined => {
  const value = req.query.missionId;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  const missionId = Number(value);
  return Number.isSafeInteger(missionId) && missionId > 0 ? missionId : undefined;
};

export const validateTerrainProfileRequest = (
  postData: TerrainProfilePostData,
  resolutionMeters: number
): {
  path: { lat: number; lng: number }[];
  samplesPerSegment: number[];
  entityKey?: string;
  getElevationOnly: boolean;
} => {
  if (!Array.isArray(postData?.path) || postData.path.length < 2) {
    throw new Error("Terrain profile path must contain at least two points");
  }
  if (
    !postData.path.every(
      (point) =>
        point &&
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng) &&
        point.lat >= -90 &&
        point.lat <= 90 &&
        point.lng >= -180 &&
        point.lng <= 180
    )
  ) {
    throw new Error("Terrain profile path contains invalid coordinates");
  }
  if (
    !Array.isArray(postData.pathSegmentDistances) ||
    postData.pathSegmentDistances.length !== postData.path.length - 1 ||
    !postData.pathSegmentDistances.every((distance) => Number.isFinite(distance) && distance >= 0)
  ) {
    throw new Error("Terrain profile segment distances are invalid");
  }
  if (!Number.isFinite(resolutionMeters) || resolutionMeters <= 0) {
    throw new Error("Mission DEM resolution must be positive");
  }
  if (
    postData.entityKey !== undefined &&
    (typeof postData.entityKey !== "string" || !ENTITY_KEY_PATTERN.test(postData.entityKey))
  ) {
    throw new Error("Terrain profile entity key must be 1-64 safe characters");
  }
  if (postData.getElevationOnly !== undefined && typeof postData.getElevationOnly !== "boolean") {
    throw new Error("Terrain profile elevation-only flag must be a boolean");
  }

  const samplesPerSegment = postData.pathSegmentDistances.map((distance) =>
    samplesForDistance(distance, resolutionMeters)
  );
  const totalSamples = samplesPerSegment.reduce((sum, count) => sum + count, 0);
  if (totalSamples > MAX_RASTER_PROFILE_SAMPLES) {
    throw new Error(`Terrain profile exceeds the ${MAX_RASTER_PROFILE_SAMPLES} sample limit`);
  }
  return {
    path: postData.path,
    samplesPerSegment,
    entityKey: postData.entityKey,
    getElevationOnly: postData.getElevationOnly ?? false,
  };
};

const respondWithRasterRouteError = (
  res: Response,
  req: Request,
  routeName: string,
  missionId: number | undefined,
  error: unknown
): void => {
  const message = asError(error).message;

  if (error instanceof RasterSamplingWorkerPoolSupersededError) {
    serverLogger.debug({
      logId: "API Route",
      logValue: `POST 409 ${routeName} ${message}`,
      missionId,
    });
    res.status(409).json({ status: "error", message });
    return;
  }

  const workerUnavailable = error instanceof RasterSamplingWorkerPoolUnavailableError;
  const clientError =
    message.includes("must") ||
    message.includes("invalid") ||
    message.includes("limit") ||
    message.includes("configured") ||
    message.includes("contain");
  const responseStatus = workerUnavailable ? 503 : clientError ? 400 : 500;
  serverLogger.apiRoute({
    logLevel: responseStatus === 400 ? "notice" : responseStatus === 503 ? "warning" : "error",
    httpMethod: "POST",
    responseStatus,
    routeName,
    appUsername: logUsername(req.currentUser),
    missionId,
    message,
    error: asError(error),
  });
  res.status(responseStatus).json({ status: "error", message });
};

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const missionId = missionIdFromRequest(req);
  if (!missionId) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "terrain-profile",
      appUsername: logUsername(req.currentUser),
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  const permitted = apiHasPerms({
    missionId,
    requiredPermLevel: "viewer",
    user: req.currentUser,
  });
  if (!permitted) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "terrain-profile",
      appUsername: logUsername(req.currentUser),
      missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  const routeStartedAt = performance.now();
  try {
    const missionHandle = await getAutomergeMissionHandle(missionId);
    if (!missionHandle) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 404,
        routeName: "terrain-profile",
        appUsername: logUsername(req.currentUser),
        missionId,
        message: `Mission ${missionId} not found`,
      });
      res.status(404).json({ status: "failure", message: `Mission ${missionId} not found` });
      return;
    }
    const mission = missionHandle.doc();
    const {
      path: profilePath,
      samplesPerSegment,
      entityKey,
      getElevationOnly,
    } = validateTerrainProfileRequest(req.body, mission.demResolution ?? 10);
    if (!mission.demFilePath) throw new Error("Mission does not have a DEM configured");
    const rasterPath = path.resolve(
      process.env.STATIC_DIR ?? "",
      "missionFiles",
      missionId.toString(),
      mission.demFilePath
    );
    const result = await readTerrainProfileInWorker(
      { absolutePath: rasterPath, expectedResolutionMeters: mission.demResolution ?? 10 },
      profilePath,
      samplesPerSegment,
      entityKey ? `${missionId}:${entityKey}` : undefined,
      getElevationOnly
    );
    const totalRouteDurationMs = performance.now() - routeStartedAt;
    serverLogger.debug({
      logId: "terrain-profile",
      logValue: `Worker ${result.workerId} sampled ${result.centerSamples} centers (${result.uniqueDemPixels} unique DEM pixels) from ${result.blocksRead} blocks in ${result.executionDurationMs.toFixed(1)} ms after ${result.queueDurationMs.toFixed(1)} ms queued (${totalRouteDurationMs.toFixed(1)} ms total)`,
      missionId,
    });
    res.status(200).json({
      status: "success",
      data: {
        elevationsMeters: result.elevationsMeters,
        terrainSlopesDegrees: result.terrainSlopesDegrees,
      },
      message: "Terrain profile sampled",
    });
  } catch (error) {
    respondWithRasterRouteError(res, req, "terrain-profile", missionId, error);
  }
});

export default router;
