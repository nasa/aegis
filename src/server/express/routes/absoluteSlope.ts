import path from "node:path";
import { performance } from "node:perf_hooks";
import type { Request, Response } from "express";

import { asError } from "@emss/utils";
import express from "express";

import { resolveMissionAbsoluteSlopePath } from "server/elevation/resolveMissionDem";
import { RasterSamplingWorkerPoolUnavailableError } from "server/raster/rasterSamplingWorkerPool";
import { readAbsoluteSlopeProfileInWorker } from "server/slope/readAbsoluteSlopeProfile";
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";

import { getAutomergeMissionHandle } from "./missionAutomerge";

const router = express.Router();

const parseMissionId = (value: unknown): number | undefined => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  const missionId = Number(value);
  return Number.isSafeInteger(missionId) && missionId > 0 ? missionId : undefined;
};

const validateRequest = (
  postData: AbsoluteSlopeProfilePostData,
  resolutionMeters: number
): { path: { lat: number; lng: number }[]; steps: number[] } => {
  if (!Array.isArray(postData?.path) || postData.path.length < 2) {
    throw new Error("Absolute slope path must contain at least two points");
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
    throw new Error("Absolute slope path contains invalid coordinates");
  }
  if (
    !Array.isArray(postData.pathSegmentDistances) ||
    postData.pathSegmentDistances.length !== postData.path.length - 1 ||
    !postData.pathSegmentDistances.every((distance) => Number.isFinite(distance) && distance >= 0)
  ) {
    throw new Error("Absolute slope path segment distances are invalid");
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
  const missionId = parseMissionId(req.query.missionId);
  if (!missionId) {
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  const viewPermission = hasPerms({
    missionId,
    permission: "view",
    appUser: req.session.appUser,
    emssToken: req.headers["emss-token"] as string,
  });
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const missionHandle = await getAutomergeMissionHandle(missionId);
    if (!missionHandle) {
      res.status(404).json({ status: "failure", message: `Mission ${missionId} not found` });
      return;
    }
    const mission = missionHandle.doc();
    const { path: slopePath, steps } = validateRequest(req.body, mission.demResolution ?? 10);
    const rasterPath = await resolveMissionAbsoluteSlopePath(
      process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : undefined,
      missionId,
      mission.absoluteSlopeFilePath
    );

    const startedAt = performance.now();
    const result = await readAbsoluteSlopeProfileInWorker(
      { absolutePath: rasterPath },
      slopePath,
      steps
    );
    serverLogger.debug({
      logId: "absolute-slope",
      logValue: `Worker ${result.workerId} sampled ${result.samplesRead} points from ${result.blocksRead} blocks in ${result.executionDurationMs.toFixed(1)} ms after ${result.queueDurationMs.toFixed(1)} ms queued (${(performance.now() - startedAt).toFixed(1)} ms total)`,
      missionId,
    });
    res.status(200).json({
      status: "success",
      data: result.absoluteSlopes,
      message: "Absolute slope profile sampled",
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
      routeName: "absolute-slope",
      appUsername: req.session?.appUser?.username,
      missionId,
      message,
      error: asError(error),
    });
    res.status(responseStatus).json({ status: "error", message });
  }
});

export default router;
