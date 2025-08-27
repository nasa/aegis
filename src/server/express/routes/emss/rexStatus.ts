import express, { Request, Response } from "express";
import { getEM } from "utils/mikro";
import {
  Action_db,
  Eva_db,
  Rex_db,
  Station_db,
  Traverse_db,
} from "../../../database/models/_allModels";
import { emitStoreUpsert } from "../../sockets";
import { convertRexesTypeDbToStore } from "store/storeUtils/rex";
import { OptimisticLockError } from "@mikro-orm/core";
import random from "lodash/random";

const router = express.Router();

// Combine them into a union type
type RexStatusRequest = {
  rexUuid: string;
  type: "station" | "traverse" | "action" | "xgress";
  typeRefUuid: string; // uuid of the station, traverse, or action -- or "egress" or "ingress" for xgress items
  entry: ActivityEntry | ActionEntry;
};

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { rexUuid, type, typeRefUuid, entry } = req.body as RexStatusRequest;
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions
  const editPermission = emssToken && emssToken === process.env.EMSS_TOKEN;

  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  // validate inputs
  if (!rexUuid || !type || !typeRefUuid || !entry) {
    res.status(400).json({
      status: "failure",
      message:
        "Missing required body parameters. Required parameters are rexUuid, type, typeRefUuid, and entry.",
    });
    return;
  }
  if (!["station", "traverse", "action", "xgress"].includes(type)) {
    res.status(400).json({
      status: "failure",
      message: `Invalid type: ${type}. Must be 'station', 'traverse', 'action', or 'xgress'.`,
    });
    return;
  }
  if (!["complete", "in-progress", "pending", "skipped"].includes(entry?.rexStatus)) {
    res.status(400).json({
      status: "failure",
      message: "Entry must have a valid rexStatus property.",
    });
    return;
  }
  // validate values normally checked by the UI
  if (type === "action") {
    const actionEntry = entry as ActionEntry;

    // These will be empty initially, so as the first field is entered, the
    // others will be submitted as empty. Set defaults for any falsy values.
    // Also some of these will never truthy for certain actions, e.g. if the
    // action doesn't require a secondary container ID.
    actionEntry.mass = Number(actionEntry.mass) || 0;
    actionEntry.markerId = actionEntry.markerId || "";
    actionEntry.containerId = actionEntry.containerId || "";
    actionEntry.secondaryContainerId = actionEntry.secondaryContainerId || "";

    if (
      isNaN(actionEntry.mass) ||
      actionEntry.mass.toString().length > 4 ||
      !Number.isInteger(actionEntry.mass)
    ) {
      res.status(400).json({
        status: "failure",
        message: "Action entry must have a valid mass property.",
      });
      return;
    }
  }

  try {
    let updatedRex = null;
    for (let tries = 0; tries < 7; tries++) {
      try {
        updatedRex = await updateRexStatus(req.body);
        break; // if successful, exit the retry loop
      } catch (e) {
        if (e instanceof OptimisticLockError) {
          // lock error. wait anywhere from 100-200ms before retrying
          await new Promise((resolve) => setTimeout(resolve, random(100, 200)));
        } else {
          // some other kind of error happened
          // re-throw it so the outer try/catch can grab it and exit the while loop
          throw e;
        }
      }
    }

    emitStoreUpsert({
      missionId: updatedRex.missionId,
      socketId: "maestroApi",
      type: "rex",
      data: [updatedRex],
    } as StoreUpsert);

    res.status(200).json({
      status: "success",
      message: `${type} entry updated for ${updatedRex.uuid}`,
      data: updatedRex,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    res
      .status(500)
      .json({ status: "error", message: `Error processing the POST request: ${errorMessage}` });
  }
});

/**
 * Updates the rex status for a given rex and entry
 * @returns The updated REX item in store format.
 * @throws Error if REX is not found or not running.
 */
async function updateRexStatus(rexStatusRequest: RexStatusRequest): Promise<Rex> {
  const em = getEM();
  await em.begin(); // start a transaction

  let rexEntity = null;
  try {
    // Find and validate the REX entity by its UUID
    rexEntity = await em.findOne(Rex_db, { uuid: rexStatusRequest.rexUuid });
    if (!rexEntity) {
      throw new Error(`Rex with uuid ${rexStatusRequest.rexUuid} not found.`);
    }
    if (!rexEntity.isRunning) {
      throw new Error(
        `Rex with uuid ${rexStatusRequest.rexUuid} is not running. Rex status update cannot be applied.`
      );
    }

    // Get the rex's EVA entity, validate, then strip to just uuids
    const eva = await em.findOne(Eva_db, { uuid: rexEntity.evaUuid });
    if (!eva) {
      throw new Error(`Eva with uuid ${rexEntity.evaUuid} not found.`);
    }
    const evaSequenceUuids = eva.sequence.map((s) => s.uuid);

    // Depending on the type, get the corresponding uuid to update the rex entry
    if (rexStatusRequest.type === "xgress") {
      if (!rexEntity.xgressEntries) rexEntity.xgressEntries = {};
      if (rexStatusRequest.typeRefUuid !== "egress" && rexStatusRequest.typeRefUuid !== "ingress") {
        throw new Error(
          `Invalid typeRefUuid: ${rexStatusRequest.typeRefUuid} for xgress. Must be 'egress' or 'ingress'.`
        );
      }
      rexEntity.xgressEntries[rexStatusRequest.typeRefUuid] =
        rexStatusRequest.entry as ActivityEntry;
    } else if (rexStatusRequest.type === "station") {
      if (!rexEntity.stationEntries) rexEntity.stationEntries = {};
      const station = await em.findOne(Station_db, {
        refUuid: rexStatusRequest.typeRefUuid,
        uuid: { $in: evaSequenceUuids },
      });

      if (!station) {
        throw new Error(
          `Station with refUuid ${rexStatusRequest.typeRefUuid} not found in eva sequence.`
        );
      }

      rexEntity.stationEntries[station.uuid] = rexStatusRequest.entry as ActivityEntry;
    } else if (rexStatusRequest.type === "traverse") {
      if (!rexEntity.traverseEntries) rexEntity.traverseEntries = {};
      const traverse = await em.findOne(Traverse_db, {
        refUuid: rexStatusRequest.typeRefUuid,
        uuid: { $in: evaSequenceUuids },
      });

      if (!traverse) {
        throw new Error(
          `Traverse with refUuid ${rexStatusRequest.typeRefUuid} not found in eva sequence.`
        );
      }

      rexEntity.traverseEntries[traverse.uuid] = rexStatusRequest.entry as ActivityEntry;
    } else if (rexStatusRequest.type === "action") {
      if (!rexEntity.actionEntries) rexEntity.actionEntries = {};
      const action = await em.findOne(Action_db, {
        refUuid: rexStatusRequest.typeRefUuid,
        $or: [
          { station: { uuid: { $in: evaSequenceUuids } } },
          { traverse: { uuid: { $in: evaSequenceUuids } } },
        ],
      });

      if (!action) {
        throw new Error(
          `Action with refUuid ${rexStatusRequest.typeRefUuid} not found in eva sequence.`
        );
      }

      rexEntity.actionEntries[action.uuid] = rexStatusRequest.entry as ActionEntry;
    } else {
      throw new Error(
        `Invalid type: ${rexStatusRequest.type}. Must be 'station', 'traverse', 'action', or 'xgress'.`
      );
    }

    em.persist(rexEntity);
    await em.commit(); // commit the transaction. will also flush
  } catch (error) {
    await em.rollback(); // rollback the transaction
    throw error; // throw the error back up to the caller who will re-try this transaction
  }

  // Convert the updated DB entity back to the store type (Rex)
  const updatedRexStoreFormatArray = convertRexesTypeDbToStore([rexEntity]);

  if (updatedRexStoreFormatArray.length > 0) {
    return updatedRexStoreFormatArray[0];
  } else {
    throw new Error(
      `Failed to convert updated Rex_db (uuid: ${rexStatusRequest.rexUuid}) back to store format.`
    );
  }
}

export default router;
