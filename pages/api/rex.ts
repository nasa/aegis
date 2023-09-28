import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM, getEM } from "utils/mikro";

import _ from "lodash";
import { Rex as Rex_db } from "server/database/models/rex.model";
import { EntityData, ForeignKeyConstraintViolationException } from "@mikro-orm/core";
import { hasPerms } from "utils/permissions";
import { emitStoreDelete, emitStoreUpsert } from "./socketio";
import { v4 as uuidv4 } from "uuid";
import { upsertLog } from "./log";

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
        const records = await getRex(intMissionId);

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
        const rexToUpsert: Rex = req.body as Rex;
        const upsertResponse: Rex = await upsertRex(rexToUpsert);

        //check response
        if (!upsertResponse) {
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
            data: [upsertResponse],
          } as StoreUpsert<Rex>);

          if (logAction) {
            // log this upsert to the log table
            upsertLog({
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "rexUpsert",
              payloadJson: JSON.stringify(rexToUpsert),
              createdAt: new Date().toISOString(),
            } as Log);
          }

          return res.status(200).json({
            status: "success",
            message: `Rex upserted with uuid ${upsertResponse.uuid}`,
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
        const deletedRexUuid: string = await deleteRex(rexUuid);
        if (deletedRexUuid) {
          emitStoreDelete({
            missionId: intMissionId,
            socketId,
            type: "rex",
            uuid: deletedRexUuid,
          } as StoreDelete);

          if (logAction) {
            // log this deletion to the log table
            upsertLog({
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "rexDelete",
              payloadJson: JSON.stringify({ rexUuid }),
              createdAt: new Date().toISOString(),
            } as Log);
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
async function getRex(missionId: number): Promise<Rex[]> {
  const em = getEM();
  const rexes = await em.find(Rex_db, { mission: missionId });

  return rexes.map((rex: Rex_db) => {
    return {
      ...rex,
      missionId: rex.mission.id,
      createdAt: rex.createdAt.toISOString(),
      updatedAt: rex.updatedAt.toISOString(),
    } as Rex;
  });
}

/**
 * upserts a single rex into the database
 * @param rex rex to upsert
 * @returns the upserted rex
 */
async function upsertRex(rex: Rex): Promise<Rex> {
  const em = getEM();

  const copy: Rex = _.cloneDeep(rex);

  const upsertRecord: EntityData<Rex_db> = {
    mission: copy.missionId,
    uuid: copy.uuid || uuidv4(),
    name: copy.name,
    description: copy.description,
    petStartStopTimestamp: copy.petStartStopTimestamp,
    petValueAtStartStop: copy.petValueAtStartStop,
    petRunning: copy.petRunning,
    selectedRexEvaUuid: copy.selectedRexEvaUuid,
    rexRunning: copy.rexRunning,
    crewPos: copy.crewPos,
    updatedAt: new Date(copy.updatedAt),
    createdAt: new Date(copy.createdAt),
  };

  let dbReference: Rex_db;
  if (rex.uuid) {
    //update record
    dbReference = await em.upsert(Rex_db, upsertRecord);
  } else {
    //insert record.
    dbReference = em.create(Rex_db, upsertRecord);
  }
  await em.persistAndFlush(dbReference);

  return {
    ...dbReference,
    missionId: dbReference.mission.id,
    updatedAt: dbReference.updatedAt.toISOString(),
    createdAt: dbReference.createdAt.toISOString(),
  } as Rex;
}

/**
 * Deletes a single rex
 * @param uuid rex to delete
 * @returns the id of the deleted rex or null if nothing was deleted
 */
async function deleteRex(uuid: string): Promise<string | null> {
  const em = getEM();
  let returnVal = uuid;
  const entity = await em.findOne(Rex_db, uuid);
  if (entity) {
    await em.removeAndFlush(entity);
  } else {
    returnVal = null;
  }
  return returnVal;
}
export default withIronSessionApiRoute(withORM(handleRex), ironOptions);
