import type { Loaded } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import * as fs from "node:fs";
import { mkdir } from "node:fs/promises";

import { ForeignKeyConstraintViolationException, QueryOrder } from "@mikro-orm/postgresql";
import express from "express";
import parseInt from "lodash/parseInt";
import cloneDeep from "lodash/cloneDeep";

import { Grid_db } from "server/database/models/_allModels";
import { findClosestPointInGlobalGrid } from "utils/mapping/geoMath";
import { hasPerms } from "utils/permissions";
import { globalValues } from "../global";
import { upsertDatabaseRetry } from "utils/database";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { getAutomergeDocListing } from "./docListing";
import { AutomergeUrl } from "@automerge/automerge-repo";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, gridUuid, getFullGrids, radius, points } = query;
  const pointList = points ? (JSON.parse(points as string) as AEGISPoint[]) : undefined;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    gridUuid: (gridUuid as string) || undefined,
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
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.gridUuid ? [queryObj.gridUuid] : undefined,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    apiRouteLogger({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.gridUuid ? [queryObj.gridUuid] : undefined,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  try {
    const grids: MissionGrid[] = await getGrids(
      queryObj.missionId,
      queryObj.getFullGrids,
      queryObj.gridUuid
    );

    res.status(200).json({
      status: "success",
      message: "grids retrieved",
      data: grids,
    });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.gridUuid ? [queryObj.gridUuid] : undefined,
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
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "grid/closestPoint",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.gridUuid ? [queryObj.gridUuid] : undefined,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    apiRouteLogger({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "grid/closestPoint",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.gridUuid ? [queryObj.gridUuid] : undefined,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  if (!queryObj.gridUuid || !queryObj.pointList || !queryObj.radius) {
    apiRouteLogger({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "grid/closestPoint",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.gridUuid ? [queryObj.gridUuid] : undefined,
      message: "Missing query object",
    });
    res.status(400).json({ status: "error", message: "Missing query object" });
    return;
  }
  try {
    const index: GridIndex[] = await getClosestPoints(
      queryObj.missionId,
      queryObj.gridUuid,
      queryObj.pointList,
      queryObj.radius
    );

    res.status(200).json({
      status: "success",
      message: "grids retrieved",
      data: index,
    });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "grid/closestPoint",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: queryObj.gridUuid ? [queryObj.gridUuid] : undefined,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { grids, missionId, upsertFullGrid } = req.body as GridUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: grids?.map((g) => g.gridInformation.uuid),
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    // validate
    if (!grids || grids.length === 0) {
      apiRouteLogger({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "grid",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: grids?.map((g) => g.gridInformation.uuid),
        message: "No grids provided in request body",
      });
      res.status(400).json({ status: "error", message: "No grids provided in request body" });
      return;
    }

    const upsertResponse: MissionGrid[] = await upsertDatabaseRetry(() =>
      upsertGrids(grids, upsertFullGrid)
    );

    // Check response
    if (!upsertResponse || upsertResponse.length === 0) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "grid",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: grids?.map((g) => g.gridInformation.uuid),
        message: "Failed to update grid after multiple tries due to optimistic locking",
        error: new Error("Failed to update grid after multiple tries due to optimistic locking"),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update grid after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    res.status(200).json({
      status: "success",
      message: `Grids upserted with IDs ${upsertResponse.map((s) => s.gridInformation.uuid)}`,
      data: upsertResponse,
    });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: grids?.map((g) => g.gridInformation.uuid),
      message: `Error processing the POST request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { gridUuid, missionId } = req.body as GridDeleteRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = hasPerms({
    missionId,
    permission: "edit",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!editPermission) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "DELETE",
      responseStatus: 401,
      routeName: "grid",
      appUsername: req.session?.appUser?.username,
      missionId,
      uuids: [gridUuid],
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const deletedUuids = await deleteGrids(missionId, [gridUuid]);

    if (deletedUuids.length > 0) {
      res.status(200).json({
        status: "success",
        message: "Grid Deleted",
      });
    } else {
      apiRouteLogger({
        logLevel: "notice",
        httpMethod: "DELETE",
        responseStatus: 404,
        routeName: "grid",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: [gridUuid],
        message: "Record not found. Nothing deleted",
      });
      res.status(404).json({
        status: "failure",
        message: "Record not found. Nothing deleted",
      });
    }
  } catch (e) {
    if (e instanceof ForeignKeyConstraintViolationException) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "DELETE",
        responseStatus: 500,
        routeName: "grid",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: [gridUuid],
        message: "Cannot delete grid. This grid is referenced elsewhere",
        error: asError(e),
      });
      res.status(500).json({
        status: "error",
        message: "Cannot delete grid. This grid is referenced elsewhere",
      });
    } else {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "DELETE",
        responseStatus: 500,
        routeName: "grid",
        appUsername: req.session?.appUser?.username,
        missionId,
        uuids: [gridUuid],
        message: "Error processing the DELETE request",
        error: asError(e),
      });
      res.status(500).json({ status: "error", message: "Error processing the DELETE request" });
    }
  }
});

export default router;

/**
 * get grid information from the database
 * @param gridUUID optional. UUID of the grid to retrieve
 * @returns array of grids
 */
async function getGridsInformation(
  missionId: number,
  gridUUID?: string
): Promise<MissionGridInformation[]> {
  const em = globalValues.orm.em;

  //find grids by uuid
  let dbGrids: Loaded<Grid_db, "missions">[];

  if (gridUUID) {
    dbGrids = await em.find(Grid_db, { uuid: gridUUID }, { orderBy: [{ name: QueryOrder.ASC }] });
  } else if (missionId) {
    dbGrids = await em.find(Grid_db, { missionId }, { orderBy: [{ name: QueryOrder.ASC }] });
  } else {
    dbGrids = await em.find(Grid_db, {}, { orderBy: [{ name: QueryOrder.ASC }] });
  }

  return dbGrids;
}

/**
 * Get grid information from database, and grid coordinates from static files.
 * @param gridUUID optional. UUID of the grid to retrieve
 * @returns array of grids
 */
export async function getGrids(
  missionId: number,
  getFullGrids: boolean,
  gridUUID?: string
): Promise<MissionGrid[]> {
  const gridInfo: MissionGridInformation[] = await getGridsInformation(missionId, gridUUID);
  const grids: MissionGrid[] = [];

  for (const info of gridInfo) {
    const gridCoords: MissionGridPoint[][] = getFullGrids
      ? await getGridFromFile(info.missionId, info.uuid, info.fileName)
      : null;
    grids.push({ gridInformation: info, coordinates: gridCoords });
  }

  return grids;
}

async function getGridFromFile(
  missionId: number,
  gridUuid: string,
  fileName?: string
): Promise<MissionGridPoint[][]> {
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
 * get the closest point's index in the grid to the chosen point
 * @param gridUUID optional. UUID of the grid to retrieve
 * @returns array of grids
 */
async function getClosestPoints(
  missionId: number,
  gridUUID: string,
  points: AEGISPoint[],
  radius: number
): Promise<GridIndex[]> {
  //find grids by either mission Id or uuid
  const grid: MissionGridPoint[][] = await getGridFromFile(missionId, gridUUID);

  // Use PostGIS function to find the closest point
  const closestPoints: GridIndex[] = [];
  for (let i = 0; i < points.length; i++) {
    const point: AEGISPoint = points[i];
    const closestPointIndex: GridIndex = findClosestPointInGlobalGrid(grid, point, radius);
    closestPoints.push(closestPointIndex);
  }

  return closestPoints;
}

/**
 * Inserts or Updates grid into the database
 * @param grids the grids to upsert
 * @returns a copy of the grids that was upserted
 */
async function upsertGridsInformation(
  grids: MissionGridInformation[]
): Promise<MissionGridInformation[]> {
  const em = globalValues.orm.em;
  await em.begin(); // Start a transaction

  const gridsToUpsert = cloneDeep(grids); // Create a copy to manipulate
  const gridsUpsertedToDb: Grid_db[] = [];

  try {
    for (const gridToUpsert of gridsToUpsert) {
      const gridRefFromDb: Grid_db = await em.upsert(Grid_db, gridToUpsert);
      em.persist(gridRefFromDb);
      gridsUpsertedToDb.push(gridRefFromDb);
    }
    await em.commit(); // Flush and commit the transaction

    // if everything went well, also update mission automerge doc
    for (const gridToUpsert of gridsToUpsert) {
      if (gridToUpsert.missionId) {
        const automergeUrl = (await getAutomergeDocListing([gridToUpsert.missionId]))[0];
        const missionDocHandle = await globalValues.automergeRepo.find(
          automergeUrl.automergeUrl as AutomergeUrl
        );
        await missionDocHandle.whenReady();
        missionDocHandle.change((m: Mission) => {
          // update isActiveGrid for mission
          m.activeGridUuid = gridToUpsert.isActiveGrid ? gridToUpsert.uuid : null;
        });
      }
    }
  } catch (e) {
    await em.rollback(); // Rollback the transaction
    throw e; // Re-throw the error to be handled by the caller
  }

  return gridsUpsertedToDb;
}

/**
 * Inserts or Updates grid into the database
 * @param grid the grid to upsert
 * @returns a copy of the grids that was upserted
 */
async function upsertGrids(grids: MissionGrid[], upsertFullGrid: boolean): Promise<MissionGrid[]> {
  const gridsToReturn: MissionGrid[] = [];
  const gridsInfo: MissionGridInformation[] = await upsertGridsInformation(
    grids.map((g) => g.gridInformation)
  );

  for (let i = 0; i < grids.length; i++) {
    if (upsertFullGrid) {
      await saveGridFile(gridsInfo[i].missionId, grids[i]);
    }
    gridsToReturn.push({ gridInformation: gridsInfo[i], coordinates: grids[i].coordinates });
  }
  return gridsToReturn;
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
      console.error("Error writing file", err);
      return;
    }
  });
}

/**
 * Deletes grids
 * @param gridUuids grid uuids to delete
 * @returns the uuids of the deleted grid
 */
async function deleteGrids(missionId: number, gridUuids: string[]): Promise<string[]> {
  const em = globalValues.orm.em;
  const deletedUuids = [];
  for (const gridUuid of gridUuids) {
    const gridRecord = await em.findOne(Grid_db, { uuid: gridUuid });
    if (gridRecord) {
      if (gridRecord.missionId) {
        // update the mission document if it was using this grid as active grid
        const missionAutomergeUrl = await getAutomergeDocListing([gridRecord.missionId]);
        if (missionAutomergeUrl.length > 0) {
          const missionDocHandle: DocHandle<Mission> = await globalValues.automergeRepo.find(
            missionAutomergeUrl[0].automergeUrl as AutomergeUrl
          );
          await missionDocHandle.whenReady();
          if (missionDocHandle.doc().activeGridUuid === gridUuid) {
            missionDocHandle.change((m: Mission) => {
              if (m.activeGridUuid === gridUuid) {
                m.activeGridUuid = null;
              }
            });
          }
        }
      }

      em.remove(gridRecord);
      deleteGridFile(missionId, gridRecord.fileName);
      deletedUuids.push(gridUuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}

function deleteGridFile(missionId: number, gridFileName: string): void {
  const fileName = `${process.env.STATIC_DIR}/missionFiles/${missionId}/Data/${gridFileName}`;

  fs.unlink(fileName, (err) => {
    if (err) {
      console.error(`Error deleting file ${fileName}:`, err);
      return;
    }
  });
}
