import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { hasPerms } from "utils/permissions";
import { globalValues } from "../global";
import { getAutomergeMissionHandle } from "./missionAutomerge";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import {
  applyDeleteLayers,
  applyUpsertLayers,
  normalizeLayerInput,
} from "operations/apply/apply-mission-layer";

const router = express.Router();

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
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "layer",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.uuid ? [queryObj.uuid] : undefined,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "layer",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.uuid ? [queryObj.uuid] : undefined,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  try {
    const records: Layer[] = await getLayers(queryObj.missionId, queryObj.uuid);

    res.status(200).json({
      status: "success",
      message: "layers retrieved",
      data: records,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "layer",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.uuid ? [queryObj.uuid] : undefined,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, layers } = req.body as LayerUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "layer",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: layers?.map((l) => l.uuid),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!missionId || isNaN(missionId)) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "layer",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    // validate
    if (!layers || layers.length === 0) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "layer",
        appUsername: req.session?.appUser?.username,
        missionId,
        message: "No layers provided in request body",
      });
      res.status(400).json({ status: "error", message: "No layers provided in request body" });
      return;
    }

    const upsertResponse: Layer[] = await upsertLayers(missionId, layers);

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "layer",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: layers?.map((l) => l.uuid),
        message: "Failed to update layer",
        error: new Error("Failed to update layer"),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update layer",
        data: null,
      });
      return;
    }

    res.status(200).json({
      status: "success",
      message: `Layer upserted with ID ${upsertResponse.map((l) => l.uuid)}`,
      data: upsertResponse,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "layer",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: layers?.map((l) => l.uuid),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, layerUuids } = req.body as LayerDeleteRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "layer",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: layerUuids,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!missionId || isNaN(missionId)) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "DELETE",
      responseStatus: 400,
      routeName: "layer",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    const deletedUUIDs = await deleteLayers(missionId, layerUuids);

    if (deletedUUIDs.length > 0) {
      res.status(200).json({
        status: "success",
        message: "Layer Deleted",
      });
    } else {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "DELETE",
        responseStatus: 404,
        routeName: "layer",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: layerUuids,
        message: "Record not found. Nothing deleted",
      });
      res.status(404).json({
        status: "failure",
        message: "Record not found. Nothing deleted",
      });
    }
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "DELETE",
      responseStatus: 500,
      routeName: "layer",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: layerUuids,
      message: `Error processing the DELETE request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the DELETE request ${e}` });
  }
});

export default router;

/**
 * get layer(s) from the mission doc
 * @param missionId required. Mission ID for the layers.
 * @param layerUuid optional. UUID of the layer to retrieve
 * @returns array of layers sorted by name
 */
export async function getLayers(missionId: number, layerUuid?: string): Promise<Layer[]> {
  const handle = await getAutomergeMissionHandle(missionId);
  const records = Object.values(handle?.doc()?.layers ?? {}).filter(
    (record) => !layerUuid || record.uuid === layerUuid
  );
  return JSON.parse(JSON.stringify(records)).sort((a: Layer, b: Layer) =>
    a.name.localeCompare(b.name)
  );
}

/**
 * Inserts or updates layers in the mission doc. Presets are kept in sync in the same change.
 * @returns a copy of the layers as stored
 */
async function upsertLayers(missionId: number, layers: Layer[]): Promise<Layer[]> {
  const handle = await getAutomergeMissionHandle(missionId);
  if (!handle) throw new Error(`No mission document found for mission ${missionId}`);
  let normalized: Layer[] = [];
  handle.change((m: Mission) => {
    normalized = layers.map((record) => normalizeLayerInput(m, record));
    applyUpsertLayers(m, normalized);
  });
  await globalValues.automergeRepo.flush();
  return normalized;
}

/**
 * Deletes layers from the mission doc. Presets and folders are cleaned up in the same change.
 * @returns the uuids of the deleted layers
 */
async function deleteLayers(missionId: number, uuids: string[]): Promise<string[]> {
  const handle = await getAutomergeMissionHandle(missionId);
  const existing = handle?.doc()?.layers ?? {};
  const deletedUuids = (uuids ?? []).filter((uuid) => uuid in existing);
  if (!handle || deletedUuids.length === 0) return [];
  handle.change((m: Mission) => applyDeleteLayers(m, deletedUuids));
  await globalValues.automergeRepo.flush();
  return deletedUuids;
}
