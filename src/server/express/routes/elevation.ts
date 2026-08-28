import path from "node:path";
import { realpath, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";
import { asError } from "@emss/utils";

import {
  RasterSamplingWorkerPoolUnavailableError,
  sampleRasterProfileInWorker,
} from "server/raster/rasterSamplingWorkerPool";
import { getAutomergeMissionHandle } from "./missionAutomerge";
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";

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
    steps: postData.pathSegmentDistances.map((distance) => Math.ceil(distance / resolutionMeters)),
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
      const error = new Error(`Mission ${queryObj.missionId} not found`);
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 404,
        routeName: "elevation",
        appUsername: req.session?.appUser?.username,
        missionId: queryObj.missionId,
        message: error.message,
        error,
      });
      res.status(404).json({
        status: "failure",
        message: error.message,
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
    const result = await readElevationProfileInWorker(
      { absolutePath: rasterPath },
      elevationPath,
      steps
    );
    const durationMs = performance.now() - startedAt;
    serverLogger.debug({
      logId: "elevation",
      logValue: `Worker ${result.workerId} sampled ${result.samplesRead} points from ${result.blocksRead} blocks in ${result.executionDurationMs.toFixed(1)} ms after ${result.queueDurationMs.toFixed(1)} ms queued (${durationMs.toFixed(1)} ms total)`,
      missionId: queryObj.missionId,
    });
    res.status(200).json({
      status: "success",
      data: result.elevations,
      message: "Elevation profile sampled",
    });
  } catch (error) {
    const message = asError(error).message;
    const isWorkerUnavailable = error instanceof RasterSamplingWorkerPoolUnavailableError;
    const isClientError =
      message.includes("must") ||
      message.includes("invalid") ||
      message.includes("limit") ||
      message.includes("configured") ||
      message.includes("contain");
    const responseStatus = isWorkerUnavailable ? 503 : isClientError ? 400 : 500;
    serverLogger.apiRoute({
      logLevel: responseStatus === 400 ? "notice" : responseStatus === 503 ? "warning" : "error",
      httpMethod: "POST",
      responseStatus,
      routeName: "elevation",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message,
      error: asError(error),
    });
    res.status(responseStatus).json({ status: "error", message });
  }
});

export default router;

const NODATA_SENTINEL = -1100101;

const readElevationProfileInWorker = async (
  descriptor: RasterDescriptor,
  elevationPath: GeographicPoint[],
  steps: number[]
) => {
  const result = await sampleRasterProfileInWorker(descriptor, elevationPath, steps);
  return {
    ...result,
    elevations: result.samples.map((segment) =>
      segment.map((sample) => (sample.status === "value" ? sample.value : NODATA_SENTINEL))
    ),
  };
};

const resolveMissionDemPath = async (
  staticDirectory: string | undefined,
  missionId: number,
  demFilePath: string
): Promise<string> => {
  if (!staticDirectory) throw new Error("STATIC_DIR is not configured");
  if (!demFilePath) throw new Error("Mission does not have a DEM configured");
  if (path.isAbsolute(demFilePath)) throw new Error("Mission DEM path must be relative");

  const lexicalDataDirectory = path.resolve(
    staticDirectory,
    "missionFiles",
    missionId.toString(),
    "Data"
  );
  const configuredPath = path.resolve(
    staticDirectory,
    "missionFiles",
    missionId.toString(),
    demFilePath
  );
  const lexicalRelativePath = path.relative(lexicalDataDirectory, configuredPath);
  if (
    lexicalRelativePath === "" ||
    lexicalRelativePath.startsWith(`..${path.sep}`) ||
    lexicalRelativePath === ".." ||
    path.isAbsolute(lexicalRelativePath)
  ) {
    throw new Error("Mission DEM path must remain inside the mission Data directory");
  }

  const dataDirectory = await realpath(lexicalDataDirectory);
  const rasterPath = await realpath(configuredPath);
  const relativePath = path.relative(dataDirectory, rasterPath);
  if (
    relativePath === "" ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === ".." ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Mission DEM path must remain inside the mission Data directory");
  }

  const rasterStat = await stat(rasterPath);
  if (!rasterStat.isFile()) throw new Error("Mission DEM path is not a regular file");
  if (![".tif", ".tiff"].includes(path.extname(rasterPath).toLowerCase())) {
    throw new Error("Mission DEM must be a GeoTIFF");
  }
  return rasterPath;
};
