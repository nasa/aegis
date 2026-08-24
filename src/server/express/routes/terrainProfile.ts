import path from "node:path";
import { performance } from "node:perf_hooks";
import type { Request, Response } from "express";

import express from "express";

import { resolveMissionDemPath } from "server/elevation/resolveMissionDem";
import { MAX_RASTER_PROFILE_SAMPLES, samplesForDistance } from "server/raster/constants";
import { readTerrainProfileInWorker } from "server/terrain/readTerrainProfile";
import { serverLogger } from "utils/logging/serverLogger";
import { hasPerms } from "utils/permissions";

import { getAutomergeMissionHandle } from "./missionAutomerge";
import { respondWithRasterRouteError } from "./rasterRouteError";

const router = express.Router();
const ENTITY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

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

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const missionId = missionIdFromRequest(req);
  if (!missionId) {
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  const permitted = hasPerms({
    missionId,
    permission: "view",
    appUser: req.session.appUser,
    emssToken: req.headers["emss-token"] as string,
  });
  if (!permitted) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  const routeStartedAt = performance.now();
  try {
    const missionHandle = await getAutomergeMissionHandle(missionId);
    if (!missionHandle) {
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
    const rasterPath = await resolveMissionDemPath(
      process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : undefined,
      missionId,
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
