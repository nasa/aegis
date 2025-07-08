import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import parseInt from "lodash/parseInt";
import cloneDeep from "lodash/cloneDeep";

import { hasPerms } from "utils/permissions";

import { getEM } from "utils/mikro";
import {
  Loaded,
  EntityData,
  QueryOrder,
  ForeignKeyConstraintViolationException,
} from "@mikro-orm/core";
import { findClosestPointInGrid } from "utils/geoMath";
import { Grid_db, Mission_db } from "server/database/models/_allModels";
import * as fs from "fs";
import { mkdir } from "node:fs/promises";

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

  const viewPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    user: req.session.user,
    emssToken,
  });
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
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
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// get closest point
router.get("/closestPoint", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    user: req.session.user,
    emssToken,
  });
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  if (!queryObj.gridUuid || !queryObj.pointList || !queryObj.radius) {
    res.status(500).json({ status: "error", message: "Missing query object" });
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
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { grids, missionId, upsertFullGrid } = req.body as GridUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = await hasPerms({
    missionId,
    permission: "edit",
    user: req.session.user,
    emssToken,
  });
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const upsertResponse: MissionGrid[] = await upsertGrids(grids, upsertFullGrid);

    //check response
    if (upsertResponse === null) {
      res.status(500).json({
        status: "error",
        message: "Upsert response did not return a value",
        data: null,
      });
    }

    res.status(200).json({
      status: "success",
      message: `Grids upserted with IDs ${upsertResponse.map((s) => s.gridInformation.uuid)}`,
      data: upsertResponse,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { gridUuid, missionId } = req.body as GridDeleteRequest;
  const emssToken = req.headers["emss-token"] as string;

  const editPermission = await hasPerms({
    missionId,
    permission: "edit",
    user: req.session.user,
    emssToken,
  });
  if (!editPermission) {
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
      res.status(404).json({
        status: "failure",
        message: "Record not found. Nothing deleted",
      });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ForeignKeyConstraintViolationException) {
      res.status(500).json({
        status: "error",
        message: "Cannot delete grid. This grid is referenced elsewhere",
      });
    } else {
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
export async function getGridsInformation(
  missionId: number,
  gridUUID?: string
): Promise<MissionGridInformation[]> {
  const em = getEM();

  //find grids by uuid
  let dbgrids: Loaded<Grid_db, "missions">[];

  if (gridUUID) {
    dbgrids = await em.find(
      Grid_db,
      { uuid: gridUUID },
      {
        orderBy: [{ name: QueryOrder.ASC }],
        populate: ["mission"],
      }
    );
  } else if (missionId) {
    dbgrids = await em.find(
      Grid_db,
      { mission: { id: missionId } },
      {
        orderBy: [{ name: QueryOrder.ASC }],
        populate: ["mission"],
      }
    );
  } else {
    dbgrids = await em.find(
      Grid_db,
      {},
      { orderBy: [{ name: QueryOrder.ASC }], populate: ["mission"] }
    );
  }

  const converted = convertGridsTypeDbToLocal(dbgrids);
  return converted;
}

/**
 * get grid information from the database
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
      ? await getGridFromFile(info.missionId, info.uuid)
      : null;
    grids.push({ gridInformation: info, coordinates: gridCoords });
  }

  return grids;
}

export async function getGridFromFile(
  missionId: number,
  gridUuid: string
): Promise<MissionGridPoint[][]> {
  const fileName = `${process.env.STATIC_DIR}/missionFiles/${missionId}/Data/grid_${gridUuid}.json`;

  // Call the readJsonFile function to read the file and parse it
  const grid = (await readJsonFile(fileName)) as MissionGridPoint[][];
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
export async function getClosestPoints(
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
    const closestPointIndex: GridIndex = findClosestPointInGrid(grid, point, radius);
    closestPoints.push(closestPointIndex);
  }

  return closestPoints;
}

/**
 * Inserts or Updates grid into the database
 * @param grids the grids to upsert
 * @returns a copy of the grids that was upserted
 */
export async function upsertGridsInformation(
  grids: MissionGridInformation[]
): Promise<MissionGridInformation[]> {
  const em = getEM();

  const gridsToUpsert = cloneDeep(grids); //create a copy to manipulate
  const gridsUpsertedToDb = [];

  for (const gridToUpsert of gridsToUpsert) {
    const convertedGrid: EntityData<Grid_db> = convertGridsTypeStoreToDb([gridToUpsert])[0];

    //upsert grid
    const gridRefFromDb: Grid_db = await em.upsert(Grid_db, convertedGrid);
    try {
      await em.populate(gridRefFromDb, ["mission"]); // need to populate mission in order to remove them
    } catch (error) {
      console.error("Error populating mission:", error);
    }

    //remove all missions
    gridRefFromDb.mission = undefined;
    //add back missions
    if (gridToUpsert.missionId) {
      const missionReference = em.getReference(Mission_db, gridToUpsert.missionId);
      gridRefFromDb.mission = missionReference;
      if (gridRefFromDb.isActiveGrid) {
        missionReference.activeGridUuid = gridRefFromDb.uuid;
      }

      // Persist the mission reference
      em.persist(missionReference);
    }

    em.persist(gridRefFromDb);
    gridsUpsertedToDb.push(gridRefFromDb);
  }

  await em.flush();
  //convert foreign keys
  const converted = convertGridsTypeDbToLocal(gridsUpsertedToDb);
  return converted;
}

/**
 * Inserts or Updates grid into the database
 * @param grid the grid to upsert
 * @returns a copy of the grids that was upserted
 */
export async function upsertGrids(
  grids: MissionGrid[],
  upsertFullGrid: boolean
): Promise<MissionGrid[]> {
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
  fs.writeFile(
    `${directory}/grid_${grid.gridInformation.uuid}.json`,
    jsonContent,
    "utf8",
    (err) => {
      if (err) {
        console.error("Error writing file", err);
        return;
      }
    }
  );
}

/**
 * Deletes grids and the entity relationships to any Missions.
 * This operation does not touch actions. Actions should be removed by calling the Actions API directly.
 * @param gridUuids grid uuids to delete
 * @returns the uuids of the deleted grid
 */
export async function deleteGrids(missionId: number, gridUuids: string[]): Promise<string[]> {
  const em = getEM();
  const deletedUuids = [];
  for (const gridUuid of gridUuids) {
    const entity = await em.findOne(Grid_db, { uuid: gridUuid }, { populate: ["mission"] });
    if (entity) {
      if (entity.mission) {
        const missionReference = entity.mission;
        if (missionReference.activeGridUuid === gridUuid) {
          missionReference.activeGridUuid = null;
          em.persist(missionReference);
        }

        // Persist the mission reference
      }
      em.remove(entity);
      deleteGridFile(missionId, gridUuid);
      deletedUuids.push(gridUuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}

function deleteGridFile(missionId: number, gridUuid: string): void {
  const fileName = `${process.env.STATIC_DIR}/missionFiles/${missionId}/Data/grid_${gridUuid}.json`;

  fs.unlink(fileName, (err) => {
    if (err) {
      console.error(`Error deleting file ${fileName}:`, err);
      return;
    }
  });
}

/**
 * Converts db grid fks to their uuid/id arrays
 * @param dbGrids an array of grids in mikro db format
 * @returns an a converted array of grids or a single grid
 */
export function convertGridsTypeDbToLocal(dbGrids: Grid_db[]): MissionGridInformation[] {
  const grids: MissionGridInformation[] = [];
  for (const dbGrid of dbGrids) {
    const convertedGrid: MissionGridInformation = {
      uuid: dbGrid.uuid,
      missionId: dbGrid.mission ? dbGrid.mission.id : null,
      numRows: dbGrid.numRows,
      numCols: dbGrid.numCols,
      spacing: dbGrid.spacing,
      name: dbGrid.name,
      isActiveGrid: dbGrid.isActiveGrid,
    };

    grids.push(convertedGrid);
  }
  return grids;
}

/**
 * Converts grids that come from the store into the db type
 * @param storeGrids
 * @returns
 */
export function convertGridsTypeStoreToDb(
  storeGrids: MissionGridInformation[]
): EntityData<Grid_db>[] {
  const dbGrids: EntityData<Grid_db>[] = [];
  for (const storeGrid of storeGrids) {
    //mission references are not converted here, they are converted in the upsert function
    const convertedRecord: EntityData<Grid_db> = {
      uuid: storeGrid.uuid,
      numRows: storeGrid.numRows,
      numCols: storeGrid.numCols,
      spacing: storeGrid.spacing,
      name: storeGrid.name,
      isActiveGrid: storeGrid.isActiveGrid,
    };
    dbGrids.push(convertedRecord);
  }
  return dbGrids;
}
