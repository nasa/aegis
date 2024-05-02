import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import { hasPerms } from "utils/permissions";
import { getEM } from "utils/mikro";
import { Log_db } from "server/database/models/_allModels";
import { EntityData, ForeignKeyConstraintViolationException } from "@mikro-orm/core";
import _ from "lodash";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  if (!queryObj.missionId || _.isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  const viewPermission = await hasPerms(queryObj.missionId, "view", req.session.user);
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    const records = await getLogs(queryObj.missionId);

    res.status(200).json({
      status: "success",
      message: "log retrieved",
      data: records,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { missionId, logs } = req.body as LogUpsertRequest;
  const editPermission = await hasPerms(missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    //perform the upsert
    const upsertResponse: Log[] = await upsertLogs(logs);

    //check response
    if (upsertResponse.length === 0) {
      res.status(500).json({
        status: "error",
        message: "Upsert response did not return a value",
        data: null,
      });
    } else {
      res.status(200).json({
        status: "success",
        message: `Rex upserted with uuid ${upsertResponse.map((l) => l.uuid)}`,
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
  //this permission check works differently due to multiple missionIds being passed in
  const { missionIds } = req.body as LogDeleteRequest;
  for (const missionId of missionIds) {
    const canDelete = await hasPerms(missionId, "edit", req.session?.user);
    if (!canDelete) {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
      return;
    }
  }

  try {
    const logsDeletedSuccessfully = await deleteLogs(missionIds);
    if (logsDeletedSuccessfully.length > 0) {
      res.status(200).json({
        status: "success",
        message: "Logs Deleted",
      });
    } else {
      res.status(200).json({
        status: "failure",
        message: "No logs found. Nothing deleted",
      });
    }
  } catch (e) {
    console.error(e);
    if (e instanceof ForeignKeyConstraintViolationException) {
      res.status(500).json({
        status: "error",
        message: "Cannot delete logs. A log is referenced elsewhere",
      });
    } else {
      res
        .status(500)
        .json({ status: "error", message: `Error processing the DELETE request: ${e}` });
    }
  }
});

export default router;

/**
 * get log(s) from the database
 * @param missionId mission id to get logs for
 * @returns logs
 */
export async function getLogs(missionId: number): Promise<Log[]> {
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
export async function deleteLogs(missionIds: number[]): Promise<number[]> {
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
