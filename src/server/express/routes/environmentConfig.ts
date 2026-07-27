import type { Request, Response } from "express";

import express from "express";
import { asError } from "@emss/utils";

import { EnvironmentConfig_db } from "server/database/models/_allModels";
import { globalValues } from "../global";
import { upsertDatabaseRetry } from "utils/database";
import { serverLogger } from "utils/logging/serverLogger";

const router = express.Router();

/**
 * List of configs and their default value from the .env file
 */
export const CONFIG_LIST: Record<string, { defaultValue: () => string | null }> = {
  maestroServer: {
    defaultValue: () => process.env.MAESTRO_PAIR_ENV_URL ?? null,
  },
};

type EnvConfigKey = keyof typeof CONFIG_LIST;

const isKnownKey = (key: string): key is EnvConfigKey =>
  Object.prototype.hasOwnProperty.call(CONFIG_LIST, key);

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET / — return all records in the env config table
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
    const configs = await getAllEnvironmentConfigs();
    res
      .status(200)
      .json({ status: "success", message: "environment configs retrieved", data: configs });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "environmentConfig",
      appUsername: req.session?.appUser?.username,
      message: `Error retrieving environment configs: ${e}`,
      error: asError(e),
    });
    res
      .status(500)
      .json({ status: "error", message: `Error retrieving environment configs: ${e}` });
  }
});

// GET /:key — return a single entry by key
router.get("/:key", async (req: Request, res: Response): Promise<void> => {
  if (!req.session.appUser?.isSuperAdmin) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  const key = String(req.params.key);
  if (!isKnownKey(key)) {
    res.status(404).json({ status: "error", message: `Unknown environment config key: ${key}` });
    return;
  }

  try {
    const config = await getEnvironmentConfig(key);
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

// POST /:key — set (or clear) the stored value for one key
router.post("/:key", async (req: Request, res: Response): Promise<void> => {
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

  const key = String(req.params.key);
  if (!isKnownKey(key)) {
    res.status(404).json({ status: "error", message: `Unknown environment config key: ${key}` });
    return;
  }

  const { value } = req.body as { value: string | null };

  try {
    const config = await upsertDatabaseRetry(() => setEnvironmentConfigValue(key, value ?? null));

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

/**
 * Return the config entry for a single key.
 */
export async function getEnvironmentConfig(key: string): Promise<EnvironmentConfigData> {
  if (!isKnownKey(key)) {
    throw new Error(`Unknown environment config key: ${key}`);
  }
  const em = globalValues.orm.em;
  const row = await em.findOne(EnvironmentConfig_db, { key });
  return buildConfigData(key, row);
}

/** Return every registered config entry (used by the admin UI). */
async function getAllEnvironmentConfigs(): Promise<EnvironmentConfigData[]> {
  const em = globalValues.orm.em;
  const rows = await em.find(EnvironmentConfig_db, {});
  const rowByKey = new Map(rows.map((r) => [r.key, r]));

  return Object.keys(CONFIG_LIST).map((key) =>
    buildConfigData(key as EnvConfigKey, rowByKey.get(key) ?? null)
  );
}

async function setEnvironmentConfigValue(
  key: EnvConfigKey,
  value: string | null
): Promise<EnvironmentConfigData> {
  const em = globalValues.orm.em;
  const normalized = value?.trim() ? value.trim() : null;

  const now = new Date();
  let row = await em.findOne(EnvironmentConfig_db, { key });
  if (row) {
    row.value = normalized;
    row.updatedAt = now;
    em.persist(row);
  } else {
    row = em.create(EnvironmentConfig_db, {
      key,
      value: normalized,
      createdAt: now,
      updatedAt: now,
    });
    em.persist(row);
  }
  await em.flush();

  return buildConfigData(key, row);
}

function buildConfigData(
  key: EnvConfigKey,
  row: EnvironmentConfig_db | null
): EnvironmentConfigData {
  const entry = CONFIG_LIST[key];
  const defaultValue = entry.defaultValue();
  const databaseValue = row?.value ?? null;
  const isOverridden = databaseValue !== null && databaseValue.trim() !== "";
  return {
    key,
    config: row
      ? {
          value: row.value,
          description: row.description,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }
      : null,
    defaultValue,
    effectiveValue: isOverridden ? databaseValue : defaultValue,
    isOverridden,
  };
}
