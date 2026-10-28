import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import fs from "node:fs";
import path from "node:path";

import express from "express";

import { SCHEMA_DIR } from "utils/validateSchemaServer";
import { hasPerms } from "utils/permissions";
import { globalValues } from "../global";
import { getAutomergeMissionHandle } from "./missionAutomerge";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import {
  applyDeleteSublayers,
  applyUpsertSublayers,
  normalizeSublayerInput,
} from "operations/apply/apply-mission-layer";

const router = express.Router();

/** Thrown when the request body references data that does not exist; answered as a 400. */
class SublayerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SublayerInputError";
  }
}

const parseQuery = (query: Query) => {
  const { missionId, uuid } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    uuid: uuid ? uuid.toString() : null,
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!viewPermission) {
    serverLogger.apiRoute({
      logId: "api-route:sublayer:GET:unauthorizedRequestMissingViewPermission",
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "sublayer",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.uuid ? [queryObj.uuid] : [],
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    serverLogger.apiRoute({
      logId: "api-route:sublayer:GET:rejectedInvalidMissionId",
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "sublayer",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.uuid ? [queryObj.uuid] : [],
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  try {
    const records: Sublayer[] = await getSublayers(queryObj.missionId, queryObj.uuid);

    res.status(200).json({
      status: "success",
      message: "sublayers retrieved",
      data: records,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logId: "api-route:sublayer:GET:failedToRetrieveSublayers",
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "sublayer",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.uuid ? [queryObj.uuid] : [],
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "sublayerImportable.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "importableSublayer schema retrieved",
      data: schema,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logId: "api-route:sublayer/schema:GET:failedToRetrieveSublayerJsonSchema",
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "sublayer/schema",
      appUsername: req.session?.appUser?.username,
      message: `Error retrieving schema: ${e}`,
      error: asError(e),
    });
    res.status(500).json({
      status: "error",
      message: `Error retrieving schema: ${e}`,
      data: null,
    });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, sublayers } = req.body as SublayerUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logId: "api-route:sublayer:POST:unauthorizedRequestMissingEditPermission",
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "sublayer",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: sublayers?.map((s) => s.uuid),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!missionId || isNaN(missionId)) {
    serverLogger.apiRoute({
      logId: "api-route:sublayer:POST:rejectedInvalidMissionId",
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "sublayer",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    // validate
    if (!sublayers || sublayers.length === 0) {
      serverLogger.apiRoute({
        logId: "api-route:sublayer:POST:rejectedNoSublayersProvidedInRequestBody",
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "sublayer",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: sublayers?.map((s) => s.uuid),
        message: `No sublayers provided in request body`,
      });
      res.status(400).json({ status: "failure", message: `No sublayers provided in request body` });
      return;
    }
    const upsertResponse: Sublayer[] = await upsertSublayers(missionId, sublayers);

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      serverLogger.apiRoute({
        logId: "api-route:sublayer:POST:upsertSublayersReturnedNoSublayers",
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "sublayer",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: sublayers?.map((s) => s.uuid),
        message: "Failed to update sublayer",
        error: new Error("Failed to update sublayer"),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update sublayer",
        data: null,
      });
      return;
    }

    res.status(200).json({
      status: "success",
      message: `Sublayer upserted with ID ${upsertResponse.map((s) => s.uuid)}`,
      data: upsertResponse,
    });
  } catch (e) {
    if (e instanceof SublayerInputError) {
      serverLogger.apiRoute({
        logId: "api-route:sublayer:POST:rejectedInvalidSublayerInput",
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "sublayer",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: sublayers?.map((s) => s.uuid),
        message: e.message,
      });
      res.status(400).json({ status: "failure", message: e.message });
      return;
    }
    serverLogger.apiRoute({
      logId: "api-route:sublayer:POST:unexpectedErrorUpsertingSublayers",
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "sublayer",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: sublayers?.map((s) => s.uuid),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, sublayerUuids } = req.body as SublayerDeleteRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logId: "api-route:sublayer:DELETE:unauthorizedRequestMissingEditPermission",
      logLevel: "warning",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "sublayer",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: sublayerUuids,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!missionId || isNaN(missionId)) {
    serverLogger.apiRoute({
      logId: "api-route:sublayer:DELETE:rejectedInvalidMissionId",
      logLevel: "notice",
      httpMethod: "DELETE",
      responseStatus: 400,
      routeName: "sublayer",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    const deletedUUIDs = await deleteSublayers(missionId, sublayerUuids);

    if (deletedUUIDs.length > 0) {
      res.status(200).json({
        status: "success",
        message: "Sublayer Deleted",
      });
    } else {
      serverLogger.apiRoute({
        logId: "api-route:sublayer:DELETE:sublayerRecordNotFoundNothingDeleted",
        logLevel: "notice",
        httpMethod: "DELETE",
        responseStatus: 404,
        routeName: "sublayer",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: sublayerUuids,
        message: "Record not found. Nothing deleted",
      });
      res.status(404).json({
        status: "failure",
        message: "Record not found. Nothing deleted",
      });
    }
  } catch (e) {
    serverLogger.apiRoute({
      logId: "api-route:sublayer:DELETE:unexpectedErrorDeletingSublayers",
      logLevel: "error",
      httpMethod: "DELETE",
      responseStatus: 500,
      routeName: "sublayer",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: sublayerUuids,
      message: "Error processing the DELETE request",
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: "Error processing the DELETE request" });
  }
});

export default router;

/**
 * get sublayer(s) from the mission doc
 * @param missionId required. Mission ID for the sublayers.
 * @param sublayerUuid optional. UUID of the sublayer to retrieve
 * @returns array of sublayers sorted by name
 */
export async function getSublayers(missionId: number, sublayerUuid?: string): Promise<Sublayer[]> {
  const handle = await getAutomergeMissionHandle(missionId);
  const records = Object.values(handle?.doc()?.sublayers ?? {}).filter(
    (record) => !sublayerUuid || record.uuid === sublayerUuid
  );
  return JSON.parse(JSON.stringify(records)).sort((a: Sublayer, b: Sublayer) =>
    a.name.localeCompare(b.name)
  );
}

/**
 * Inserts or updates sublayers in the mission doc. Presets are kept in sync in the same change.
 * @returns a copy of the sublayers as stored
 */
async function upsertSublayers(missionId: number, sublayers: Sublayer[]): Promise<Sublayer[]> {
  const handle = await getAutomergeMissionHandle(missionId);
  if (!handle) throw new Error(`No mission document found for mission ${missionId}`);
  const doc = handle.doc();
  const layers = doc?.layers ?? {};
  // An omitted layerUuid keeps the stored one, as normalizeSublayerInput does
  const unknownLayerUuids = sublayers
    .map((sublayer) => sublayer.layerUuid ?? doc?.sublayers?.[sublayer.uuid]?.layerUuid)
    .filter((layerUuid) => !layerUuid || !(layerUuid in layers));
  if (unknownLayerUuids.length > 0) {
    throw new SublayerInputError(
      `Unknown layerUuid(s): ${[...new Set(unknownLayerUuids.map(String))].join(", ")}`
    );
  }
  let normalized: Sublayer[] = [];
  handle.change((m: Mission) => {
    normalized = sublayers.map((record) => normalizeSublayerInput(m, record));
    applyUpsertSublayers(m, normalized);
  });
  await globalValues.automergeRepo.flush();
  return normalized;
}

/**
 * Deletes sublayers from the mission doc. Presets and folders are cleaned up in the same change.
 * @returns the uuids of the deleted sublayers
 */
async function deleteSublayers(missionId: number, uuids: string[]): Promise<string[]> {
  const handle = await getAutomergeMissionHandle(missionId);
  const existing = handle?.doc()?.sublayers ?? {};
  const deletedUuids = (uuids ?? []).filter((uuid) => uuid in existing);
  if (!handle || deletedUuids.length === 0) return [];
  handle.change((m: Mission) => applyDeleteSublayers(m, deletedUuids));
  await globalValues.automergeRepo.flush();
  return deletedUuids;
}
