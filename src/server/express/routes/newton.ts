import { performance } from "node:perf_hooks";
import type { Request, Response } from "express";
import express from "express";
import { asError } from "@emss/utils";

import { buildTraverseProblem } from "server/newton/v1/convert";
import { newtonHealth } from "server/newton/v1/http-newton";
import {
  NEWTON_BATCH_CONCURRENCY,
  cancelNewtonTraverse,
  getNewtonTraverseResult,
  isNewtonEnabled,
  mapWithConcurrency,
  submitNewtonTraverse,
} from "server/newton/traverses";
import { serverLogger } from "utils/logging/serverLogger";
import { newtonPlanet } from "utils/newtonInputs";
import { emssTokenIsValid, hasPerms } from "utils/permissions";

import { getAutomergeMissionHandle } from "./missionAutomerge";

const router = express.Router();

export const NEWTON_MAX_WAYPOINTS = 200;
export const NEWTON_MAX_BATCH = 100;

/** Newton's ids are uuids; anything else is refused before it reaches Newton. */
const TRAVERSE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type HttpMethod = "GET" | "POST" | "DELETE";

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

function traverseIdsFromQuery(req: Request): string[] {
  const value = req.query.ids;
  const ids = typeof value === "string" && value ? value.split(",") : [];
  if (ids.length === 0 || ids.length > NEWTON_MAX_BATCH) {
    throw new RequestError(`ids must hold 1 to ${NEWTON_MAX_BATCH} traverse ids`, 400);
  }
  if (!ids.every((id) => TRAVERSE_ID.test(id))) throw new RequestError("invalid traverse id", 400);
  return ids;
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
    httpMethod: req.method as HttpMethod,
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

function answerError(
  req: Request,
  res: Response,
  routeName: string,
  error: unknown,
  missionId?: number
) {
  const httpStatus = errorStatus(error);
  res.status(httpStatus).json({ status: "error", message: errorMessage(error) });
  logRouteError(req, routeName, httpStatus, error, missionId);
}

/**
 * Validates the mission and the caller's `view` permission on it, then reads the mission's
 * planet. Answers and returns null when the request can't go ahead.
 */
async function missionPlanet(
  req: Request,
  res: Response,
  routeName: string
): Promise<{ missionId: number; planet: Newton.Planet } | null> {
  const httpMethod = req.method as HttpMethod;
  const missionId = missionIdFromRequest(req);
  if (!missionId) {
    serverLogger.apiRoute({
      logId: "api-route:newton:rejectedInvalidMissionId",
      logLevel: "notice",
      httpMethod,
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
      logId: "api-route:newton:unauthorizedRequestMissingViewPermission",
      logLevel: "warning",
      httpMethod,
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
      logId: "api-route:newton:missionDocumentNotFound",
      logLevel: "notice",
      httpMethod,
      responseStatus: 404,
      routeName,
      appUsername: req.session?.appUser?.username,
      missionId,
      message: `Mission ${missionId} not found`,
    });
    res.status(404).json({ status: "failure", message: `Mission ${missionId} not found` });
    return null;
  }
  const planet = newtonPlanet(handle.doc()?.planet);
  if (!planet) {
    res
      .status(400)
      .json({ status: "error", message: "Newton doesn't support this mission's planet" });
    return null;
  }
  return { missionId, planet };
}

const entryError = (error: unknown) => ({
  status: "error" as const,
  message: errorMessage(error),
  httpStatus: errorStatus(error),
});

const countBy = <T>(items: T[], key: (item: T) => string): string =>
  Object.entries(
    items.reduce<Record<string, number>>((counts, item) => {
      counts[key(item)] = (counts[key(item)] ?? 0) + 1;
      return counts;
    }, {})
  )
    .map(([name, count]) => `${name}=${count}`)
    .join(" ");

/** Submits each request to Newton, which queues, caches and de-duplicates them. */
router.post("/traverses", async (req: Request, res: Response): Promise<void> => {
  const routeName = "newton/traverses";
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
    const startedAt = performance.now();
    const data = await mapWithConcurrency(
      traverses,
      NEWTON_BATCH_CONCURRENCY,
      async (body): Promise<NewtonTraverseSubmitResponse> => {
        try {
          return await submitNewtonTraverse(toProblem(mission.planet, body));
        } catch (error) {
          if (!(error instanceof RequestError))
            logRouteError(req, routeName, 500, error, missionId);
          return entryError(error);
        }
      }
    );
    serverLogger.debug({
      logId: "newton:postTraverses:submittedNewtonTraverses",
      missionId,
      logValue: `Submitted ${data.length} Newton traverses > ${countBy(data, (entry) => entry.data?.reuse ?? `error_${entry.httpStatus}`)} in ${(performance.now() - startedAt).toFixed(1)} ms`,
    });
    res.status(200).json({ status: "success", message: "Newton traverses", data });
  } catch (error) {
    answerError(req, res, routeName, error, missionId);
  }
});

/** Newton's jobs by id, `?ids=a,b`. `raw=1` adds Newton's unsimplified paths. */
router.get("/traverses", async (req: Request, res: Response): Promise<void> => {
  const routeName = "newton/traverses";
  let missionId: number;
  try {
    const mission = await missionPlanet(req, res, routeName);
    if (!mission) return;
    missionId = mission.missionId;
    const ids = traverseIdsFromQuery(req);
    const raw = req.query.raw === "1";
    const data = await mapWithConcurrency(ids, NEWTON_BATCH_CONCURRENCY, (id) =>
      getNewtonTraverseResult(id, raw)
    );
    res.status(200).json({ status: "success", message: "Newton traverses", data });
  } catch (error) {
    answerError(req, res, routeName, error, missionId);
  }
});

/**
 * Cancels a Newton job. Callers must only cancel ids their own POST created (`reuse:
 * "new"`): `cached` and `deduplicated` ids are shared with other callers.
 */
router.delete("/traverses/:traverseId", async (req: Request, res: Response): Promise<void> => {
  const routeName = "newton/traverses/:traverseId";
  let missionId: number;
  try {
    const mission = await missionPlanet(req, res, routeName);
    if (!mission) return;
    missionId = mission.missionId;
    const { traverseId } = req.params;
    if (typeof traverseId !== "string" || !TRAVERSE_ID.test(traverseId)) {
      throw new RequestError("invalid traverse id", 400);
    }
    const result = await cancelNewtonTraverse(traverseId);
    res.status(result.status === "success" ? 200 : (result.httpStatus ?? 503)).json(result);
  } catch (error) {
    answerError(req, res, routeName, error, missionId);
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
    };
    res.status(200).json({ status: "success", message: "Newton health", data: report });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Newton health check failed" });
    logRouteError(req, "newton/health", 500, error);
  }
});

export default router;
