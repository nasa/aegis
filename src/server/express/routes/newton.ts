import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Request, Response } from "express";
import express from "express";
import { asError } from "@emss/utils";

import { buildTraverseProblem } from "server/newton/v1/convert";
import { newtonHealth } from "server/newton/v1/http-newton";
import {
  isNewtonEnabled,
  newtonCacheSettings,
  newtonQueueCounts,
  requestNewtonTraverse,
} from "server/newton/traverseCache";
import { serverLogger } from "utils/logging/serverLogger";
import { planetFromRadius } from "utils/newtonInputs";
import { emssTokenIsValid, hasPerms } from "utils/permissions";

import { getAutomergeMissionHandle } from "./missionAutomerge";

const router = express.Router();

export const NEWTON_MAX_WAYPOINTS = 200;
export const NEWTON_MAX_BATCH = 100;

class RequestError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
  }
}

const emssToken = (req: Request): string => req.headers["emss-token"] as string;

const missionIdFromRequest = (req: Request): number | undefined => {
  const value = req.query.missionId;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  const missionId = Number(value);
  return Number.isSafeInteger(missionId) && missionId > 0 ? missionId : undefined;
};

function toProblem(planet: Newton.Planet, body: NewtonTraversePostData): Newton.TraverseProblem {
  if (!body || typeof body !== "object" || !Array.isArray(body.waypoints)) {
    throw new RequestError("waypoints must be an array", 400);
  }
  if (body.waypoints.length > NEWTON_MAX_WAYPOINTS) {
    throw new RequestError(`at most ${NEWTON_MAX_WAYPOINTS} waypoints are allowed`, 400);
  }
  if (body.raw !== undefined && typeof body.raw !== "boolean") {
    throw new RequestError("raw must be a boolean", 400);
  }
  if (body.params !== undefined && (typeof body.params !== "object" || body.params === null)) {
    throw new RequestError("params must be an object", 400);
  }
  for (const [name, value] of Object.entries(body.params ?? {})) {
    if (name !== "slopeLimit" && name !== "slopeBufferM") {
      throw new RequestError(`unknown parameter: ${name}`, 400);
    }
    if (value !== null && typeof value !== "number") {
      throw new RequestError(`${name} must be a number`, 400);
    }
  }
  const built = buildTraverseProblem({
    planet,
    waypoints: body.waypoints,
    slopeLimit: body.params?.slopeLimit,
    slopeBufferM: body.params?.slopeBufferM,
  });
  if (built.kind === "invalid") throw new RequestError(built.message, 400);
  return built.problem;
}

function logRouteError(
  req: Request,
  routeName: string,
  responseStatus: number,
  error: unknown,
  missionId?: number
): void {
  serverLogger.apiRoute({
    logId: "api-route:newton:failedNewtonTraverseRequest",
    logLevel: responseStatus >= 500 ? "error" : "notice",
    httpMethod: req.method as "GET" | "POST",
    responseStatus,
    routeName,
    appUsername: req.session?.appUser?.username,
    missionId,
    message: asError(error).message,
    error: responseStatus >= 500 ? asError(error) : undefined,
  });
}

const errorStatus = (error: unknown): number =>
  error instanceof RequestError ? error.httpStatus : 500;

const errorMessage = (error: unknown): string =>
  error instanceof RequestError ? error.message : "Newton traverse request failed";

/**
 * Validates the mission and the caller's `view` permission on it, then reads the mission's
 * planet. Answers and returns null when the request can't go ahead.
 */
async function missionPlanet(
  req: Request,
  res: Response,
  routeName: string
): Promise<{ missionId: number; planet: Newton.Planet } | null> {
  const missionId = missionIdFromRequest(req);
  if (!missionId) {
    serverLogger.apiRoute({
      logId: "api-route:newton:POST:rejectedInvalidMissionId",
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName,
      appUsername: req.session?.appUser?.username,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return null;
  }
  const permitted = hasPerms({
    missionId,
    permission: "view",
    appUser: req.session?.appUser,
    emssToken: emssToken(req),
  });
  if (!permitted) {
    serverLogger.apiRoute({
      logId: "api-route:newton:POST:unauthorizedRequestMissingViewPermission",
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName,
      appUsername: req.session?.appUser?.username,
      missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return null;
  }
  if (!isNewtonEnabled()) {
    res.status(503).json({ status: "error", message: "Newton is not configured" });
    return null;
  }
  const handle = await getAutomergeMissionHandle(missionId);
  if (!handle) {
    serverLogger.apiRoute({
      logId: "api-route:newton:POST:missionDocumentNotFound",
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 404,
      routeName,
      appUsername: req.session?.appUser?.username,
      missionId,
      message: `Mission ${missionId} not found`,
    });
    res.status(404).json({ status: "failure", message: `Mission ${missionId} not found` });
    return null;
  }
  const planet = planetFromRadius(handle.doc()?.planetRadius);
  if (!planet) {
    res
      .status(400)
      .json({ status: "error", message: "Newton doesn't support this mission's planet" });
    return null;
  }
  return { missionId, planet };
}

/** Answers each request in order, sequentially so a batch never claims more Newton slots. */
async function requestNewtonTraverses(
  req: Request,
  routeName: string,
  missionId: number,
  planet: Newton.Planet,
  requests: NewtonTraversePostData[]
): Promise<NewtonTraverseResponse[]> {
  const startedAt = performance.now();
  const batchId = randomUUID();
  const caller: NewtonCacheCaller = { username: req.session?.appUser?.username, missionId };
  const counts: Record<NewtonCacheStatus, number> = { hit: 0, pending: 0, submitted: 0 };
  const results: NewtonTraverseResponse[] = [];
  for (const body of requests) {
    try {
      const row = await requestNewtonTraverse(toProblem(planet, body), caller, {
        raw: body?.raw === true,
        onCacheStatus: (status) => counts[status]++,
      });
      results.push({ status: "success", message: "Newton traverse", data: row });
    } catch (error) {
      if (!(error instanceof RequestError)) logRouteError(req, routeName, 500, error, missionId);
      results.push({
        status: "error",
        message: errorMessage(error),
        httpStatus: errorStatus(error),
      });
    }
  }
  serverLogger.debug({
    logId: "newton:requestNewtonTraverses:batchCompletedWithCacheStatistics",
    missionId,
    batchId,
    logValue: `Batch ${results.length} Newton traverses > hit=${counts.hit} pending=${counts.pending} submitted=${counts.submitted} errors=${results.filter((result) => result.status !== "success").length} in ${(performance.now() - startedAt).toFixed(1)} ms`,
  });
  return results;
}

router.post("/traverses", async (req: Request, res: Response): Promise<void> => {
  const routeName = "newton/traverses";
  let missionId: number;
  try {
    const mission = await missionPlanet(req, res, routeName);
    if (!mission) return;
    missionId = mission.missionId;
    const body = (req.body ?? {}) as NewtonTraversePostData;
    const problem = toProblem(mission.planet, body);
    const row = await requestNewtonTraverse(
      problem,
      { username: req.session?.appUser?.username, missionId },
      { raw: body.raw === true }
    );
    res.status(200).json({ status: "success", message: "Newton traverse", data: row });
  } catch (error) {
    const httpStatus = errorStatus(error);
    res.status(httpStatus).json({ status: "error", message: errorMessage(error) });
    logRouteError(req, routeName, httpStatus, error, missionId);
  }
});

router.post("/traverses/batch", async (req: Request, res: Response): Promise<void> => {
  const routeName = "newton/traverses/batch";
  let missionId: number;
  try {
    const mission = await missionPlanet(req, res, routeName);
    if (!mission) return;
    missionId = mission.missionId;
    const { traverses } = (req.body ?? {}) as NewtonTraverseBatchPostData;
    if (
      !Array.isArray(traverses) ||
      traverses.length === 0 ||
      traverses.length > NEWTON_MAX_BATCH
    ) {
      throw new RequestError(`traverses must hold 1 to ${NEWTON_MAX_BATCH} entries`, 400);
    }
    const data = await requestNewtonTraverses(req, routeName, missionId, mission.planet, traverses);
    res.status(200).json({ status: "success", message: "Newton traverses", data });
  } catch (error) {
    const httpStatus = errorStatus(error);
    res.status(httpStatus).json({ status: "error", message: errorMessage(error) });
    logRouteError(req, routeName, httpStatus, error, missionId);
  }
});

/** Not tied to a mission, so only for super admins and `EMSS_TOKEN`. */
router.get("/health", async (req: Request, res: Response): Promise<void> => {
  if (!emssTokenIsValid(emssToken(req)) && !req.session?.appUser?.isSuperAdmin) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    const enabled = isNewtonEnabled();
    const health = enabled ? await newtonHealth() : null;
    const report: NewtonHealthReport = {
      enabled,
      newton: health?.kind === "ok" ? health.data : null,
      newtonError: !health
        ? null
        : health.kind === "ok"
          ? null
          : health.kind === "rejected"
            ? health.error.message
            : health.message,
      maxInFlight: newtonCacheSettings().maxInFlight,
      counts: await newtonQueueCounts(),
    };
    res.status(200).json({ status: "success", message: "Newton health", data: report });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Newton health check failed" });
    logRouteError(req, "newton/health", 500, error);
  }
});

export default router;
