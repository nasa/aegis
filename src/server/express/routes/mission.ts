import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import _ from "lodash";

import { hasPerms } from "utils/permissions";
import { Mission_db } from "server/database/models/_allModels";
import {
  EntityData,
  ForeignKeyConstraintViolationException,
  RequiredEntityData,
} from "@mikro-orm/core";
import { getEM } from "utils/mikro";
import { emitStoreUpsert } from "../sockets";
import { upsertLogs } from "./log";
import { v4 as uuidv4 } from "uuid";
import {
  convertMissionsTypeDbToStore,
  convertMissionsTypeStoreToDb,
} from "store/storeUtils/mission";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, socketId, log } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    socketId: socketId ? (socketId as string) : undefined,
    logAction: log === "true",
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  let viewPermission;
  if (queryObj.missionId) {
    viewPermission = await hasPerms(queryObj.missionId, "view", req.session.user);
  } else {
    //no mission was specified. check if they are allowed to view at least one mission
    viewPermission =
      req.session?.user?.isSuperAdmin ||
      req.session?.user?.permissionList?.find((p) => p.permissions.view)?.permissions.view;
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
      //super admin can see all missions
      if (req.session.user.isSuperAdmin) {
        records = await getMission();
      } else {
        //return all missions that they have permission for
        const viewableMissions: number[] = req.session.user.permissionList.map((p) => {
          if (p.permissions.view) return p.missionId;
        });
        records = await getMission(viewableMissions);
      }
    }
    res.status(200).json({
      status: "success",
      message: "mission retrieved",
      data: records,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);

  const missionsToUpsert: Mission[] = req.body as Mission[];
  //must have edit permission the mission ids
  for (const mission of missionsToUpsert) {
    const canEditThisMission = await hasPerms(mission.id, "edit", req.session.user);
    if (!canEditThisMission) {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
      return;
    }
  }

  try {
    //perform the upsert
    const upsertResponse: Mission[] = await upsertMissions(missionsToUpsert);

    //check response
    if (upsertResponse.length === 0) {
      res.status(500).json({
        status: "error",
        message: "Upsert response did not return a value",
        data: null,
      });
      return;
    }

    //For each mission upserted, emit and log.
    //This is done in a loop since sockets are filtered to only process
    //  messages that match the missionId field.
    for (const upsertedMission of upsertResponse) {
      // emit the upserted item to all clients via socket.io
      emitStoreUpsert({
        missionId: upsertedMission.id,
        socketId: queryObj.socketId,
        type: "mission",
        data: [upsertedMission],
      } as StoreUpsert<Mission>);
      if (queryObj.logAction) {
        // log this upsert to the log table
        const log: Log = {
          uuid: uuidv4(),
          missionId: upsertedMission.id,
          type: "missionUpsert",
          payloadJson: JSON.stringify(upsertedMission),
          createdAt: new Date().toISOString(),
        };
        upsertLogs([log]);
      }

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
  const queryObj = parseQuery(req.query);

  const missionIdsToDelete: number[] = req.body.map((u: string) => parseInt(u));
  //must have edit permission the mission ids
  //  or if no mission id (create mission) must be an admin to the back end or user 1
  for (const missionIdToDelete of missionIdsToDelete) {
    if (!missionIdToDelete || _.isNaN(missionIdToDelete)) {
      res.status(500).json({ status: "error", message: "Invalid mission ID" });
      return;
    }

    const canEditThisMission = await hasPerms(missionIdToDelete, "edit", req.session.user);
    if (!canEditThisMission) {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
      return;
    }
  }

  try {
    const deletedMissionIds: number[] = await deleteMissions(missionIdsToDelete);
    if (deletedMissionIds.length > 0) {
      if (queryObj.logAction) {
        // log this deletion to the log table for each mission
        //  since logs are recorded by mission
        for (const deletedMissionId of deletedMissionIds) {
          const log: Log = {
            uuid: uuidv4(),
            missionId: deletedMissionId,
            type: "missionDelete",
            payloadJson: JSON.stringify({ deletedMissionId }),
            createdAt: new Date().toISOString(),
          };
          upsertLogs([log]);
        }
      }

      res.status(200).json({
        status: "success",
        message: "Mission Deleted",
      });
    } else {
      res.status(404).json({
        status: "failure",
        message: "No record found. Nothing deleted",
      });
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

  const missionsCopy: Mission[] = _.cloneDeep(missions);
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
    const entity = await em.findOne(Mission_db, missionId);
    if (entity) {
      em.remove(entity);
      deletedMissionIds.push(missionId);
    }
  }
  await em.flush();
  return deletedMissionIds;
}
