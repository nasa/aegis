import type { Request, Response } from "express";

import express from "express";

import { EnvironmentConfig_db } from "server/database/models/_allModels";
import { globalValues } from "../global";
import { upsertDatabaseRetry } from "utils/database";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

const CONFIG_ROW_ID = 1;

// get — returns env default URL and current DB override
router.get("/", async (req: Request, res: Response): Promise<void> => {
  if (!req.session.appUser?.isSuperAdmin) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "environmentConfig",
      appUsername: req.session?.appUser?.username,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const config = await getEnvironmentConfig();
    res
      .status(200)
      .json({ status: "success", message: "environment config retrieved", data: config });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "environmentConfig",
      appUsername: req.session?.appUser?.username,
      message: `Error retrieving environment config: ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error retrieving environment config: ${e}` });
  }
});

// post — updates the override URL (null to clear)
router.post("/", async (req: Request, res: Response): Promise<void> => {
  if (!req.session.appUser?.isSuperAdmin) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "environmentConfig",
      appUsername: req.session?.appUser?.username,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  const { urlOverride } = req.body as { urlOverride: string | null };

  try {
    const config = await upsertDatabaseRetry(() =>
      setEnvironmentConfigOverride(urlOverride ?? null)
    );

    if (!config) {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "environmentConfig",
        appUsername: req.session?.appUser?.username,
        message:
          "Failed to update environment config after multiple tries due to optimistic locking",
        error: new Error(
          "Failed to update environment config after multiple tries due to optimistic locking"
        ),
      });
      res.status(500).json({
        status: "error",
        message:
          "Failed to update environment config after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    res
      .status(200)
      .json({ status: "success", message: "environment config updated", data: config });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "environmentConfig",
      appUsername: req.session?.appUser?.username,
      message: `Error updating environment config: ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error updating environment config: ${e}` });
  }
});

export default router;

export async function getEnvironmentConfig(): Promise<EnvironmentConfigData> {
  const em = globalValues.orm.em;
  const row = await em.findOne(EnvironmentConfig_db, { id: CONFIG_ROW_ID });
  const defaultUrl = process.env.MAESTRO_PAIR_ENV_URL;
  const urlOverride = row?.urlOverride ?? null;
  return {
    defaultUrl,
    urlOverride,
    effectiveUrl: urlOverride ?? defaultUrl,
    isOverridden: urlOverride !== null && urlOverride.trim() !== "",
  };
}

async function setEnvironmentConfigOverride(
  urlOverride: string | null
): Promise<EnvironmentConfigData> {
  const em = globalValues.orm.em;
  const normalised = urlOverride?.trim() || null;

  let row = await em.findOne(EnvironmentConfig_db, { id: CONFIG_ROW_ID });
  if (row) {
    row.urlOverride = normalised;
    em.persist(row);
  } else {
    row = em.create(EnvironmentConfig_db, { id: CONFIG_ROW_ID, urlOverride: normalised });
    em.persist(row);
  }
  await em.flush();

  const defaultUrl = process.env.MAESTRO_PAIR_ENV_URL;
  return {
    defaultUrl,
    urlOverride: normalised,
    effectiveUrl: normalised ?? defaultUrl,
    isOverridden: normalised !== null,
  };
}
