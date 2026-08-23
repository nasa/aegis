import type { Request, Response } from "express";
import { asError } from "@emss/utils";

import {
  RasterSamplingWorkerPoolSupersededError,
  RasterSamplingWorkerPoolUnavailableError,
} from "server/raster/rasterSamplingWorkerPool";
import { serverLogger } from "utils/logging/serverLogger";

/**
 * Classifies and responds to an error thrown while handling a raster-sampling POST route
 * (elevation, terrain profile). Superseded jobs are the routine outcome of coalescing
 * during live drags, so they're reported as 409 without the warning-level log given to
 * other worker-unavailable errors.
 */
export const respondWithRasterRouteError = (
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
    appUsername: req.session?.appUser?.username,
    missionId,
    message,
    error: asError(error),
  });
  res.status(responseStatus).json({ status: "error", message });
};
