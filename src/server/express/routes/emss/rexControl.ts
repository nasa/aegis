import express, { Request, Response } from "express";
import { getEM } from "utils/mikro";
import { Rex_db } from "../../../database/models/_allModels";
import { emitStoreUpsert } from "../../sockets";
import { convertRexesTypeDbToStore } from "store/storeUtils/rex";

const router = express.Router();

interface RexControlUpdateRequest {
  rexUuid: string;
  maestroControlled?: boolean;
  startStopExecution?: "start" | "stop";
  maestroExecutionHash?: string;
}

// POST request to update REX control settings
// Note: When starting execution, all other running REX items are automatically stopped
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { rexUuid, maestroControlled, startStopExecution, maestroExecutionHash } =
    req.body as RexControlUpdateRequest;
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions
  const editPermission = emssToken && emssToken === process.env.EMSS_TOKEN;

  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

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
    maestroExecutionHash === undefined
  ) {
    res.status(400).json({
      status: "failure",
      message:
        "At least one of maestroControlled, startStopExecution, or maestroExecutionHash must be provided",
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

  try {
    const { updatedRex, allRunningRexesBeforeUpdate } = await updateRexControl({
      rexUuid: rexUuid,
      maestroControlled: maestroControlled,
      startStopExecution: startStopExecution,
      maestroExecutionHash: maestroExecutionHash,
    });

    // If we're starting execution, we need to emit updates for all affected REX records
    if (startStopExecution === "start") {
      // Include the updated REX (now running) along with the previously running REX records (now stopped)
      const allAffectedRexes = [...allRunningRexesBeforeUpdate, updatedRex];

      emitStoreUpsert({
        missionId: updatedRex.missionId,
        socketId: "maestroApi",
        type: "rex",
        data: allAffectedRexes,
      } as StoreUpsert);
    } else {
      // For other operations, just emit the single updated REX
      emitStoreUpsert({
        missionId: updatedRex.missionId,
        socketId: "maestroApi",
        type: "rex",
        data: [updatedRex],
      } as StoreUpsert);
    }

    res.status(200).json({
      status: "success",
      message: `Rex control settings updated for uuid ${updatedRex.uuid}`,
      data: updatedRex,
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
  maestroExecutionHash,
}: {
  rexUuid: string;
  maestroControlled?: boolean;
  startStopExecution?: "start" | "stop";
  maestroExecutionHash?: string;
}): Promise<{
  updatedRex: Rex;
  allRunningRexesBeforeUpdate: Rex[];
}> {
  const em = getEM();

  // Find the REX entity by its UUID after handling other entities
  const rexEntity = await em.findOne(Rex_db, { uuid: rexUuid });

  if (!rexEntity) {
    throw new Error(`Rex with uuid ${rexUuid} not found.`);
  }

  // Initialize as empty array because we'll only fetch running REX records when starting execution, otherwise it remains empty
  let allRunningRexesBeforeUpdate: Rex_db[] = [];

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
  if (maestroControlled !== undefined) {
    rexEntity.maestroControlled = maestroControlled;
  }

  if (maestroExecutionHash !== undefined) {
    rexEntity.maestroExecutionHash = maestroExecutionHash;
  }

  if (startStopExecution !== undefined) {
    rexEntity.isRunning = startStopExecution === "start";
  }

  rexEntity.updatedAt = new Date();

  // Persist and flush all changes
  em.persist(rexEntity);
  await em.flush();

  return {
    updatedRex: convertRexesTypeDbToStore([rexEntity])[0],
    allRunningRexesBeforeUpdate: convertRexesTypeDbToStore(allRunningRexesBeforeUpdate),
  };
}

export default router;
