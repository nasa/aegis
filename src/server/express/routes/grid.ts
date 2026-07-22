import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import * as fs from "node:fs";
import { mkdir } from "node:fs/promises";

import express from "express";
import parseInt from "lodash/parseInt";

import { findClosestPointInGlobalGrid } from "utils/mapping/geoMath";
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { getAutomergeMissionHandle } from "./missionAutomerge";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, getFullGrids, radius, points } = query;
  const pointList = points ? (JSON.parse(points as string) as AEGISPoint[]) : undefined;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    radius: radius ? parseInt(radius as string) : undefined,
    pointList: pointList || undefined,
    getFullGrids: getFullGrids === "true",
  };
  return queryObj;
};

// get grid
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
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
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
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  try {
    const grid: MissionGrid | null = await getGrid(queryObj.missionId, queryObj.getFullGrids);

    res.status(200).json({
      status: "success",
      message: "grid retrieved",
      data: grid,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// get closest point
router.get("/closestPoint", async (req: Request, res: Response): Promise<void> => {
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
      routeName: "grid/closestPoint",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
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
      routeName: "grid/closestPoint",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  if (!queryObj.pointList || !queryObj.radius) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "grid/closestPoint",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Missing query object",
    });
    res.status(400).json({ status: "error", message: "Missing query object" });
    return;
  }
  try {
    const index: GridIndex[] = await getClosestPoints(
      queryObj.missionId,
      queryObj.pointList,
      queryObj.radius
    );

    res.status(200).json({
      status: "success",
      message: "grids retrieved",
      data: index,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "grid/closestPoint",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { grid, missionId, upsertFullGrid } = req.body as GridUpsertRequest;
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
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    if (!grid || !grid.gridInformation) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "grid",
        appUsername: req.session?.appUser?.username,
        missionId,
        message: "No grid provided in request body",
      });
      res.status(400).json({ status: "error", message: "No grid provided in request body" });
      return;
    }

    const upsertResponse: MissionGrid = await upsertGrid(missionId, grid, upsertFullGrid);

    res.status(200).json({
      status: "success",
      message: `Grid upserted for mission ${missionId}`,
      data: upsertResponse,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId } = req.body as GridDeleteRequest;
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
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deleted = await deleteGrid(missionId);

    if (deleted) {
      res.status(200).json({
        status: "success",
        message: "Grid Deleted",
      });
    } else {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "DELETE",
        responseStatus: 404,
        routeName: "grid",
        appUsername: req.session?.appUser?.username,
        missionId,
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
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId,
      message: "Error processing the DELETE request",
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: "Error processing the DELETE request" });
  }
});

export default router;

/**
 * Get the mission's single grid: metadata from the mission Automerge doc and
 * (optionally) the coordinate array from the on-disk file.
 * @returns the grid, or null if the mission has no grid
 */
export async function getGrid(
  missionId: number,
  getFullGrid: boolean
): Promise<MissionGrid | null> {
  const handle = await getAutomergeMissionHandle(missionId);
  const definition = handle?.doc()?.grid;
  if (!definition) return null;

  const coordinates: MissionGridPoint[][] | null = getFullGrid
    ? await getGridFromFile(missionId, definition.fileName)
    : null;
  return { gridInformation: definition, coordinates };
}

async function getGridFromFile(missionId: number, fileName: string): Promise<MissionGridPoint[][]> {
  const filePath = `${process.env.STATIC_DIR}/missionFiles/${missionId}/Data/${fileName}`;

  // Call the readJsonFile function to read the file and parse it
  const grid = (await readJsonFile(filePath)) as MissionGridPoint[][];
  return grid;
}

const readJsonFile = async (filePath: string) => {
  return new Promise((resolve, reject) => {
    // Use fs.readFile to read the file as text
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        return reject(err); // Handle file read error
      }

      try {
        // Parse the JSON content and resolve the promise
        const jsonData = JSON.parse(data);
        resolve(jsonData);
      } catch (parseError) {
        reject(parseError); // Handle JSON parse error
      }
    });
  });
};

/**
 * get the closest point's index in the mission grid to each chosen point
 * @returns array of grid indices
 */
async function getClosestPoints(
  missionId: number,
  points: AEGISPoint[],
  radius: number
): Promise<GridIndex[]> {
  const handle = await getAutomergeMissionHandle(missionId);
  const definition = handle?.doc()?.grid;
  if (!definition) return [];

  const grid: MissionGridPoint[][] = await getGridFromFile(missionId, definition.fileName);

  const closestPoints: GridIndex[] = [];
  for (let i = 0; i < points.length; i++) {
    const point: AEGISPoint = points[i];
    const closestPointIndex: GridIndex = findClosestPointInGlobalGrid(grid, point, radius);
    closestPoints.push(closestPointIndex);
  }

  return closestPoints;
}

/**
 * Insert or update the mission's grid. Writes the coordinate file to disk (when
 * `upsertFullGrid`) and the grid metadata into the mission Automerge doc.
 * @returns the upserted grid
 */
async function upsertGrid(
  missionId: number,
  grid: MissionGrid,
  upsertFullGrid: boolean
): Promise<MissionGrid> {
  if (upsertFullGrid) {
    await saveGridFile(missionId, grid);
  }

  const handle = await getAutomergeMissionHandle(missionId);
  if (!handle) {
    throw new Error(`No mission document found for mission ${missionId}`);
  }
  handle.change((m: Mission) => {
    m.grid = grid.gridInformation;
    m.updatedAt = new Date().getTime();
  });

  return grid;
}

async function saveGridFile(missionId: number, grid: MissionGrid): Promise<void> {
  const jsonContent = JSON.stringify(grid.coordinates, null, 2);

  const directory = `${process.env.STATIC_DIR}/missionFiles/${missionId}/Data`;

  if (!fs.existsSync(directory)) {
    await mkdir(directory, { recursive: true });
  }

  // Write the JSON string to a file
  fs.writeFile(`${directory}/${grid.gridInformation.fileName}`, jsonContent, "utf8", (err) => {
    if (err) {
      serverLogger.error(
        { logId: "grid", logValue: "Error writing file" },
        err instanceof Error ? err : new Error(String(err))
      );
      return;
    }
  });
}

/**
 * Delete the mission's grid: removes the coordinate file and clears the grid
 * metadata on the mission Automerge doc.
 * @returns true if a grid was deleted, false if the mission had no grid
 */
async function deleteGrid(missionId: number): Promise<boolean> {
  const handle = await getAutomergeMissionHandle(missionId);
  const definition = handle?.doc()?.grid;
  if (!handle || !definition) return false;

  deleteGridFile(missionId, definition.fileName);
  handle.change((m: Mission) => {
    m.grid = null;
    m.updatedAt = new Date().getTime();
  });
  return true;
}

function deleteGridFile(missionId: number, gridFileName: string): void {
  const fileName = `${process.env.STATIC_DIR}/missionFiles/${missionId}/Data/${gridFileName}`;

  fs.unlink(fileName, (err) => {
    if (err) {
      serverLogger.error({ logId: "grid", logValue: `Error deleting file ${fileName}` }, err);
      return;
    }
  });
}
