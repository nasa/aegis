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

const router = express.Router();

// Combine them into a union type
type RexStatusRequest = {
  rexUuid: string;
  type: "station" | "traverse" | "action";
  typeRefUuid: string; // uuid of the station, traverse, or action
  entry: StationEntry | TraverseEntry | ActionEntry;
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
  if (!["station", "traverse", "action"].includes(type)) {
    res.status(400).json({
      status: "failure",
      message: `Invalid type: ${type}. Must be 'station', 'traverse', or 'action'.`,
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
    if (
      !actionEntry.mass ||
      !actionEntry.markerId ||
      !actionEntry.containerId ||
      !actionEntry.secondaryContainerId
    ) {
      res.status(400).json({
        status: "failure",
        message:
          "Action entry must have rexStatus, mass, markerId, containerId, and secondaryContainerId properties.",
      });
      return;
    }
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
    if (actionEntry.markerId.length > 20) {
      res.status(400).json({
        status: "failure",
        message: "Action entry markerId must be less than 20 characters.",
      });
      return;
    }
    if (actionEntry.containerId.length > 20) {
      res.status(400).json({
        status: "failure",
        message: "Action entry containerId must be less than 20 characters.",
      });
      return;
    }
    if (actionEntry.secondaryContainerId.length > 20) {
      res.status(400).json({
        status: "failure",
        message: "Action entry secondaryContainerId must be less than 20 characters.",
      });
      return;
    }
  }

  try {
    const updatedRex = await updateRexStatus(req.body);

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
  // Find the REX entity by its UUID and mission context
  const rexEntity = await em.findOne(Rex_db, { uuid: rexStatusRequest.rexUuid });

  if (!rexEntity) {
    throw new Error(`Rex with uuid ${rexStatusRequest.rexUuid} not found.`);
  }

  if (!rexEntity.isRunning) {
    throw new Error(
      `Rex with uuid ${rexStatusRequest.rexUuid} is not running. Rex status update cannot be applied.`
    );
  }

  const eva = await em.findOne(Eva_db, { uuid: rexEntity.evaUuid });
  const evaSequenceUuids = eva.sequence.map((s) => s.uuid);
  if (rexStatusRequest.type === "station") {
    if (!rexEntity.stationEntries) rexEntity.stationEntries = {};
    const station = await em.findOne(Station_db, {
      refUuid: rexStatusRequest.typeRefUuid,
      uuid: { $in: evaSequenceUuids },
    });
    rexEntity.stationEntries[station.uuid] = rexStatusRequest.entry as StationEntry;
  } else if (rexStatusRequest.type === "traverse") {
    if (!rexEntity.traverseEntries) rexEntity.traverseEntries = {};
    const traverse = await em.findOne(Traverse_db, {
      refUuid: rexStatusRequest.typeRefUuid,
      uuid: { $in: evaSequenceUuids },
    });
    rexEntity.traverseEntries[traverse.uuid] = rexStatusRequest.entry as TraverseEntry;
  } else if (rexStatusRequest.type === "action") {
    if (!rexEntity.actionEntries) rexEntity.actionEntries = {};
    const action = await em.findOne(Action_db, {
      refUuid: rexStatusRequest.typeRefUuid,
      $or: [
        { station: { uuid: { $in: evaSequenceUuids } } },
        { traverse: { uuid: { $in: evaSequenceUuids } } },
      ],
    });
    rexEntity.actionEntries[action.uuid] = rexStatusRequest.entry as ActionEntry;
  } else {
    throw new Error(
      `Invalid type: ${rexStatusRequest.type}. Must be 'station', 'traverse', or 'action'.`
    );
  }

  await em.persistAndFlush(rexEntity);

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
