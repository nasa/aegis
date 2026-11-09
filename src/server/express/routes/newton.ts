import type { Request, Response } from "express";
import express from "express";
import { asError } from "@emss/utils";

import { buildTraverseProblem } from "server/newton/v1/convert";
import { newtonHealth } from "server/newton/v1/http-newton";
import {
  isNewtonEnabled,
  newtonCacheSettings,
  newtonQueueCounts,
  readNewtonTraverse,
  requestNewtonTraverse,
} from "server/newton/traverseCache";
import { emssTokenIsValid } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";

const router = express.Router();

export const NEWTON_MAX_WAYPOINTS = 200;
export const NEWTON_MAX_BATCH = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLANETS: readonly Newton.Planet[] = ["moon", "earth"];

class RequestError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
  }
}

const emssToken = (req: Request): string => req.headers["emss-token"] as string;

/**
 * Rows aren't owned by a mission and hold only coordinates and Newton's path, so any
 * user who can view some mission may use these routes.
 */
const canUseNewton = (req: Request): boolean =>
  emssTokenIsValid(emssToken(req)) ||
  !!req.session?.appUser?.isSuperAdmin ||
  !!req.session?.appUser?.permissionList?.some((p) => p.permissions.view);

function parsePlanet(value: unknown): Newton.Planet {
  if (!PLANETS.includes(value as Newton.Planet)) {
    throw new RequestError(`planet must be one of: ${PLANETS.join(", ")}`, 400);
  }
  return value as Newton.Planet;
}

function toProblem(planet: Newton.Planet, body: NewtonTraverseRequestBody): Newton.TraverseProblem {
  if (!body || !Array.isArray(body.waypoints)) {
    throw new RequestError("waypoints must be an array", 400);
  }
  if (body.waypoints.length > NEWTON_MAX_WAYPOINTS) {
    throw new RequestError(`at most ${NEWTON_MAX_WAYPOINTS} waypoints are allowed`, 400);
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
  error: unknown
): void {
  serverLogger.apiRoute({
    logId: "api-route:newton:failedNewtonTraverseRequest",
    logLevel: responseStatus >= 500 ? "error" : "notice",
    httpMethod: req.method as "GET" | "POST",
    responseStatus,
    routeName,
    appUsername: req.session?.appUser?.username,
    message: asError(error).message,
    error: responseStatus >= 500 ? asError(error) : undefined,
  });
}

function respondError(res: Response, error: unknown): number {
  const httpStatus = error instanceof RequestError ? error.httpStatus : 500;
  res.status(httpStatus).json({
    status: httpStatus === 404 ? "failure" : "error",
    message: error instanceof RequestError ? error.message : "Newton traverse request failed",
  });
  return httpStatus;
}

/** Shared auth and Newton checks for the POST routes; answers and returns false if not. */
function canPost(req: Request, res: Response, routeName: string): boolean {
  if (!canUseNewton(req)) {
    serverLogger.apiRoute({
      logId: "api-route:newton:POST:unauthorizedRequestMissingViewPermission",
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName,
      appUsername: req.session?.appUser?.username,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return false;
  }
  if (!isNewtonEnabled()) {
    res.status(503).json({ status: "error", message: "Newton is not configured" });
    return false;
  }
  return true;
}

router.post("/traverses", async (req: Request, res: Response): Promise<void> => {
  const routeName = "newton/traverses";
  if (!canPost(req, res, routeName)) return;
  try {
    const body = (req.body ?? {}) as NewtonTraversePostData;
    const problem = toProblem(parsePlanet(body.planet), body);
    const row = await requestNewtonTraverse(problem, {
      username: req.session?.appUser?.username,
    });
    res.status(200).json({ status: "success", message: "Newton traverse", data: row });
  } catch (error) {
    logRouteError(req, routeName, respondError(res, error), error);
  }
});

router.post("/traverses/batch", async (req: Request, res: Response): Promise<void> => {
  const routeName = "newton/traverses/batch";
  if (!canPost(req, res, routeName)) return;
  const { planet: rawPlanet, requests } = (req.body ?? {}) as NewtonTraverseBatchPostData;
  let planet: Newton.Planet;
  try {
    planet = parsePlanet(rawPlanet);
  } catch (error) {
    respondError(res, error);
    return;
  }
  if (!Array.isArray(requests) || requests.length === 0 || requests.length > NEWTON_MAX_BATCH) {
    res.status(400).json({
      status: "error",
      message: `requests must hold 1 to ${NEWTON_MAX_BATCH} entries`,
    });
    return;
  }
  const caller = { username: req.session?.appUser?.username };
  const data: NewtonTraverseBatchResult[] = [];
  // Sequential, so one batch never claims more Newton slots than a single request would.
  for (const body of requests) {
    try {
      const row = await requestNewtonTraverse(toProblem(planet, body), caller);
      data.push({ status: "success", data: row });
    } catch (error) {
      if (!(error instanceof RequestError)) logRouteError(req, routeName, 500, error);
      data.push({
        status: "error",
        message: error instanceof RequestError ? error.message : "Newton traverse request failed",
      });
    }
  }
  res.status(200).json({ status: "success", message: "Newton traverses", data });
});

router.get("/traverses/:uuid", async (req: Request, res: Response): Promise<void> => {
  const routeName = "newton/traverses/:uuid";
  if (!canUseNewton(req)) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  const uuid = String(req.params.uuid);
  if (!UUID_PATTERN.test(uuid)) {
    res.status(400).json({ status: "error", message: "Invalid traverse uuid" });
    return;
  }
  try {
    const row = await readNewtonTraverse(uuid, { raw: req.query.raw === "1" });
    if (!row) {
      res.status(404).json({ status: "failure", message: "Newton traverse not found" });
      return;
    }
    res.status(200).json({ status: "success", message: "Newton traverse", data: row });
  } catch (error) {
    logRouteError(req, routeName, respondError(res, error), error);
  }
});

router.get("/health", async (req: Request, res: Response): Promise<void> => {
  if (!canUseNewton(req)) {
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
    logRouteError(req, "newton/health", respondError(res, error), error);
  }
});

export default router;
