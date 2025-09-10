import type { EntityData, RequiredEntityData } from "@mikro-orm/postgresql";
import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import { ForeignKeyConstraintViolationException } from "@mikro-orm/postgresql";
import express from "express";
import cloneDeep from "lodash/cloneDeep";

import { emssTokenIsValid, hasPerms } from "utils/permissions";
import {
  Mission_db,
  STM_Level1_db,
  STM_Level2_db,
  STM_Level3_db,
  STM_Rule_db,
  Station_db,
  Poi_db,
  Action_db,
  Eva_db,
  Layer_db,
  Sublayer_db,
  Traverse_db,
  Preset_db,
  Rex_db,
  Grid_db,
  Folder_db,
} from "server/database/models/_allModels";
import {
  convertMissionsTypeDbToStore,
  convertMissionsTypeStoreToDb,
} from "store/storeUtils/mission";
import { getEM } from "utils/mikro";

import { emitStoreUpsert } from "../sockets";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, socketId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    socketId: socketId ? (socketId as string) : undefined,
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  let viewPermission;
  if (queryObj.missionId) {
    viewPermission = hasPerms({
      missionId: queryObj.missionId,
      permission: "view",
      appUser: req.session.appUser,
      emssToken,
    });
  } else {
    //no mission was specified. check if they are allowed to view at least one mission
    viewPermission =
      req.session?.appUser?.isSuperAdmin ||
      req.session?.appUser?.permissionList?.find((p) => p.permissions.view)?.permissions.view ||
      emssTokenIsValid(emssToken);
  }
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    let records: Mission[];
    if (queryObj.missionId) {
      records = await getMission(queryObj.missionId);
    } else {
      //super admin and emss token can see all missions
      if (req.session?.appUser?.isSuperAdmin || emssTokenIsValid(emssToken)) {
        records = await getMission();
      } else {
        //return all missions that they have permission for
        const viewableMissions: number[] = req.session.appUser.permissionList.map((p) => {
          if (p.permissions.view) return p.missionId;
        });
        records = await getMission(viewableMissions);
      }
    }
    res.status(200).json({ status: "success", message: "mission retrieved", data: records });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { socketId, missions } = req.body as MissionUpsertRequest;
  const emssToken = req.headers["emss-token"] as string;

  //must have edit permission the mission ids
  for (const mission of missions) {
    const canEditThisMission = hasPerms({
      missionId: mission.id,
      permission: "edit",
      appUser: req.session.appUser,
      emssToken,
    });
    if (!canEditThisMission) {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
      return;
    }
  }

  try {
    //perform the upsert
    const upsertResponse: Mission[] = await upsertMissions(missions);

    //check response
    if (upsertResponse.length === 0) {
      res
        .status(500)
        .json({ status: "error", message: "Upsert response did not return a value", data: null });
      return;
    }

    //For each mission upserted, emit and log.
    //This is done in a loop since sockets are filtered to only process
    //  messages that match the missionId field.
    for (const upsertedMission of upsertResponse) {
      // emit the upserted item to all clients via socket.io
      emitStoreUpsert({
        missionId: upsertedMission.id,
        socketId,
        type: "mission",
        data: [upsertedMission],
      } as StoreUpsert);
      res.status(200).json({
        status: "success",
        message: `Mission upserted with IDs ${upsertResponse.map((m) => m.id)}`,
        data: upsertResponse,
      });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the POST request ${e}` });
  }
});

// delete
router.delete("/", async (req: Request, res: Response): Promise<void> => {
  const { missionIds } = req.body as MissionDeleteRequest;

  //must have edit permission the mission ids
  //  or if no mission id (create mission) must be an admin to the back end or user 1
  for (const missionIdToDelete of missionIds) {
    if (!missionIdToDelete || isNaN(missionIdToDelete)) {
      res.status(500).json({ status: "error", message: "Invalid mission ID" });
      return;
    }

    if (!req.session?.appUser?.isSuperAdmin) {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
      return;
    }
  }

  try {
    const deletedMissionIds: number[] = await deleteMissions(missionIds);
    if (deletedMissionIds.length > 0) {
      res.status(200).json({ status: "success", message: "Mission Deleted" });
    } else {
      res.status(404).json({ status: "failure", message: "No record found. Nothing deleted" });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ForeignKeyConstraintViolationException) {
      res.status(500).json({
        status: "error",
        message: "Cannot delete mission. This mission is referenced elsewhere",
      });
    } else {
      res.status(500).json({ status: "error", message: "Error processing the DELETE request" });
    }
  }
});

export default router;

/**
 * get mission(s) from the database
 * @returns a mission
 * @param missionIdList
 */
export async function getMission(missionIdList: number | number[] = null): Promise<Mission[]> {
  const em = getEM();
  let missions: Mission_db[];
  if (!missionIdList) {
    missions = await em.find(Mission_db, {});
  } else {
    missions = await em.find(Mission_db, { id: missionIdList });
  }

  return convertMissionsTypeDbToStore(missions);
}

/**
 * Inserts or Updates missions into the database
 * @param missions the mission objects to upsert
 * @returns a copy of the mission objects that was upserted
 */
export async function upsertMissions(missions: Mission[]): Promise<Mission[]> {
  const em = getEM();

  const missionsCopy: Mission[] = cloneDeep(missions);
  const missionsUpsertedToDb: Mission[] = [];

  for (const missionCopy of missionsCopy) {
    const upsertRecord: EntityData<Mission_db> = convertMissionsTypeStoreToDb([missionCopy])[0];

    let dbReference: Mission_db;
    if (missionCopy.id) {
      //update record
      upsertRecord.version++;
      dbReference = await em.upsert(Mission_db, upsertRecord);
    } else {
      //insert record.
      //Can't use "upsert" to insert a new record if there's no other unique column in the table
      delete upsertRecord.id; //attempting to insert with an id of null will throw a mikro error. remove the property completely so mikro can give us a new id.
      upsertRecord.version = 1;
      dbReference = em.create(Mission_db, upsertRecord as RequiredEntityData<Mission_db>);
    }

    //have to both persist and flush in order to get the new mission id back
    await em.persistAndFlush(dbReference);
    missionsUpsertedToDb.push(convertMissionsTypeDbToStore([dbReference])[0]);
  }
  return missionsUpsertedToDb;
}

/**
 * Deletes missions
 * @param missionIds mission IDs to delete
 * @returns the ids of the deleted missions
 */
export async function deleteMissions(missionIds: number[]): Promise<number[]> {
  const em = getEM();
  const deletedMissionIds = [];

  for (const missionId of missionIds) {
    // First check if the mission exists
    const mission = await em.findOne(Mission_db, missionId);
    if (!mission) {
      continue;
    }

    // Step 1: Fetch all related entities
    try {
      // Delete STM Rules first (they reference STM Level 3)
      await em.nativeDelete(STM_Rule_db, { mission: missionId });

      // Find all Level 1s for this mission - they link to the mission directly
      const stmLevel1s = await em.find(STM_Level1_db, { mission: missionId });

      // For each Level 1, we need to:
      // 1. Find its Level 2s
      // 2. For each Level 2, delete its Level 3s
      // 3. Then delete the Level 2s
      // 4. Then delete the Level 1s

      for (const level1 of stmLevel1s) {
        // Find Level 2s related to this Level 1
        const level2s = await em.find(STM_Level2_db, { level1: level1 });

        // For each Level 2, delete its Level 3s
        for (const level2 of level2s) {
          await em.nativeDelete(STM_Level3_db, { level2: level2 });
        }

        // Now delete all Level 2s for this Level 1
        await em.nativeDelete(STM_Level2_db, { level1: level1 });
      }

      // Now delete all Level 1s for this mission
      await em.nativeDelete(STM_Level1_db, { mission: missionId });

      // Delete actions
      await em.nativeDelete(Action_db, { mission: missionId });

      // Delete REXes
      await em.nativeDelete(Rex_db, { mission: missionId });

      // Delete EVAs
      await em.nativeDelete(Eva_db, { mission: missionId });

      // Delete traverses
      await em.nativeDelete(Traverse_db, { mission: missionId });

      // Delete sublayers (they reference layers)
      await em.nativeDelete(Sublayer_db, { mission: missionId });

      // Delete layers
      await em.nativeDelete(Layer_db, { mission: missionId });

      // Delete Presets
      await em.nativeDelete(Preset_db, { mission: missionId });

      // Delete Grids
      await em.nativeDelete(Grid_db, { mission: missionId });

      // Delete Folders
      await em.nativeDelete(Folder_db, { mission: missionId });

      // Delete POIs and stations
      await em.nativeDelete(Poi_db, { mission: missionId });
      await em.nativeDelete(Station_db, { mission: missionId });

      // Finally delete the mission itself
      await em.nativeDelete(Mission_db, { id: missionId });

      deletedMissionIds.push(missionId);
    } catch (error) {
      console.error(`Error deleting mission ${missionId}:`, error);
      throw error;
    }
  }

  // Flush to commit the changes
  await em.flush();
  return deletedMissionIds;
}
