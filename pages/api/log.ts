import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "utils/ironSession";
import { withORM, getEM } from "utils/mikro";
import _ from "lodash";
import { Log_db } from "server/database/models/_allModels";
import { EntityData, ForeignKeyConstraintViolationException } from "@mikro-orm/core";
import { hasPerms } from "utils/permissions";

const handleLog: NextApiHandler<WrappedResponse<Log[] | Log>> = async (
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

    if (req.method === "GET") {
      if (!intMissionId || _.isNaN(intMissionId)) {
        return res.status(500).json({ status: "error", message: "Invalid mission ID" });
      }
      const editPermission = await hasPerms(intMissionId, "edit", req.session?.user);
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
        if (!intMissionId || _.isNaN(intMissionId)) {
          return res.status(500).json({ status: "error", message: "Invalid mission ID" });
        }
        const editPermission = await hasPerms(intMissionId, "edit", req.session?.user);
        if (!editPermission) {
          return res.status(401).json({ status: "failure", message: "Unauthorized" });
        }
        //perform the upsert
        const logs: Log[] = req.body as Log[];
        const upsertResponse: Log[] = await upsertLogs(logs);

        //check response
        if (upsertResponse.length === 0) {
          return res.status(500).json({
            status: "error",
            message: "Upsert response did not return a value",
            data: null,
          });
        } else {
          return res.status(200).json({
            status: "success",
            message: `Rex upserted with uuid ${upsertResponse.map((l) => l.uuid)}`,
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
      try {
        //this permission check works differently due to multiple missionIds being passed in
        const missionIdsToDelete: number[] = req.body.map((u: string) => parseInt(u));
        for (const missionId of missionIdsToDelete) {
          const canDelete = await hasPerms(missionId, "edit", req.session?.user);
          if (!canDelete) {
            return res.status(401).json({ status: "failure", message: "Unauthorized" });
          }
        }

        const logsDeletedSuccessfully = await deleteLogs(missionIdsToDelete);
        if (logsDeletedSuccessfully.length > 0) {
          return res.status(200).json({
            status: "success",
            message: "Logs Deleted",
          });
        } else {
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
 * upserts logs into the database
 * @param log logs to upsert
 * @returns the upserted logs
 */
export async function upsertLogs(logs: Log[]): Promise<Log[]> {
  const em = getEM();
  const logsUpsertedToDb = [];

  for (const log of logs) {
    const upsertRecord: EntityData<Log_db> = {
      mission: log.missionId,
      uuid: log.uuid,
      type: log.type,
      payloadJson: log.payloadJson,
      createdAt: new Date(log.createdAt),
    };

    const dbReference = await em.upsert(Log_db, upsertRecord);
    em.persist(dbReference);
    //convert back and push
    logsUpsertedToDb.push({
      ...dbReference,
      missionId: dbReference.mission.id,
      createdAt: dbReference.createdAt.toISOString(),
    } as Log);
  }

  await em.flush();
  return logsUpsertedToDb;
}

/**
 * Deletes all logs for missions
 * @param missionId mission ids to delete logs for
 * @returns array of deleted uuids
 */
async function deleteLogs(missionIds: number[]): Promise<number[]> {
  const em = getEM();
  const deletedMissionIds = [];
  for (const missionId of missionIds) {
    const logs = await em.find(Log_db, { mission: missionId });
    if (logs.length !== 0) {
      em.remove(logs);
      deletedMissionIds.push(missionId);
    }
  }
  await em.flush();
  return deletedMissionIds;
}
export default withIronSessionApiRoute(withORM(handleLog), ironOptions);
