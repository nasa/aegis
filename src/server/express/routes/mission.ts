import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { emssTokenIsValid, hasPerms } from "utils/permissions";
import {
  MissionBackup_db,
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
  Folder_db,
} from "server/database/models/_allModels";
import { globalValues } from "../global";

import path from "node:path";
import fs from "fs";
import { SCHEMA_DIR } from "utils/validateSchemaServer";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

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
    serverLogger.debug({ logId: "mission", logValue: JSON.stringify(viewPermission) });
  } else {
    //no mission was specified. check if they are allowed to view at least one mission
    viewPermission =
      req.session?.appUser?.isSuperAdmin ||
      req.session?.appUser?.permissionList?.find((p) => p.permissions.view)?.permissions.view ||
      emssTokenIsValid(emssToken);
  }
  if (!viewPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "mission",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    let records: Mission[];
    if (queryObj.missionId) {
      records = await getBackupDbMissions([queryObj.missionId]);
    } else {
      //super admin and emss token can see all missions
      if (req.session?.appUser?.isSuperAdmin || emssTokenIsValid(emssToken)) {
        records = await getBackupDbMissions();
      } else {
        //return all missions that they have permission for
        if (!req.session.appUser.permissionList) {
          res.status(401).json({ status: "failure", message: "Unauthorized" });
          return;
        }
        const viewableMissions: number[] = req.session.appUser.permissionList.flatMap((p) => {
          return p.permissions.view ? [p.missionId] : [];
        });
        records = await getBackupDbMissions(viewableMissions);
      }
    }
    res.status(200).json({ status: "success", message: "mission retrieved", data: records });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "mission",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "mission.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "mission schema retrieved",
      data: schema,
    });
  } catch (e) {
    serverLogger.error(
      { logId: "mission", logValue: "Error retrieving schema" },
      e instanceof Error ? e : new Error(String(e))
    );
    res.status(500).json({
      status: "error",
      message: `Error retrieving schema: ${e}`,
      data: null,
    });
  }
});

export default router;

/**
 * get mission(s) from the database backup
 * @returns an array of missions
 * @param missionIdList
 */
export async function getBackupDbMissions(
  missionIdList: number[] | null = null
): Promise<Mission[]> {
  // must manually fork because sometimes this call is outside normal http request context (what we do in routes)
  const em = globalValues.orm.em.fork();
  let backups: MissionBackup_db[];
  if (!missionIdList) {
    backups = await em.find(MissionBackup_db, {});
  } else {
    backups = await em.find(MissionBackup_db, { missionId: missionIdList });
  }

  return backups.map((b) => b.data as Mission);
}

/**
 * Inserts or Updates missions into the backup database
 * @param missions the mission objects to upsert
 * @returns the mission objects that were upserted
 */
export async function upsertBackupDbMissions(missions: Mission[]): Promise<Mission[]> {
  // must manually fork because sometimes this call is outside normal http request context (what we do in routes)
  const em = globalValues.orm.em.fork();
  await em.begin(); // Start a transaction

  try {
    for (const mission of missions) {
      if (!mission.id) {
        serverLogger.warning({
          logId: "mission",
          logValue: "upsertBackupDbMissions: mission has no id, skipping backup",
        });
        continue;
      }
      await em.upsert(MissionBackup_db, { missionId: mission.id, data: mission });
      await em.flush();
    }
    await em.commit();
  } catch (e) {
    await em.rollback(); // rollback the transaction
    throw e; // re-throw the error to be handled by the caller
  }

  return missions;
}

/**
 * Deletes missions from the backup database table
 * Deletes all related entities in other tables as well
 * @param missionIds mission IDs to delete
 * @returns the ids of the deleted missions
 */
export async function deleteBackupDbMissionAndRelatedEntities(
  missionIds: number[]
): Promise<number[]> {
  const em = globalValues.orm.em;
  const deletedMissionIds = [];

  for (const missionId of missionIds) {
    // First check if the mission exists in the backup table
    const backup = await em.findOne(MissionBackup_db, { missionId });
    if (!backup) {
      continue;
    }

    // Step 1: Fetch all related entities
    try {
      // Delete STM Rules first (they reference STM Level 3)
      await em.nativeDelete(STM_Rule_db, { missionId });

      // Find all Level 1s for this mission - they link to the mission directly
      const stmLevel1s = await em.find(STM_Level1_db, { missionId });

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
      await em.nativeDelete(STM_Level1_db, { missionId });

      // Delete actions
      await em.nativeDelete(Action_db, { missionId });

      // Delete REXes
      await em.nativeDelete(Rex_db, { missionId });

      // Delete EVAs
      await em.nativeDelete(Eva_db, { missionId });

      // Delete traverses
      await em.nativeDelete(Traverse_db, { missionId });

      // Delete sublayers (they reference layers)
      await em.nativeDelete(Sublayer_db, { missionId });

      // Delete layers
      await em.nativeDelete(Layer_db, { missionId });

      // Delete Presets
      await em.nativeDelete(Preset_db, { missionId });

      // Delete Folders
      await em.nativeDelete(Folder_db, { missionId });

      // Delete POIs and stations
      await em.nativeDelete(Poi_db, { missionId });
      await em.nativeDelete(Station_db, { missionId });

      // Finally delete the mission backup record
      await em.nativeDelete(MissionBackup_db, { missionId });

      deletedMissionIds.push(missionId);
    } catch (error) {
      serverLogger.error(
        { logId: "mission", logValue: `Error deleting mission ${missionId}` },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  // Flush to commit the changes
  await em.flush();
  return deletedMissionIds;
}
