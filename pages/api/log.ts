import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM, getEM } from "utils/mikro";
import _ from "lodash";
import { Log as Log_db } from "server/database/models/log.model";
import { EntityData, ForeignKeyConstraintViolationException } from "@mikro-orm/core";
import { hasPerms } from "utils/permissions";

const handleRex: NextApiHandler<WrappedResponse<Log[] | Log>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    //missionId is required
    const { missionId } = req.query;
    const intMissionId = missionId ? parseInt(missionId as string) : null;

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
        const records = await getLogs(intMissionId);

        return res.status(200).json({
          status: "success",
          message: "log retrieved",
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
        //must have edit permission for a given mission id
        if (!editPermission) {
          return res.status(401).json({ status: "failure", message: "Unauthorized" });
        }
        //perform the upsert
        const upsertObject: Log = req.body as Log;
        const upsertResponse: Log = await upsertLog(upsertObject);

        //check response
        if (!upsertResponse) {
          return res.status(500).json({
            status: "error",
            message: "Upsert response did not return a value",
            data: null,
          });
        } else {
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

    //delete all logs for a mission
    if (req.method === "DELETE") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      try {
        const logsDeletedSuccessfully = await deleteLogs(intMissionId);
        if (logsDeletedSuccessfully) {
          return res.status(200).json({
            status: "success",
            message: "Logs Deleted",
          });
        } else if (logsDeletedSuccessfully === false) {
          //check false explicity (vs null or undefined)
          return res.status(200).json({
            status: "failure",
            message: "No logs found. Nothing deleted",
          });
        }
      } catch (e) {
        console.error(e);
        if (e instanceof ForeignKeyConstraintViolationException) {
          return res.status(500).json({
            status: "error",
            message: "Cannot delete logs. A log is referenced elsewhere",
          });
        } else {
          return res
            .status(500)
            .json({ status: "error", message: `Error processing the DELETE request: ${e}` });
        }
      }
    }
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Error in query: " + e });
  }
};

/**
 * get log(s) from the database
 * @param missionId mission id to get logs for
 * @returns logs
 */
async function getLogs(missionId: number): Promise<Log[]> {
  const em = getEM();
  const logs = await em.find(Log_db, { mission: missionId });

  return logs.map((log: Log_db) => {
    return {
      missionId: log.mission.id,
      uuid: log.uuid,
      type: log.type,
      payloadJson: log.payloadJson,
      createdAt: log.createdAt.toISOString(),
    } as Log;
  });
}

/**
 * upserts a single log into the database
 * @param log log to upsert
 * @returns the upserted log
 */
export async function upsertLog(log: Log): Promise<Log> {
  const em = getEM();

  const upsertRecord: EntityData<Log_db> = {
    mission: log.missionId,
    uuid: log.uuid,
    type: log.type,
    payloadJson: log.payloadJson,
    createdAt: new Date(log.createdAt),
  };

  let dbReference: Log_db;
  if (log.uuid) {
    //update record
    dbReference = await em.upsert(Log_db, upsertRecord);
  } else {
    //insert record.
    dbReference = em.create(Log_db, upsertRecord);
  }
  await em.persistAndFlush(dbReference);
  return {
    ...dbReference,
    missionId: dbReference.mission.id,
    createdAt: dbReference.createdAt.toISOString(),
  } as Log;
}

/**
 * Deletes all logs for a given mission
 * @param missionId mission id to delete logs for
 * @returns true if successful
 */
async function deleteLogs(missionId: number): Promise<boolean> {
  const em = getEM();

  const logs = await em.find(Log_db, { mission: missionId });
  if (logs.length === 0) return false;
  await em.removeAndFlush(logs);
  return true;
}
export default withIronSessionApiRoute(withORM(handleRex), ironOptions);
