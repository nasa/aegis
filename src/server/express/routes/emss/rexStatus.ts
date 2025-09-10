import type { Request, Response } from "express";
import { OptimisticLockError } from "@mikro-orm/postgresql";
import express from "express";
import random from "lodash/random";

import { convertRexesTypeDbToStore } from "store/storeUtils/rex";
import { getEM } from "utils/mikro";

import {
  Action_db,
  Eva_db,
  Rex_db,
  Station_db,
  Traverse_db,
} from "../../../database/models/_allModels";
import { emitStoreUpsert } from "../../sockets";
import { emssTokenIsValid } from "utils/permissions";

const router = express.Router();

// Combine them into a union type
type RexStatusRequest = {
  rexUuid: string;
  type: "station" | "traverse" | "action" | "xgress";
  typeRefUuid: string; // uuid of the station, traverse, or action -- or "egress" or "ingress" for xgress items
  entry: ActivityEntry | ActionEntry;
};

type RexStatusByTypeRefUuid = {
  [typeRefUuid: string]: RexStatusRequest;
};

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions
  const editPermission = emssTokenIsValid(emssToken);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  // validate inputs
  if (!Array.isArray(req.body)) {
    res.status(400).json({
      status: "failure",
      message: "Request body must be an array",
    });
    return;
  }
  let rexUuidToValidate = null;
  for (const rexStatus of req.body as RexStatusRequest[]) {
    if (!rexUuidToValidate) {
      rexUuidToValidate = rexStatus.rexUuid;
    } else {
      if (rexUuidToValidate !== rexStatus.rexUuid) {
        res.status(400).json({
          status: "failure",
          message: "All entries must have the same rexUuid",
        });
        return;
      }
    }
    if (!rexStatus.rexUuid || !rexStatus.type || !rexStatus.typeRefUuid || !rexStatus.entry) {
      res.status(400).json({
        status: "failure",
        message:
          "Missing required body parameters. Required parameters are rexUuid, type, typeRefUuid, and entry.",
      });
      return;
    }
    if (!["station", "traverse", "action", "xgress"].includes(rexStatus.type)) {
      res.status(400).json({
        status: "failure",
        message: `Invalid type: ${rexStatus.type}. Must be 'station', 'traverse', 'action', or 'xgress'.`,
      });
      return;
    }
    if (
      rexStatus.type === "xgress" &&
      rexStatus.typeRefUuid !== "egress" &&
      rexStatus.typeRefUuid !== "ingress"
    ) {
      res.status(400).json({
        status: "failure",
        message: `Invalid typeRefUuid: ${rexStatus.typeRefUuid} for xgress. Must be 'egress' or 'ingress'.`,
      });
      return;
    }
    if (!["complete", "in-progress", "pending", "skipped"].includes(rexStatus.entry?.rexStatus)) {
      res.status(400).json({
        status: "failure",
        message: "Entry must have a valid rexStatus property.",
      });
      return;
    }
    if (
      "maestroPercentCompleteEv1" in rexStatus.entry && //  checks if property exists in the object
      rexStatus.entry.maestroPercentCompleteEv1 !== undefined &&
      rexStatus.entry.maestroPercentCompleteEv1 !== null
    ) {
      // if a percent complete is a valid number between 0 and 100
      if (
        isNaN(rexStatus.entry.maestroPercentCompleteEv1) ||
        rexStatus.entry.maestroPercentCompleteEv1 < 0 ||
        rexStatus.entry.maestroPercentCompleteEv1 > 100
      ) {
        res.status(400).json({
          status: "failure",
          message:
            "Entry must have a valid maestroPercentCompleteEv1 property between 0 and 100, or null.",
        });
        return;
      }
    }
    if (
      "maestroPercentCompleteEv2" in rexStatus.entry && //  checks if property exists in the object
      rexStatus.entry.maestroPercentCompleteEv2 !== undefined &&
      rexStatus.entry.maestroPercentCompleteEv2 !== null
    ) {
      // if a percent complete is a valid number between 0 and 100
      if (
        isNaN(rexStatus.entry.maestroPercentCompleteEv2) ||
        rexStatus.entry.maestroPercentCompleteEv2 < 0 ||
        rexStatus.entry.maestroPercentCompleteEv2 > 100
      ) {
        res.status(400).json({
          status: "failure",
          message:
            "Entry must have a valid maestroPercentCompleteEv2 property between 0 and 100, or null.",
        });
        return;
      }
    }
    // validate values normally checked by the UI
    if (rexStatus.type === "action") {
      const actionEntry = rexStatus.entry as ActionEntry;
      if (actionEntry.mass !== undefined && actionEntry.mass !== null) {
        // if a mass was provided, check that it is a valid number
        if (
          isNaN(actionEntry.mass) ||
          actionEntry.mass.toString().length > 4 ||
          !Number.isInteger(Number(actionEntry.mass))
        ) {
          res.status(400).json({
            status: "failure",
            message: "Action entry must have a valid mass property.",
          });
          return;
        }
      }
    }
  }

  // Consolidate all REX updates into a single object keyed by typeRefUuid
  // Later assignments in the array will override earlier ones
  const rexStatusByTypeRefUuid: RexStatusByTypeRefUuid = {};
  for (const updateRequest of req.body as RexStatusRequest[]) {
    rexStatusByTypeRefUuid[updateRequest.typeRefUuid] = {
      ...updateRequest,
    };
  }

  try {
    let updatedRex: Rex;
    // iteratively update each rexUuid
    for (let tries = 0; tries < 7; tries++) {
      try {
        updatedRex = await updateRexStatus(rexStatusByTypeRefUuid);
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
      missionId: updatedRex.missionId,
      socketId: "maestroApi",
      type: "rex",
      data: [updatedRex],
    } as StoreUpsert);
    res.status(200).json({
      status: "success",
      message: `Rex status settings updated for rex uuid ${updatedRex.uuid}`,
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
async function updateRexStatus(rexStatusByTypeRefUuid: RexStatusByTypeRefUuid): Promise<Rex> {
  const em = getEM();
  await em.begin(); // start a transaction

  let rexEntity = null;
  const rexUuid = Object.values(rexStatusByTypeRefUuid)[0].rexUuid; // get rexUuid from the first entry
  try {
    // Find and validate the REX entity by its UUID
    rexEntity = await em.findOne(Rex_db, { uuid: rexUuid });
    if (!rexEntity) {
      throw new Error(`Rex with uuid ${rexUuid} not found.`);
    }
    if (!rexEntity.isRunning) {
      throw new Error(
        `Rex with uuid ${rexUuid} is not running. Rex status update cannot be applied.`
      );
    }

    // Get the rex's EVA entity, validate, then strip to just uuids to use later on
    const eva = await em.findOne(Eva_db, { uuid: rexEntity.evaUuid });
    if (!eva) {
      throw new Error(`Eva with uuid ${rexEntity.evaUuid} not found.`);
    }
    const evaSequenceUuids = eva.sequence.map((s) => s.uuid);

    // loop through each of the type's refUuids to update on this rex record
    for (const typeRefUuid in rexStatusByTypeRefUuid) {
      const rexStatusRequest = rexStatusByTypeRefUuid[typeRefUuid];
      // Depending on the type, get the corresponding uuid to update the rex entry
      if (rexStatusRequest.type === "xgress") {
        if (!rexEntity.xgressEntries) rexEntity.xgressEntries = {};
        const updatedXgressEntry: ActivityEntry = {
          ...rexEntity.xgressEntries[rexStatusRequest.typeRefUuid],
          ...rexStatusRequest.entry,
        };
        rexEntity.xgressEntries[rexStatusRequest.typeRefUuid] = updatedXgressEntry;
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

        const updatedStationEntry: ActivityEntry = {
          ...rexEntity.stationEntries[station.uuid],
          ...rexStatusRequest.entry,
        };
        rexEntity.stationEntries[station.uuid] = updatedStationEntry;
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

        const updatedTraverseEntry: ActivityEntry = {
          ...rexEntity.traverseEntries[traverse.uuid],
          ...rexStatusRequest.entry,
        };
        rexEntity.traverseEntries[traverse.uuid] = updatedTraverseEntry;
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

        let updatedActionEntry: ActionEntry = rexEntity.actionEntries[action.uuid];
        // if this is the first entry, set defaults and then override
        if (!updatedActionEntry) {
          updatedActionEntry = {
            rexStatus: "pending",
            mass: 0,
            markerId: "",
            containerId: "",
            secondaryContainerId: "",
          } as ActionEntry;
        }
        // override the existing entry with the new values
        updatedActionEntry = {
          ...updatedActionEntry,
          ...rexStatusRequest.entry,
        } as ActionEntry;

        rexEntity.actionEntries[action.uuid] = updatedActionEntry;
      } else {
        throw new Error(
          `Invalid type: ${rexStatusRequest.type}. Must be 'station', 'traverse', 'action', or 'xgress'.`
        );
      }
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
    throw new Error(`Failed to convert updated Rex_db (uuid: ${rexUuid}) back to store format.`);
  }
}

export default router;
