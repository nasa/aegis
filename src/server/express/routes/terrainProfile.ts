import { cachedTerrainProfile, watchTerrainCache } from "server/terrain/terrainProfileCache";
import path from "node:path";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
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
import { terrainFingerprint } from "store/terrainProfiles";
import { serverLogger } from "utils/logging/serverLogger";
import { hasPerms } from "utils/permissions";

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
  preview: boolean;
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
  if (postData.preview !== undefined && typeof postData.preview !== "boolean") {
    throw new Error("Terrain profile preview flag must be a boolean");
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
    preview: postData.preview ?? false,
  };
};

/** Sample a validated request; committed entity profiles go through the disk cache. */
export async function sampleMissionTerrainProfile(
  missionId: number,
  missionHandle: DocHandle<Mission>,
  request: ReturnType<typeof validateTerrainProfileRequest>,
  mission: Mission = missionHandle.doc()
): Promise<TerrainProfile> {
  if (!mission.demFilePath) throw new Error("Mission does not have a DEM configured");
  const { path: profilePath, samplesPerSegment, entityKey, getElevationOnly, preview } = request;
  const rasterPath = path.resolve(
    process.env.STATIC_DIR ?? "",
    "missionFiles",
    missionId.toString(),
    mission.demFilePath
  );
  watchTerrainCache(missionHandle);
  // Previews coalesce separately so a drag never supersedes a committed profile request.
  const coalescingKey = entityKey
    ? `${missionId}:${entityKey}${preview ? ":preview" : ""}`
    : undefined;
  const compute = () =>
    readTerrainProfileInWorker(
      { absolutePath: rasterPath, expectedResolutionMeters: mission.demResolution ?? 10 },
      profilePath,
      samplesPerSegment,
      coalescingKey,
      getElevationOnly
    );
  const cacheEntity = entityKey?.replace(/_walkback$/, "");
  const isCurrent = () =>
    !missionHandle.isDeleted() &&
    !!(
      missionHandle.doc()?.traverses?.[cacheEntity] || missionHandle.doc()?.stations?.[cacheEntity]
    );
  const result =
    cacheEntity && !getElevationOnly && !preview && isCurrent()
      ? await cachedTerrainProfile({
          missionId,
          entity: cacheEntity,
          rasterPath,
          inputs: [profilePath, samplesPerSegment, mission.demResolution ?? 10],
          isCurrent,
          compute,
        })
      : await compute();
  return {
    elevationsMeters: result.elevationsMeters,
    terrainSlopesDegrees: result.terrainSlopesDegrees,
  };
}

/** Committed profiles for the given traverses and station walkbacks, read through the disk cache. */
export async function getMissionTerrainProfiles(
  missionId: number,
  missionHandle: DocHandle<Mission>,
  mission: Mission,
  uuids: Iterable<string>
): Promise<TerrainProfiles> {
  const profiles: TerrainProfiles = {};
  if (!mission?.demFilePath) return profiles;
  const entities = [...new Set(uuids)].values();
  // Leave queue capacity for interactive requests, even for large exports.
  const loadProfiles = async () => {
    for (const uuid of entities) {
      const traverse = mission.traverses?.[uuid];
      const station = traverse ? undefined : mission.stations?.[uuid];
      const entityPath = traverse?.path ?? station?.walkbackPath;
      const distances = traverse?.pathSegmentDistances ?? station?.walkbackPathSegmentDistances;
      if (!entityPath || entityPath.length < 2 || distances?.length !== entityPath.length - 1)
        continue;
      const entry: TerrainProfileEntry = {
        fingerprint: terrainFingerprint(mission, entityPath, distances),
        path: entityPath,
        distances,
        status: "ready",
        profile: null,
        error: null,
      };
      try {
        const request = validateTerrainProfileRequest(
          { path: entityPath, pathSegmentDistances: distances, entityKey: uuid },
          mission.demResolution ?? 10
        );
        for (let attempt = 0; ; attempt++) {
          try {
            entry.profile = await sampleMissionTerrainProfile(
              missionId,
              missionHandle,
              request,
              mission
            );
            break;
          } catch (error) {
            if (
              attempt >= 2 ||
              !(error instanceof RasterSamplingWorkerPoolUnavailableError) ||
              error instanceof RasterSamplingWorkerPoolSupersededError
            )
              throw error;
            await delay(100 * (attempt + 1));
          }
        }
      } catch (error) {
        entry.status = "error";
        entry.error = asError(error).message;
      }
      profiles[uuid] = entry;
    }
  };
  await Promise.all(Array.from({ length: 4 }, loadProfiles));
  return profiles;
}

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
  const clientError = /must|invalid|limit|configured|contain/i.test(message);
  const responseStatus = workerUnavailable ? 503 : clientError ? 400 : 500;
  serverLogger.apiRoute({
    logLevel: responseStatus === 400 ? "notice" : responseStatus === 503 ? "warning" : "error",
    httpMethod: "POST",
    responseStatus,
    routeName,
    appUsername: req.session?.appUser?.username,
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
      appUsername: req.session?.appUser?.username,
      message: "Invalid mission ID",
    });
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
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "terrain-profile",
      appUsername: req.session?.appUser?.username,
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
        appUsername: req.session?.appUser?.username,
        missionId,
        message: `Mission ${missionId} not found`,
      });
      res.status(404).json({ status: "failure", message: `Mission ${missionId} not found` });
      return;
    }
    const profile = await sampleMissionTerrainProfile(
      missionId,
      missionHandle,
      validateTerrainProfileRequest(req.body, missionHandle.doc().demResolution ?? 10)
    );
    serverLogger.debug({
      logId: "terrain-profile",
      missionId,
      logValue: `Profile returned in ${(performance.now() - routeStartedAt).toFixed(1)} ms`,
    });
    res.status(200).json({
      status: "success",
      data: profile,
      message: "Terrain profile sampled",
    });
  } catch (error) {
    respondWithRasterRouteError(res, req, "terrain-profile", missionId, error);
  }
});

export default router;
