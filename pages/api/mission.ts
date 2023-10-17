import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM, getEM } from "utils/mikro";

import _ from "lodash";
import { Mission_db } from "server/database/models/_allModels";
import { EntityData, ForeignKeyConstraintViolationException } from "@mikro-orm/core";
import { hasPerms } from "utils/permissions";
import { emitStoreUpsert } from "./socketio";
import { v4 as uuidv4 } from "uuid";
import { upsertLogs } from "./log";

/**
 * /api/mission?missionId=
 *
 * API endpoint for mission
 *
 * The request method will determine what action to perform
 *    GET = get all, subset, or single record
 *      Optional URL parameters are:
 *        missionId=  mission ID number. If none is provided all missions are returned
 *    POST = upsert a mission (defined in POST body) into the DB
 *      A full mission object (with an ID for new missions) should be specified in the request body
 *    DELETE = delete the mission for a given missionId
 *       Required URL parameters are:
 *        missionId=  mission ID number
 */
const handleMission: NextApiHandler<WrappedResponse<Mission[] | Mission>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    //missionId is only required for DELETE
    const { missionId, socketId, log } = req.query;
    const intMissionId = missionId ? parseInt(missionId as string) : null;
    const logAction = log === "true";

    if (req.method === "GET") {
      if (intMissionId && _.isNaN(intMissionId)) {
        return res.status(500).json({ status: "error", message: "Invalid mission ID" });
      }

      let viewPermission = false;
      if (intMissionId) {
        viewPermission = await hasPerms(intMissionId, "view", req.session?.user);
      } else {
        //no mission was specified. check if they are allowed to view at least one mission
        viewPermission =
          req.session?.user?.isSuperAdmin ||
          req.session?.user?.permissionList?.find((p) => p.permissions.view)?.permissions.view;
      }
      if (!viewPermission)
        return res.status(401).json({ status: "failure", message: "Unauthorized" });

      try {
        let records: Mission[];
        if (intMissionId) {
          records = await getMission(intMissionId);
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

        return res.status(200).json({
          status: "success",
          message: "mission retrieved",
          data: records,
        });
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the GET request" });
      }
    }

    //upsert a record
    if (req.method === "POST") {
      try {
        const missionsToUpsert: Mission[] = req.body as Mission[];
        //must have edit permission the mission ids
        for (const mission of missionsToUpsert) {
          const canEditThisMission = await hasPerms(mission.id, "edit", req.session?.user);
          if (!canEditThisMission) {
            return res.status(401).json({ status: "failure", message: "Unauthorized" });
          }
        }
        //perform the upsert
        const upsertResponse: Mission[] = await upsertMissions(missionsToUpsert);

        //check response
        if (upsertResponse.length === 0) {
          return res.status(500).json({
            status: "error",
            message: "Upsert response did not return a value",
            data: null,
          });
        } else {
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
            } as StoreUpsert<Mission>);
            if (logAction) {
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
          }

          return res.status(200).json({
            status: "success",
            message: `Mission upserted with IDs ${upsertResponse.map((m) => m.id)}`,
            data: upsertResponse,
          });
        }
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the POST request" });
      }
    }

    //delete a mission record
    if (req.method === "DELETE") {
      try {
        const missionIdsToDelete: number[] = req.body.map((u: string) => parseInt(u));
        //must have edit permission the mission ids
        //  or if no mission id (create mission) must be an admin to the back end or user 1
        for (const missionIdToDelete of missionIdsToDelete) {
          if (!missionIdToDelete || _.isNaN(missionIdToDelete)) {
            return res.status(500).json({ status: "error", message: "Invalid mission ID" });
          }

          const canEditThisMission = await hasPerms(missionIdToDelete, "edit", req.session?.user);
          if (!canEditThisMission) {
            return res.status(401).json({ status: "failure", message: "Unauthorized" });
          }
        }

        const deletedMissionIds: number[] = await deleteMissions(missionIdsToDelete);
        if (deletedMissionIds.length > 0) {
          if (logAction) {
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

          return res.status(200).json({
            status: "success",
            message: "Mission Deleted",
          });
        } else {
          return res.status(404).json({
            status: "failure",
            message: "No record found. Nothing deleted",
          });
        }
      } catch (e) {
        console.error(e);
        if (e instanceof ForeignKeyConstraintViolationException) {
          return res.status(500).json({
            status: "error",
            message: "Cannot delete mission. This mission is referenced elsewhere",
          });
        } else {
          return res
            .status(500)
            .json({ status: "error", message: "Error processing the DELETE request" });
        }
      }
    }
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Error in query: " + e });
  }
};

/**
 * get mission(s) from the database
 * @returns a mission
 * @param missionIdList
 */
async function getMission(missionIdList: number | number[] = null): Promise<Mission[]> {
  const em = getEM();
  let missions: Mission_db[];
  if (!missionIdList) {
    missions = await em.find(Mission_db, {});
  } else {
    missions = await em.find(Mission_db, { id: missionIdList });
  }

  return missions.map((mission: Mission_db) => {
    return {
      ...mission,
      createdAt: mission.createdAt.toISOString(),
      updatedAt: mission.updatedAt.toISOString(),
    } as Mission;
  });
}

/**
 * Inserts or Updates missions into the database
 * @param missions the mission objects to upsert
 * @returns a copy of the mission objects that was upserted
 */
async function upsertMissions(missions: Mission[]): Promise<Mission[]> {
  const em = getEM();

  const missionsCopy: Mission[] = _.cloneDeep(missions);
  const missionsUpsertedToDb = [];

  for (const missionCopy of missionsCopy) {
    const upsertRecord: EntityData<Mission_db> = {
      ...missionCopy,
      updatedAt: new Date(missionCopy.updatedAt),
      createdAt: new Date(missionCopy.createdAt),
    };

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
      dbReference = em.create(Mission_db, upsertRecord);
    }

    //have to both persist and flush in order to get the new mission id back
    await em.persistAndFlush(dbReference);
    missionsUpsertedToDb.push({
      ...dbReference,
      updatedAt: dbReference.updatedAt.toISOString(),
      createdAt: dbReference.createdAt.toISOString(),
    } as Mission);
  }
  return missionsUpsertedToDb;
}

/**
 * Deletes missions
 * @param missionIds mission IDs to delete
 * @returns the ids of the deleted missions
 */
async function deleteMissions(missionIds: number[]): Promise<number[]> {
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
export default withIronSessionApiRoute(withORM(handleMission), ironOptions);
