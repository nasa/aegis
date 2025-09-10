import type { Request, Response } from "express";
import { OptimisticLockError } from "@mikro-orm/postgresql";
import express from "express";
import random from "lodash/random";

import { convertRexesTypeDbToStore } from "store/storeUtils/rex";
import { getEM } from "utils/mikro";

import { Rex_db } from "../../../database/models/_allModels";
import { emitStoreUpsert } from "../../sockets";
import { hasPerms } from "utils/permissions";

const router = express.Router();

interface RexControlUpdateRequest {
  rexUuid: string;
  maestroControlled?: boolean;
  startStopExecution?: "start" | "stop";
  maestroEventId?: string;
  maestroEventUrl?: string;
  maestroActivityProperties?: MaestroActivityPropertiesByRefUuid | null;
}

// POST request to update REX control settings
// Note: When starting execution, all other running REX items are automatically stopped
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const {
    rexUuid,
    maestroControlled,
    startStopExecution,
    maestroEventId,
    maestroEventUrl,
    maestroActivityProperties,
  } = req.body as RexControlUpdateRequest;
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions or super admin for the backend emss admin page
  const editPermission = hasPerms({
    missionId: null,
    permission: null,
    appUser: req.session?.appUser,
    emssToken: emssToken,
  });
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  // validate inputs
  if (!rexUuid) {
    res.status(400).json({
      status: "failure",
      message: "Missing required body parameter: rexUuid",
    });
    return;
  }
  // Check that at least one optional parameter is provided
  if (
    maestroControlled === undefined &&
    startStopExecution === undefined &&
    maestroEventId === undefined &&
    maestroEventUrl === undefined &&
    maestroActivityProperties === undefined
  ) {
    res.status(400).json({
      status: "failure",
      message:
        "At least one of maestroControlled, startStopExecution, maestroEventId, maestroEventUrl, or maestroActivityProperties must be provided",
    });
    return;
  }
  // Validate startStopExecution if provided
  if (startStopExecution !== undefined && !["start", "stop"].includes(startStopExecution)) {
    res.status(400).json({
      status: "failure",
      message: "startStopExecution must be 'start' or 'stop' if provided",
    });
    return;
  }
  // validate maestroEventURL
  if (maestroEventUrl) {
    try {
      const parsedUrl = new URL(maestroEventUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
        throw new Error("Invalid protocol. Must be http or https");
    } catch (e) {
      res.status(400).json({
        status: "failure",
        message: "Must be a valid URL " + e,
      });
      return;
    }
  }

  try {
    let updatedRexes: Rex[] = [];
    for (let tries = 0; tries < 7; tries++) {
      try {
        updatedRexes = await updateRexControl({
          rexUuid: rexUuid,
          maestroControlled: maestroControlled,
          startStopExecution: startStopExecution,
          maestroEventId: maestroEventId,
          maestroEventUrl: maestroEventUrl,
          maestroActivityProperties: maestroActivityProperties,
        });
        break; // if successful, exit the retry loop
      } catch (e) {
        if (e instanceof OptimisticLockError) {
          // lock error. wait anywhere from 100-200ms before retrying
          await new Promise((resolve) => setTimeout(resolve, random(100, 200)));
        } else {
          // some other kind of error happened
          // re-throw it so the outer try/catch can grab it and exit the for loop
          throw e;
        }
      }
    }

    emitStoreUpsert({
      missionId: updatedRexes[0].missionId,
      socketId: "maestroApi",
      type: "rex",
      data: updatedRexes,
    } as StoreUpsert);

    res.status(200).json({
      status: "success",
      message: `Rex control settings updated for rex uuid(s) ${updatedRexes.map((r) => r.uuid).toString()}`,
      data: updatedRexes,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);

    // Check if it's a specific business logic error
    if (errorMessage.includes("not found")) {
      res.status(404).json({
        status: "failure",
        message: errorMessage,
      });
      return;
    }

    // Generic server error
    res
      .status(500)
      .json({ status: "error", message: `Error processing the POST request: ${errorMessage}` });
  }
});

/**
 * Updates the control settings for a specific REX item.
 * When starting execution (startStopExecution = "start"), all other running REX items will be automatically stopped to ensure only one REX runs at a time.
 */
export async function updateRexControl({
  rexUuid,
  maestroControlled,
  startStopExecution,
  maestroEventId,
  maestroEventUrl,
  maestroActivityProperties,
}: RexControlUpdateRequest): Promise<Rex[]> {
  const em = getEM();
  await em.begin(); // start a transaction

  let rexEntity = null;
  let allRunningRexesBeforeUpdate: Rex_db[] = [];
  try {
    // Find and validate the REX entity by its UUID
    rexEntity = await em.findOne(Rex_db, { uuid: rexUuid });
    if (!rexEntity) {
      throw new Error(`Rex with uuid ${rexUuid} not found.`);
    }

    // Handle execution state changes first (if stopping all other running REX records)
    if (startStopExecution === "start") {
      allRunningRexesBeforeUpdate = await em.find(Rex_db, {
        mission: rexEntity.mission,
        isRunning: true,
        uuid: { $ne: rexUuid },
      });

      // Stop all other running REX records - only one can run at a time
      if (allRunningRexesBeforeUpdate.length > 0) {
        for (const runningRex of allRunningRexesBeforeUpdate) {
          runningRex.isRunning = false;
          runningRex.updatedAt = new Date();
          em.persist(runningRex);
        }
      }
    }

    // Update the target REX entity directly - only update fields that are explicitly provided
    if (maestroControlled !== undefined) rexEntity.maestroControlled = maestroControlled;
    if (maestroEventId !== undefined) {
      rexEntity.maestroEventId = maestroEventId === "" ? null : maestroEventId;
    }
    if (startStopExecution !== undefined) rexEntity.isRunning = startStopExecution === "start";
    if (maestroEventUrl !== undefined) rexEntity.maestroEventUrl = maestroEventUrl;
    if (maestroActivityProperties !== undefined)
      rexEntity.maestroActivityPropertiesByRefUuid = maestroActivityProperties;
    rexEntity.updatedAt = new Date();

    em.persist(rexEntity);
    await em.commit(); // commit the transaction. will also flush
  } catch (error) {
    await em.rollback();
    throw error; // re-throw the error to be handled by the caller
  }

  return [
    convertRexesTypeDbToStore([rexEntity])[0],
    ...convertRexesTypeDbToStore(allRunningRexesBeforeUpdate),
  ];
}

export default router;
