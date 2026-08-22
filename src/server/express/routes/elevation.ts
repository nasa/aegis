import { randomUUID } from "node:crypto";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import {
  ELEVATION_BODY_LIMIT,
  ELEVATION_RATE_LIMIT_BURST_SAMPLES,
  ELEVATION_RATE_LIMIT_IDLE_TTL_MS,
  ELEVATION_RATE_LIMIT_MAX_USERS,
  ELEVATION_RATE_LIMIT_SAMPLES_PER_SECOND,
  MAX_ELEVATION_PATH_VERTICES,
} from "server/elevation/constants";
import { ElevationRequestError } from "server/elevation/elevationErrors";
import { readElevationProfileInWorker } from "server/elevation/readElevationProfile";
import { resolveMissionDemPath } from "server/elevation/resolveMissionDem";
import { WeightedRateLimiter } from "server/raster/weightedRateLimiter";
import {
  getRasterSamplingWorkerPoolSnapshot,
  RasterSamplingWorkerPoolUnavailableError,
} from "server/raster/rasterSamplingWorkerPool";
import { RasterProfileTooLargeError, validateRasterProfileRequest } from "server/raster/constants";
import { RasterSamplingError } from "server/raster/rasterSamplingErrors";
import { getAutomergeMissionHandle } from "./missionAutomerge";
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";

const rateLimiter = new WeightedRateLimiter({
  capacity: ELEVATION_RATE_LIMIT_BURST_SAMPLES,
  refillPerSecond: ELEVATION_RATE_LIMIT_SAMPLES_PER_SECOND,
  idleTtlMs: ELEVATION_RATE_LIMIT_IDLE_TTL_MS,
  maxEntries: ELEVATION_RATE_LIMIT_MAX_USERS,
});

const router = express.Router();
router.use(express.json({ limit: ELEVATION_BODY_LIMIT }));
router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if ((error as { type?: string })?.type !== "entity.too.large") return next(error);
  res.status(413).json({
    status: "error",
    code: "ELEVATION_TOO_MANY_VERTICES",
    message: "Elevation request body is too large",
  });
});

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
): { path: AEGISPoint[]; steps: number[]; estimatedSamples: number } => {
  if (!Array.isArray(postData?.path) || postData.path.length < 2) {
    throw new ElevationRequestError(
      "ELEVATION_INVALID_REQUEST",
      "Elevation path must contain at least two points",
      400
    );
  }
  if (postData.path.length > MAX_ELEVATION_PATH_VERTICES) {
    throw new ElevationRequestError(
      "ELEVATION_TOO_MANY_VERTICES",
      `Elevation path exceeds the ${MAX_ELEVATION_PATH_VERTICES} vertex limit`,
      422
    );
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
    throw new ElevationRequestError(
      "ELEVATION_INVALID_REQUEST",
      "Elevation path contains invalid coordinates",
      400
    );
  }
  if (
    !Array.isArray(postData.pathSegmentDistances) ||
    postData.pathSegmentDistances.length !== postData.path.length - 1 ||
    !postData.pathSegmentDistances.every((distance) => Number.isFinite(distance) && distance >= 0)
  ) {
    throw new ElevationRequestError(
      "ELEVATION_INVALID_REQUEST",
      "Elevation path segment distances are invalid",
      400
    );
  }
  if (!Number.isFinite(resolutionMeters) || resolutionMeters <= 0) {
    throw new ElevationRequestError(
      "ELEVATION_DEM_UNAVAILABLE",
      "Mission elevation data is unavailable",
      422
    );
  }
  const steps = postData.pathSegmentDistances.map((distance) =>
    Math.ceil(distance / resolutionMeters)
  );
  try {
    return {
      path: postData.path,
      steps,
      estimatedSamples: validateRasterProfileRequest(postData.path.length, steps),
    };
  } catch (error) {
    if (error instanceof RasterProfileTooLargeError) {
      throw new ElevationRequestError(
        "ELEVATION_TOO_MANY_SAMPLES",
        "Elevation path requires too many samples",
        422
      );
    }
    throw new ElevationRequestError(
      "ELEVATION_INVALID_REQUEST",
      "Elevation request is invalid",
      400
    );
  }
};

const getPrincipal = (req: Request): string =>
  req.session?.appUser?.id != null
    ? `user:${req.session.appUser.id}`
    : req.session?.appUser?.username
      ? `username:${req.session.appUser.username}`
      : "emss-service";

const getSupersession = (
  postData: ElevationProfilePostData,
  principal: string,
  missionId: number
) => {
  if (postData.streamId == null && postData.generation == null) return undefined;
  if (
    typeof postData.streamId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(postData.streamId) ||
    !Number.isSafeInteger(postData.generation) ||
    (postData.generation ?? -1) < 0
  ) {
    throw new ElevationRequestError(
      "ELEVATION_INVALID_REQUEST",
      "Invalid elevation request stream metadata",
      400
    );
  }
  return {
    streamKey: `${principal.replace(/[^A-Za-z0-9:_-]/g, "_")}:${missionId}:${postData.streamId}`,
    generation: postData.generation,
  };
};

const mapError = (error: unknown): ElevationRequestError => {
  if (error instanceof ElevationRequestError) return error;
  if (error instanceof RasterSamplingError) {
    switch (error.code) {
      case "RASTER_SAMPLING_BUSY":
      case "RASTER_SAMPLING_CLOSED":
        return new ElevationRequestError(
          "ELEVATION_BUSY",
          "Elevation service is busy",
          503,
          error.retryAfterMs ?? 250
        );
      case "RASTER_SAMPLING_QUEUE_DEADLINE":
        return new ElevationRequestError(
          "ELEVATION_QUEUE_DEADLINE",
          "Elevation request waited too long",
          503,
          error.retryAfterMs ?? 250
        );
      case "RASTER_SAMPLING_SUPERSEDED":
      case "RASTER_SAMPLING_CANCELLED":
        return new ElevationRequestError(
          "ELEVATION_SUPERSEDED",
          "Elevation request was superseded",
          409
        );
      case "RASTER_SAMPLING_TIMEOUT":
        return new ElevationRequestError(
          "ELEVATION_TIMEOUT",
          "Elevation sampling timed out",
          503,
          500
        );
      default:
        return new ElevationRequestError(
          "ELEVATION_SAMPLING_FAILED",
          "Elevation sampling failed",
          500
        );
    }
  }
  if (error instanceof RasterSamplingWorkerPoolUnavailableError) {
    return new ElevationRequestError("ELEVATION_BUSY", "Elevation service is busy", 503, 250);
  }
  return new ElevationRequestError("ELEVATION_SAMPLING_FAILED", "Elevation sampling failed", 500);
};

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const requestId =
    typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].length <= 128
      ? req.headers["x-request-id"]
      : randomUUID();
  res.set("X-Request-ID", requestId);
  const queryObj = parseQuery(req.query);
  if (!queryObj.missionId) {
    res.status(400).json({
      status: "error",
      code: "ELEVATION_INVALID_REQUEST",
      message: "Invalid mission ID",
    });
    return;
  }
  const emssToken = req.headers["emss-token"] as string;
  if (
    !hasPerms({
      missionId: queryObj.missionId,
      permission: "view",
      appUser: req.session.appUser,
      emssToken,
    })
  ) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  const abortController = new AbortController();
  const handleAbort = () => abortController.abort();
  req.once("aborted", handleAbort);
  let chargedCost = 0;
  let limiterKey = "";
  try {
    const missionHandle = await getAutomergeMissionHandle(queryObj.missionId);
    if (!missionHandle) {
      res.status(404).json({ status: "failure", message: "Mission not found" });
      return;
    }
    const mission = missionHandle.doc();
    const {
      path: elevationPath,
      steps,
      estimatedSamples,
    } = validateRequest(req.body, mission.demResolution ?? 10);
    const principal = getPrincipal(req);
    const supersession = getSupersession(req.body, principal, queryObj.missionId);
    limiterKey = `${principal}:${queryObj.missionId}`;
    const limit = rateLimiter.consume(limiterKey, estimatedSamples);
    if (!limit.allowed) {
      const retryAfterMs = "retryAfterMs" in limit ? limit.retryAfterMs : 1_000;
      throw new ElevationRequestError(
        "ELEVATION_RATE_LIMITED",
        "Elevation request rate limit exceeded",
        429,
        retryAfterMs
      );
    }
    chargedCost = estimatedSamples;
    const rasterPath = await resolveMissionDemPath(
      process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : undefined,
      queryObj.missionId,
      mission.demFilePath
    );
    const admittedSnapshot = getRasterSamplingWorkerPoolSnapshot();
    const startedAt = performance.now();
    const result = await readElevationProfileInWorker(
      { absolutePath: rasterPath },
      elevationPath,
      steps,
      { signal: abortController.signal, supersession }
    );
    const completedSnapshot = getRasterSamplingWorkerPoolSnapshot();
    serverLogger.debug({
      logId: "elevation",
      logValue: "Raster elevation profile sampled",
      requestId,
      missionId: queryObj.missionId,
      requestClass: supersession ? "interactive-measurement" : "elevation",
      estimatedSamples,
      pathVertexCount: elevationPath.length,
      samplesRead: result.samplesRead,
      blocksRead: result.blocksRead,
      workerId: result.workerId,
      queueDurationMs: Math.round(result.queueDurationMs),
      executionDurationMs: Math.round(result.executionDurationMs),
      totalDurationMs: Math.round(performance.now() - startedAt),
      queueDepthAtAdmission: admittedSnapshot.queueDepth,
      queuedWeightAtAdmission: admittedSnapshot.queuedWeight,
      queueDepthAtCompletion: completedSnapshot.queueDepth,
      queuedWeightAtCompletion: completedSnapshot.queuedWeight,
      activeWorkers: completedSnapshot.activeWorkers,
    });
    if (!res.headersSent && !abortController.signal.aborted) {
      res.status(200).json({
        status: "success",
        data: result.elevations,
        message: "Elevation profile sampled",
      });
    }
  } catch (error) {
    const mapped = mapError(error);
    if (
      chargedCost > 0 &&
      ["ELEVATION_BUSY", "ELEVATION_QUEUE_DEADLINE", "ELEVATION_SUPERSEDED"].includes(mapped.code)
    ) {
      rateLimiter.refund(limiterKey, chargedCost);
    }
    const retryAfterMs = mapped.retryAfterMs;
    if (retryAfterMs) {
      res.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1_000))));
    }
    serverLogger.apiRoute({
      logLevel: mapped.status < 500 ? "notice" : "warning",
      httpMethod: "POST",
      responseStatus: mapped.status,
      routeName: "elevation",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: mapped.code,
    });
    if (!res.headersSent && !abortController.signal.aborted) {
      res.status(mapped.status).json({
        status: "error",
        code: mapped.code,
        message: mapped.message,
        ...(retryAfterMs ? { retryAfterMs } : {}),
      });
    }
  } finally {
    req.off("aborted", handleAbort);
  }
});

export default router;
