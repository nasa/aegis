import express, { Request, Response } from "express";
import { globalValues } from "../../global";
import {
  Action_db,
  Eva_db,
  Mission_db,
  Rex_db,
  Station_db,
  Traverse_db,
} from "../../../database/models/_allModels";
import { emitStoreUpsert } from "../../sockets";
import { convertRexesTypeDbToStore } from "store/storeUtils/rex";
import { validateRexOverwrite } from "../../../../utils/rexOverwriteValidator";
import { upsertDatabaseRetry } from "utils/database";
import { v4 as uuidv4 } from "uuid";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

import fs from "node:fs";
import path from "node:path";
import { SCHEMA_DIR } from "utils/validateSchemaServer";

const router = express.Router();

// body of the POST request should be a RexOverwrite object
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions
  const editPermission = emssToken && emssToken === process.env.EMSS_TOKEN;
  if (!editPermission) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "emss/rexOverwrite",
      uuids: [req.body.uuid],
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  // validate inputs
  const validateMsgs = validateRexOverwrite(req.body);
  if (validateMsgs) {
    apiRouteLogger({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "emss/rexOverwrite",
      uuids: [req.body.uuid],
      message: validateMsgs,
    });
    res.status(400).json({ status: "failure", message: validateMsgs });
    return;
  }

  try {
    const updatedRexes: Rex[] = await upsertDatabaseRetry(() => overwriteRex(req.body));

    if (!updatedRexes || updatedRexes.length === 0) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "emss/rexOverwrite",
        uuids: [req.body.uuid],
        message: "Failed to update Rex(es) after multiple tries due to optimistic locking",
        error: new Error("Failed to update rex after multiple tries due to optimistic locking"),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update Rex(es) after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    emitStoreUpsert({
      missionId: updatedRexes[0].missionId,
      socketId: "maestroApi",
      type: "rex",
      data: updatedRexes,
    } as StoreUpsert);
    res.status(200).json({
      status: "success",
      message: `Rex updated for rex uuids ${updatedRexes.map((r) => r.uuid).toString()}`,
      data: updatedRexes,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "emss/rexOverwrite",
      uuids: [req.body.uuid],
      message: `Error processing the POST request: ${errorMessage}`,
      error: asError(e),
    });
    res
      .status(500)
      .json({ status: "error", message: `Error processing the POST request: ${errorMessage}` });
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "sublayerImportable.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "importableSublayer schema retrieved",
      data: schema,
    });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "sublayer/schema",
      appUsername: req.session?.appUser?.username,
      message: `Error retrieving schema: ${e}`,
      error: asError(e),
    });
    res.status(500).json({
      status: "error",
      message: `Error retrieving schema: ${e}`,
      data: null,
    });
  }
});

// update the rex record. More than one rex may be updated if we need to stop a previously running rex
async function overwriteRex(rexOverwrite: RexOverwrite): Promise<Rex[]> {
  const em = globalValues.orm.em;
  await em.begin(); // start a transaction

  let rexEntity = null;
  let allRunningRexesBeforeUpdate: Rex_db[] = [];
  try {
    // Find and Rex
    rexEntity = await em.findOne(Rex_db, { uuid: rexOverwrite.uuid });
    if (!rexEntity) {
      throw new Error(`Rex with uuid ${rexOverwrite.uuid} not found.`);
    }
    // Find the rex's EVA and get the uuid of all the sequence items
    const eva = await em.findOne(Eva_db, { uuid: rexEntity.evaUuid });
    if (!eva) {
      throw new Error(`Eva with uuid ${rexEntity.evaUuid} not found.`);
    }
    const evaSequenceUuids = eva.sequence.map((s) => s.uuid);

    // Make a conversion table of refUuid to station/traverse/action uuid
    // First build the queries
    const stationQuery = em
      .createQueryBuilder(Station_db, "station")
      .select(["station.uuid", "station.refUuid"])
      .where({ uuid: { $in: evaSequenceUuids } });
    const traverseQuery = em
      .createQueryBuilder(Traverse_db, "traverse")
      .select(["traverse.uuid", "traverse.refUuid"])
      .where({ uuid: { $in: evaSequenceUuids } });
    const actionQuery = em
      .createQueryBuilder(Action_db, "action")
      .select(["action.uuid", "action.refUuid"])
      .where({
        $or: [
          { station: { uuid: { $in: evaSequenceUuids } } },
          { traverse: { uuid: { $in: evaSequenceUuids } } },
        ],
      });

    // Execute the queries in parallel
    const [stationResults, traverseResults, actionResults] = await Promise.all([
      stationQuery.execute(),
      traverseQuery.execute(),
      actionQuery.execute(),
    ]);

    // Combine results into a single mapping of refUuid to uuid
    const refUuidToUuid: { [refUuid: string]: string } = {};
    stationResults.forEach((row) => {
      refUuidToUuid[row.refUuid] = row.uuid;
    });
    traverseResults.forEach((row) => {
      refUuidToUuid[row.refUuid] = row.uuid;
    });
    actionResults.forEach((row) => {
      refUuidToUuid[row.refUuid] = row.uuid;
    });

    // loop through each of the entry properties
    for (const refUuid in rexOverwrite.stationEntriesByRefUuid) {
      if (!rexEntity.stationEntries) rexEntity.stationEntries = {}; // init if empty
      // get the station uuid from the refUuid
      const stationUuid = refUuidToUuid[refUuid];
      if (!stationUuid) {
        throw new Error(`Station with refUuid ${refUuid} not found in eva sequence.`);
      }
      const updatedStationEntry: ActivityEntry = {
        ...rexEntity.stationEntries[stationUuid],
        ...rexOverwrite.stationEntriesByRefUuid[refUuid],
      };
      rexEntity.stationEntries[stationUuid] = updatedStationEntry;
    }
    for (const refUuid in rexOverwrite.traverseEntriesByRefUuid) {
      if (!rexEntity.traverseEntries) rexEntity.traverseEntries = {}; // init if empty
      // get the traverse uuid from the refUuid
      const traverseUuid = refUuidToUuid[refUuid];
      if (!traverseUuid) {
        throw new Error(`Traverse with refUuid ${refUuid} not found in eva sequence.`);
      }

      const updatedTraverseEntry: ActivityEntry = {
        ...rexEntity.traverseEntries[traverseUuid],
        ...rexOverwrite.traverseEntriesByRefUuid[refUuid],
      };
      rexEntity.traverseEntries[traverseUuid] = updatedTraverseEntry;
    }
    for (const refUuid in rexOverwrite.actionEntriesByRefUuid) {
      if (!rexEntity.actionEntries) rexEntity.actionEntries = {}; // init if empty
      // get the action uuid from the refUuid
      const actionUuid = refUuidToUuid[refUuid];
      if (!actionUuid) {
        throw new Error(`Action with refUuid ${refUuid} not found in eva sequence.`);
      }

      let updatedActionEntry: ActionEntry = rexEntity.actionEntries[actionUuid];
      // if this is the first entry, set defaults and then override
      if (!updatedActionEntry) {
        updatedActionEntry = {
          rexStatus: "pending",
          markerId: "",
          containerId: "",
          secondaryContainerId: "",
        } as ActionEntry;
      }
      // override the existing entry with the new values
      updatedActionEntry = {
        ...updatedActionEntry,
        ...rexOverwrite.actionEntriesByRefUuid[refUuid],
      } as ActionEntry;

      rexEntity.actionEntries[actionUuid] = updatedActionEntry;
    }
    for (const refUuid in rexOverwrite.xgressEntries) {
      if (!rexEntity.xgressEntries) rexEntity.xgressEntries = {};
      const updatedXgressEntry: ActivityEntry = {
        ...rexEntity.xgressEntries[refUuid],
        ...rexOverwrite.xgressEntries[refUuid],
      };
      // typeRefUuid is either "ingress" or "egress"
      rexEntity.xgressEntries[refUuid] = updatedXgressEntry;
    }

    // Check if we are starting the execution
    if (rexOverwrite.isRunning && !rexEntity.isRunning) {
      // Check if we need to stop other running rex records
      allRunningRexesBeforeUpdate = await em.find(Rex_db, {
        mission: rexEntity.mission,
        isRunning: true,
        uuid: { $ne: rexOverwrite.uuid },
      });

      // Stop all other running REX records - only one can run at a time
      if (allRunningRexesBeforeUpdate.length > 0) {
        for (const runningRex of allRunningRexesBeforeUpdate) {
          runningRex.isRunning = false;
          runningRex.updatedAt = new Date();
          em.persist(runningRex);
        }
      }

      // Check if initial crew positions need to be generated
      if (!rexEntity.posEntries || rexEntity.posEntries.length === 0) {
        // Get egress location
        let egressLocation: AEGISPoint | null = null;
        const rexEva = await em.findOne(Eva_db, { uuid: rexEntity.evaUuid });
        if (rexEva?.egressLocationUuid === "lander") {
          const missionRecord = await em.findOne(Mission_db, { id: rexEntity.mission.id });
          if (missionRecord?.landerLocation) egressLocation = missionRecord.landerLocation;
        } else {
          const stationRecord = await em.findOne(Station_db, { uuid: rexEva?.egressLocationUuid });
          if (stationRecord?.location) egressLocation = stationRecord.location;
        }

        // Add pos entries for each pos source. Each entry will include all pos types
        if (egressLocation) {
          if (!rexEntity.posEntries) rexEntity.posEntries = [];
          for (const posSource of rexEntity.posSources) {
            const newPosEntry: PosEntry = {
              uuid: uuidv4(),
              location: egressLocation,
              elevation: null,
              petSeconds: 0,
              posTypeUuids: rexEntity.posTypes.map((posType) => posType.uuid),
              posSourceUuid: posSource.uuid,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            rexEntity.posEntries.push(newPosEntry);
          }
        }
      }
    }

    // update the rest of the fields
    rexEntity.petStartStopTimestamp = rexOverwrite.petStartStopTimestamp;
    rexEntity.petValueAtStartStop = rexOverwrite.petValueAtStartStop;
    rexEntity.petRunning = rexOverwrite.petRunning;
    rexEntity.maestroControlled = rexOverwrite.maestroControlled;
    rexEntity.maestroEventId =
      rexOverwrite.maestroEventId === "" ? null : rexOverwrite.maestroEventId;
    rexEntity.isRunning = rexOverwrite.isRunning;
    rexEntity.maestroEventUrl = rexOverwrite.maestroEventUrl;
    rexEntity.maestroActivityPropertiesByRefUuid = rexOverwrite.maestroActivityPropertiesByRefUuid;
    rexEntity.updatedAt = new Date();

    em.persist(rexEntity);
    await em.commit(); // commit the transaction. will also flush
  } catch (error) {
    await em.rollback(); // rollback the transaction
    throw error; // throw the error back up to the caller who will re-try this transaction
  }

  // Convert the updated DB entity back to the store type (Rex)
  return [
    convertRexesTypeDbToStore([rexEntity])[0],
    ...convertRexesTypeDbToStore(allRunningRexesBeforeUpdate),
  ];
}

export default router;
