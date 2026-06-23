import type { Request, Response } from "express";
import express from "express";
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

const MAESTRO_BASE_URL = "https://maestro-beta.fit.nasa.gov";

/**
 * POST /api/v1/maestro/doc/create
 * Endpoint that calls the Maestro /api/v1/doc/create endpoint
 * with the server-side EMSS_TOKEN for authentication.
 */
router.post("/doc/create", async (req: Request, res: Response): Promise<void> => {
  const missionId = req.body.missionId as number | undefined;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "maestro/doc/create",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  const emssToken = process.env.EMSS_TOKEN;
  if (!emssToken) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "maestro/doc/create",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: "EMSS_TOKEN is not configured",
      error: new Error("EMSS_TOKEN is not configured"),
    });
    res
      .status(500)
      .json({ status: "error", message: "Server is missing EMSS_TOKEN configuration." });
    return;
  }

  try {
    const maestroRes = await fetch(`${MAESTRO_BASE_URL}/api/v1/doc/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": `${emssToken}`,
      },
      body: JSON.stringify(req.body),
    });

    const responseBody = await maestroRes.json();

    serverLogger.apiRoute({
      logLevel: maestroRes.ok ? "info" : "warning",
      httpMethod: "POST",
      responseStatus: maestroRes.status,
      routeName: "maestro/doc/create",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: maestroRes.ok ? "Maestro doc created" : `Maestro returned ${maestroRes.status}`,
    });

    res.status(maestroRes.status).json(responseBody);
  } catch (err) {
    const error = asError(err);
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "maestro/doc/create",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: `Error contacting Maestro: ${error.message}`,
      error,
    });
    res
      .status(500)
      .json({ status: "error", message: `Error contacting Maestro: ${error.message}` });
  }
});

export default router;
