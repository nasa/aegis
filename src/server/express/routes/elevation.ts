import path from "node:path";
import { performance } from "node:perf_hooks";
import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { resolveMissionDemPath } from "server/elevation/resolveMissionDem";
import { samplesForDistance } from "server/raster/constants";
import { readTerrainProfileInWorker } from "server/terrain/readTerrainProfile";
import { getAutomergeMissionHandle } from "./missionAutomerge";
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { respondWithRasterRouteError } from "./rasterRouteError";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId } = query;
  if (typeof missionId !== "string" || !/^\d+$/.test(missionId)) return { missionId: undefined };
  const parsedMissionId = Number(missionId);
  return {
    missionId:
      Number.isSafeInteger(parsedMissionId) && parsedMissionId > 0 ? parsedMissionId : undefined,
  };
};

const validateRequest = (
  postData: ElevationProfilePostData,
  resolutionMeters: number
): { path: { lat: number; lng: number }[]; steps: number[] } => {
  if (!Array.isArray(postData?.path) || postData.path.length < 2) {
    throw new Error("Elevation path must contain at least two points");
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
    throw new Error("Elevation path contains invalid coordinates");
  }
  if (
    !Array.isArray(postData.pathSegmentDistances) ||
    postData.pathSegmentDistances.length !== postData.path.length - 1 ||
    !postData.pathSegmentDistances.every((distance) => Number.isFinite(distance) && distance >= 0)
  ) {
    throw new Error("Elevation path segment distances are invalid");
  }
  if (!Number.isFinite(resolutionMeters) || resolutionMeters <= 0) {
    throw new Error("Mission DEM resolution must be positive");
  }

  return {
    path: postData.path as { lat: number; lng: number }[],
    steps: postData.pathSegmentDistances.map((distance) =>
      samplesForDistance(distance, resolutionMeters)
    ),
  };
};

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  if (!queryObj.missionId) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "elevation",
      appUsername: req.session?.appUser?.username,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  const emssToken = req.headers["emss-token"] as string;
  const viewPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!viewPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "elevation",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    const missionHandle = await getAutomergeMissionHandle(queryObj.missionId);
    if (!missionHandle) {
      res.status(404).json({
        status: "failure",
        message: `Mission ${queryObj.missionId} not found`,
      });
      return;
    }
    const mission = missionHandle.doc();
    const resolutionMeters = mission.demResolution ?? 10;
    const { path: elevationPath, steps } = validateRequest(req.body, resolutionMeters);
    const rasterPath = await resolveMissionDemPath(
      process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : undefined,
      queryObj.missionId,
      mission.demFilePath
    );

    const startedAt = performance.now();
    const result = await readTerrainProfileInWorker(
      { absolutePath: rasterPath, expectedResolutionMeters: resolutionMeters },
      elevationPath,
      steps
    );
    const durationMs = performance.now() - startedAt;
    serverLogger.debug({
      logId: "elevation",
      logValue: `Worker ${result.workerId} sampled ${result.centerSamples} centers (${result.uniqueDemPixels} unique DEM pixels) from ${result.blocksRead} blocks in ${result.executionDurationMs.toFixed(1)} ms after ${result.queueDurationMs.toFixed(1)} ms queued (${durationMs.toFixed(1)} ms total)`,
      missionId: queryObj.missionId,
    });
    res.status(200).json({
      status: "success",
      data: result.elevationsMeters,
      message: "Elevation profile sampled",
    });
  } catch (error) {
    respondWithRasterRouteError(res, req, "elevation", queryObj.missionId, error);
  }
});

export default router;
