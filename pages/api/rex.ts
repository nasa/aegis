import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "utils/ironSession";
import { withORM, getEM } from "utils/mikro";

import _ from "lodash";
import { Rex_db } from "server/database/models/_allModels";
import { EntityData, ForeignKeyConstraintViolationException } from "@mikro-orm/core";
import { hasPerms } from "utils/permissions";
import { emitStoreDelete, emitStoreUpsert } from "./socketio";
import { v4 as uuidv4 } from "uuid";
import { upsertLogs } from "./log";

const handleRex: NextApiHandler<WrappedResponse<Rex[] | Rex>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    //missionId is required
    const { missionId, socketId, uuid, log } = req.query;
    const intMissionId = missionId ? parseInt(missionId as string) : null;
    const rexUuid = uuid ? uuid.toString() : null;
    const logAction = log === "true";

    //check for required mission id is valid
    if (!intMissionId || _.isNaN(intMissionId)) {
      return res.status(500).json({ status: "error", message: "Invalid mission ID" });
    }
    const editPermission = await hasPerms(intMissionId, "edit", req.session?.user);

    if (req.method === "GET") {
      const viewPermission = await hasPerms(intMissionId, "view", req.session?.user);
      if (!viewPermission && !editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      try {
        const records = await getRexes(intMissionId);

        return res.status(200).json({
          status: "success",
          message: "rex retrieved",
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
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        //perform the upsert
        const rexes: Rex[] = req.body as Rex[];
        const upsertResponse: Rex[] = await upsertRexes(rexes);

        //check response
        if (upsertResponse.length === 0) {
          return res.status(500).json({
            status: "error",
            message: "Upsert response did not return a value",
            data: null,
          });
        } else {
          // emit the upserted item to all clients via socket.io
          emitStoreUpsert({
            missionId: intMissionId,
            socketId,
            type: "rex",
            data: upsertResponse,
          } as StoreUpsert<Rex>);

          if (logAction) {
            // log this upsert to the log table
            const log: Log = {
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "rexUpsert",
              payloadJson: JSON.stringify(rexes),
              createdAt: new Date().toISOString(),
            };
            upsertLogs([log]);
          }

          return res.status(200).json({
            status: "success",
            message: `Rex upserted with uuid ${upsertResponse.map((r) => r.uuid)}`,
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

    //delete a rex record
    if (req.method === "DELETE") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      try {
        const uuidsToDelete: string[] = req.body;
        const deletedRexUuids: string[] = await deleteRexes(uuidsToDelete);
        if (deletedRexUuids.length > 0) {
          emitStoreDelete({
            missionId: intMissionId,
            socketId,
            type: "rex",
            uuids: deletedRexUuids,
          } as StoreDelete);

          if (logAction) {
            // log this deletion to the log table
            const log: Log = {
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "rexDelete",
              payloadJson: JSON.stringify({ rexUuid }),
              createdAt: new Date().toISOString(),
            };
            upsertLogs([log]);
          }

          return res.status(200).json({
            status: "success",
            message: "Rex Deleted",
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
            message: "Cannot delete rex. The rex is referenced elsewhere",
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
 * get rex(s) from the database
 * @param missionId mission id to get rexes for
 * @returns rexes
 */
export async function getRexes(missionId: number): Promise<Rex[]> {
  const em = getEM();
  const rexes = await em.find(Rex_db, { mission: missionId });

  return convertRexes(rexes);
}

/**
 * upserts rexes into the database
 * @param rexes rexes to upsert
 * @returns the upserted rexes
 */
async function upsertRexes(rexes: Rex[]): Promise<Rex[]> {
  const em = getEM();

  const rexesToUpsert: Rex[] = _.cloneDeep(rexes);
  const rexesUpsertedToDb = [];

  for (const rexToUpsert of rexesToUpsert) {
    const upsertRecord: EntityData<Rex_db> = {
      mission: rexToUpsert.missionId,
      uuid: rexToUpsert.uuid || uuidv4(),
      name: rexToUpsert.name,
      description: rexToUpsert.description,
      petStartStopTimestamp: rexToUpsert.petStartStopTimestamp,
      petValueAtStartStop: rexToUpsert.petValueAtStartStop,
      petRunning: rexToUpsert.petRunning,
      evaUuid: rexToUpsert.evaUuid,
      isRunning: rexToUpsert.isRunning,
      posEntries: rexToUpsert.posEntries,
      posTypes: rexToUpsert.posTypes,
      stationEntries: rexToUpsert.stationEntries,
      traverseEntries: rexToUpsert.traverseEntries,
      actionEntries: rexToUpsert.actionEntries,
      updatedAt: new Date(rexToUpsert.updatedAt),
      createdAt: new Date(rexToUpsert.createdAt),
    };
    const rexUpsertReference: Rex_db = await em.upsert(Rex_db, upsertRecord);
    em.persist(rexUpsertReference);
    rexesUpsertedToDb.push(rexUpsertReference);
  }
  await em.flush();

  //convert foreign keys
  return convertRexes(rexesUpsertedToDb);
}

/**
 * Deletes rexes
 * @param uuids rex uuids to delete
 * @returns the uuids of the deleted rexes
 */
async function deleteRexes(uuids: string[]): Promise<string[]> {
  const em = getEM();
  const deletedUuids = [];
  for (const uuid of uuids) {
    const entity = await em.findOne(Rex_db, uuid);
    if (entity) {
      em.remove(entity); //delete rex
      deletedUuids.push(uuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}

function convertRexes(dbRexes: Rex_db[]): Rex[] {
  const rexes: Rex[] = [];
  for (const dbRex of dbRexes) {
    const convertedRex: Rex = {
      uuid: dbRex.uuid,
      missionId: dbRex.mission.id,
      name: dbRex.name,
      description: dbRex.description,
      petStartStopTimestamp: dbRex.petStartStopTimestamp,
      petValueAtStartStop: dbRex.petValueAtStartStop,
      petRunning: dbRex.petRunning,
      evaUuid: dbRex.evaUuid,
      isRunning: dbRex.isRunning,
      posEntries: dbRex.posEntries,
      posTypes: dbRex.posTypes,
      stationEntries: dbRex.stationEntries,
      traverseEntries: dbRex.traverseEntries,
      actionEntries: dbRex.actionEntries,
      updatedAt: dbRex.createdAt.toISOString(),
      createdAt: dbRex.updatedAt.toISOString(),
    };
    rexes.push(convertedRex);
  }
  return rexes;
}

export default withIronSessionApiRoute(withORM(handleRex), ironOptions);
