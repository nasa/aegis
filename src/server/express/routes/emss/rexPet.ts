import type { Request, Response } from "express";
import express from "express";

import { validators } from "components/interface/form/formValidators";
import { convertRexesTypeDbToStore } from "store/storeUtils/rex";
import { getEM } from "utils/mikro";

import { Rex_db } from "../../../database/models/_allModels";
import { emitStoreUpsert } from "../../sockets";
import { emssTokenIsValid } from "utils/permissions";
import { upsertDatabaseRetry } from "utils/database";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

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
  const editPermission = emssTokenIsValid(emssToken);

  if (!editPermission) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "emss/rexPet",
      uuids: [rexUuid],
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  if (
    !rexUuid ||
    !petStartStopTimestamp ||
    !petValueAtStartStop ||
    petRunning === undefined // Check for boolean presence
  ) {
    apiRouteLogger({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "emss/rexPet",
      uuids: [rexUuid],
      message:
        "Missing required body parameters (rexUuid, petStartStopTimestamp, petValueAtStartStop, petRunning)",
    });
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
    apiRouteLogger({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "emss/rexPet",
      uuids: [rexUuid],
      message: "Invalid petValueAtStartStop format.",
    });
    res.status(400).json({
      status: "failure",
      message: "Invalid petValueAtStartStop format.",
    });
    return;
  }

  // check format of petStartStopTimestamp
  const isValidTimestamp = typeof validators.mustBeISOString(petStartStopTimestamp) === "undefined";
  if (!isValidTimestamp) {
    apiRouteLogger({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "emss/rexPet",
      uuids: [rexUuid],
      message: "Invalid petStartStopTimestamp format.",
    });
    res.status(400).json({
      status: "failure",
      message: "Invalid petStartStopTimestamp format.",
    });
    return;
  }

  try {
    const updatedRex = await upsertDatabaseRetry(() =>
      updateRexPetClock({
        rexUuid: rexUuid,
        petStartStopTimestamp: petStartStopTimestamp,
        petValueAtStartStop: petValueAtStartStop,
        petRunning: petRunning,
      })
    );

    if (!updatedRex) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "emss/rexPet",
        uuids: [rexUuid],
        message: "Failed to update rex after multiple tries due to optimistic locking",
        error: new Error("Failed to update rex after multiple tries due to optimistic locking"),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update rex after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

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
      apiRouteLogger({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 404,
        routeName: "emss/rexPet",
        uuids: [rexUuid],
        message: errorMessage,
      });
      res.status(404).json({
        status: "failure",
        message: errorMessage,
      });
      return;
    }

    if (errorMessage.includes("not running")) {
      apiRouteLogger({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "emss/rexPet",
        uuids: [rexUuid],
        message: errorMessage,
      });
      res.status(400).json({
        status: "failure",
        message: errorMessage,
      });
      return;
    }

    // Generic server error
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "emss/rexPet",
      uuids: [rexUuid],
      message: `Error processing the POST request: ${errorMessage}`,
      error: asError(e),
    });
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
  await em.begin(); // start a transaction

  let rexEntity = null;
  try {
    // Find and validate the REX entity by its UUID
    rexEntity = await em.findOne(Rex_db, { uuid: params.rexUuid });
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

    em.persist(rexEntity);
    await em.commit(); // commit the transaction. will also flush
  } catch (error) {
    await em.rollback();
    throw error; // re-throw the error to be handled by the caller
  }

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
