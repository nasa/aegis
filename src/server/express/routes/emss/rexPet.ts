import express, { Request, Response } from "express";
import { getEM } from "utils/mikro";
import { Rex_db } from "../../../database/models/_allModels";
import { emitStoreUpsert } from "../../sockets";
import { convertRexesTypeDbToStore } from "store/storeUtils/rex";
import { validators } from "components/interface/form/formValidators";
import { hasEMSSPerms } from "utils/permissions";

const router = express.Router();

interface RexPetUpdateRequest {
  rexUuid: string;
  petStartStopTimestamp: string;
  petValueAtStartStop: string;
  petRunning: boolean;
}

// POST request to update PET clock
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { rexUuid, petStartStopTimestamp, petValueAtStartStop, petRunning } =
    req.body as RexPetUpdateRequest;
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions
  const editPermission = hasEMSSPerms({ user: req.session.user, emssToken });

  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  if (
    !rexUuid ||
    !petStartStopTimestamp ||
    !petValueAtStartStop ||
    petRunning === undefined // Check for boolean presence
  ) {
    res.status(400).json({
      status: "failure",
      message:
        "Missing required body parameters (rexUuid, petStartStopTimestamp, petValueAtStartStop, petRunning)",
    });
    return;
  }

  // check format of petValueAtStartStop
  const isValidHHMMSS = typeof validators.mustBeHHMMSS(petValueAtStartStop) === "undefined";
  if (!isValidHHMMSS) {
    res.status(400).json({
      status: "failure",
      message: "Invalid petValueAtStartStop format.",
    });
    return;
  }

  // check format of petStartStopTimestamp
  const isValidTimestamp = typeof validators.mustBeISOString(petStartStopTimestamp) === "undefined";
  if (!isValidTimestamp) {
    res.status(400).json({
      status: "failure",
      message: "Invalid petStartStopTimestamp format.",
    });
    return;
  }

  try {
    const updatedRex = await updateRexPetClock({
      rexUuid: rexUuid,
      petStartStopTimestamp: petStartStopTimestamp,
      petValueAtStartStop: petValueAtStartStop,
      petRunning: petRunning,
    });

    emitStoreUpsert({
      missionId: updatedRex.missionId,
      socketId: "maestroApi",
      type: "rex",
      data: [updatedRex],
    } as StoreUpsert);

    res.status(200).json({
      status: "success",
      message: `Rex PET clock updated for uuid ${updatedRex.uuid}`,
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

    if (errorMessage.includes("not running")) {
      res.status(400).json({
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
 * Updates the PET clock for a specific REX item.
 * @param params Parameters for updating the REX PET clock.
 * @returns The updated REX item in store format.
 * @throws Error if REX is not found or not running.
 */
export async function updateRexPetClock(params: {
  rexUuid: string;
  petStartStopTimestamp: string;
  petValueAtStartStop: string;
  petRunning: boolean;
}): Promise<Rex> {
  const em = getEM();
  // Find the REX entity by its UUID and mission context
  const rexEntity = await em.findOne(Rex_db, { uuid: params.rexUuid });

  if (!rexEntity) {
    throw new Error(`Rex with uuid ${params.rexUuid} not found.`);
  }

  if (!rexEntity.isRunning) {
    throw new Error(
      `Rex with uuid ${params.rexUuid} is not running. PET update cannot be applied.`
    );
  }

  // Update the PET-specific fields
  rexEntity.petStartStopTimestamp = params.petStartStopTimestamp;
  rexEntity.petValueAtStartStop = params.petValueAtStartStop;
  rexEntity.petRunning = params.petRunning;

  await em.persistAndFlush(rexEntity);

  // Convert the updated DB entity back to the store type (Rex)
  const updatedRexStoreFormatArray = convertRexesTypeDbToStore([rexEntity]);

  if (updatedRexStoreFormatArray.length > 0) {
    return updatedRexStoreFormatArray[0];
  } else {
    throw new Error(
      `Failed to convert updated Rex_db (uuid: ${params.rexUuid}) back to store format.`
    );
  }
}

export default router;
