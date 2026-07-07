import type { Request, Response } from "express";
import express from "express";
import { validateRexOverwrite } from "../../../../utils/rexOverwriteValidator";
import { v4 as uuidv4 } from "uuid";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

import fs from "node:fs";
import path from "node:path";
import { SCHEMA_DIR } from "utils/validateSchemaServer";
import { getAutomergeMissions, getAutomergeMissionHandle } from "../missionAutomerge";

const router = express.Router();
// Used by Maestro to control a rex. Deprecated
// Body of the POST request should be a RexOverwrite object
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions
  const editPermission = emssToken && emssToken === process.env.EMSS_TOKEN;
  if (!editPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
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
    serverLogger.apiRoute({
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
    const updatedRexes: Rex[] = await overwriteRex(req.body);

    res.status(200).json({
      status: "success",
      message: `Rex updated for rex uuids ${updatedRexes.map((r) => r.uuid).toString()}`,
      data: updatedRexes,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: errorMessage.includes("not found") ? 404 : 500,
      routeName: "emss/rexOverwrite",
      uuids: [req.body.uuid],
      message: `Error processing the POST request: ${errorMessage}`,
      error: asError(e),
    });
    const status = errorMessage.includes("not found") ? 404 : 500;
    res
      .status(status)
      .json({ status: "error", message: `Error processing the POST request: ${errorMessage}` });
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "rexOverwrite.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "rexOverwrite schema retrieved",
      data: schema,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "rexOverwrite/schema",
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

// Update the rex record in the automerge mission document.
// More than one rex may be updated if we need to stop a previously running rex.
export async function overwriteRex(rexOverwrite: RexOverwrite): Promise<Rex[]> {
  if (!rexOverwrite || !rexOverwrite.uuid) return [];

  // Find the mission containing this rex
  const allMissions = await getAutomergeMissions();
  const missionWithRex = allMissions.find((m) => m.rexes?.[rexOverwrite.uuid]);
  if (!missionWithRex) {
    throw new Error(`Rex with uuid ${rexOverwrite.uuid} not found.`);
  }

  const rex = missionWithRex.rexes[rexOverwrite.uuid];
  const eva = missionWithRex.evas?.[rex.evaUuid];
  if (!eva) {
    throw new Error(`Eva with uuid ${rex.evaUuid} not found.`);
  }

  const evaSequenceUuids = eva.sequence.map((s) => s.uuid);

  // Build a mapping of refUuid → uuid for all stations, traverses, and actions in the EVA sequence
  const refUuidToUuid: { [refUuid: string]: string } = {};
  evaSequenceUuids.forEach((uuid) => {
    const station = missionWithRex.stations?.[uuid];
    if (station?.refUuid) refUuidToUuid[station.refUuid] = uuid;
    const traverse = missionWithRex.traverses?.[uuid];
    if (traverse?.refUuid) refUuidToUuid[traverse.refUuid] = uuid;
  });
  Object.values(missionWithRex.actions || {}).forEach((action) => {
    const isInSequence =
      (action.stationUuid && evaSequenceUuids.includes(action.stationUuid)) ||
      (action.traverseUuid && evaSequenceUuids.includes(action.traverseUuid));
    if (isInSequence && action.refUuid) {
      refUuidToUuid[action.refUuid] = action.uuid;
    }
  });

  // Validate all refUuids in the overwrite exist in the eva sequence
  for (const refUuid in rexOverwrite.stationEntriesByRefUuid) {
    if (!refUuidToUuid[refUuid]) {
      throw new Error(`Station with refUuid ${refUuid} not found in eva sequence.`);
    }
  }
  for (const refUuid in rexOverwrite.traverseEntriesByRefUuid) {
    if (!refUuidToUuid[refUuid]) {
      throw new Error(`Traverse with refUuid ${refUuid} not found in eva sequence.`);
    }
  }
  for (const refUuid in rexOverwrite.actionEntriesByRefUuid) {
    if (!refUuidToUuid[refUuid]) {
      throw new Error(`Action with refUuid ${refUuid} not found in eva sequence.`);
    }
  }

  // Determine which other rexes need to be stopped if we are starting
  const rexUuidsToStop: string[] = [];
  if (rexOverwrite.isRunning && !rex.isRunning) {
    for (const uuid in missionWithRex.rexes) {
      if (uuid !== rexOverwrite.uuid && missionWithRex.rexes[uuid].isRunning) {
        rexUuidsToStop.push(uuid);
      }
    }
  }

  const missionDocHandle = await getAutomergeMissionHandle(missionWithRex.id);

  missionDocHandle.change((mission: Mission) => {
    const rexEntity = mission.rexes[rexOverwrite.uuid];
    if (!rexEntity) return;

    // Stop all other running rexes – only one can run at a time
    for (const uuid of rexUuidsToStop) {
      if (mission.rexes[uuid]) {
        mission.rexes[uuid].isRunning = false;
        mission.rexes[uuid].updatedAt = Date.now();
      }
    }

    // Generate initial crew position entries when transitioning to running
    if (rexOverwrite.isRunning && !rexEntity.isRunning) {
      if (!rexEntity.posEntries || rexEntity.posEntries.length === 0) {
        let egressLocation: AEGISPoint | null = null;
        const rexEva = mission.evas?.[rexEntity.evaUuid];
        // Spread location (same as cloning in this case) so we remove the automerge proxy ref
        if (rexEva?.egressLocationUuid === "lander") {
          egressLocation = mission.landerLocation ? { ...mission.landerLocation } : null;
        } else if (rexEva?.egressLocationUuid) {
          const loc = mission.stations?.[rexEva.egressLocationUuid]?.location;
          egressLocation = loc ? { ...loc } : null;
        }

        if (egressLocation) {
          rexEntity.posEntries = [];
          for (const posSource of rexEntity.posSources) {
            const newPosEntry: PosEntry = {
              uuid: uuidv4(),
              location: egressLocation,
              elevation: null,
              petSeconds: 0,
              posTypeUuids: rexEntity.posTypes.map((posType) => posType.uuid),
              posSourceUuid: posSource.uuid,
              createdAt: new Date().getTime(),
              updatedAt: new Date().getTime(),
            };
            rexEntity.posEntries.push(newPosEntry);
          }
        }
      }
    }

    // Apply station entries
    for (const refUuid in rexOverwrite.stationEntriesByRefUuid) {
      if (!rexEntity.stationEntries) rexEntity.stationEntries = {};
      const stationUuid = refUuidToUuid[refUuid];
      const updatedStationEntry: ActivityEntry = {
        ...rexEntity.stationEntries[stationUuid],
        ...rexOverwrite.stationEntriesByRefUuid[refUuid],
      };
      rexEntity.stationEntries[stationUuid] = updatedStationEntry;
    }

    // Apply traverse entries
    for (const refUuid in rexOverwrite.traverseEntriesByRefUuid) {
      if (!rexEntity.traverseEntries) rexEntity.traverseEntries = {};
      const traverseUuid = refUuidToUuid[refUuid];
      const updatedTraverseEntry: ActivityEntry = {
        ...rexEntity.traverseEntries[traverseUuid],
        ...rexOverwrite.traverseEntriesByRefUuid[refUuid],
      };
      rexEntity.traverseEntries[traverseUuid] = updatedTraverseEntry;
    }

    // Apply action entries
    for (const refUuid in rexOverwrite.actionEntriesByRefUuid) {
      if (!rexEntity.actionEntries) rexEntity.actionEntries = {};
      const actionUuid = refUuidToUuid[refUuid];
      let updatedActionEntry: ActionEntry = rexEntity.actionEntries[actionUuid];
      if (!updatedActionEntry) {
        updatedActionEntry = {
          rexStatus: "pending",
          markerId: "",
          containerId: "",
          secondaryContainerId: "",
        } as ActionEntry;
      }
      updatedActionEntry = {
        ...updatedActionEntry,
        ...rexOverwrite.actionEntriesByRefUuid[refUuid],
      } as ActionEntry;
      rexEntity.actionEntries[actionUuid] = updatedActionEntry;
    }

    // Apply xgress entries
    for (const refUuid in rexOverwrite.xgressEntries) {
      if (!rexEntity.xgressEntries) rexEntity.xgressEntries = {};
      const updatedXgressEntry: ActivityEntry = {
        ...rexEntity.xgressEntries[refUuid],
        ...rexOverwrite.xgressEntries[refUuid],
      };
      rexEntity.xgressEntries[refUuid] = updatedXgressEntry;
    }

    // Update top-level fields
    rexEntity.petStartStopTimestamp = rexOverwrite.petStartStopTimestamp;
    rexEntity.petValueAtStartStop = rexOverwrite.petValueAtStartStop;
    rexEntity.petRunning = rexOverwrite.petRunning;
    rexEntity.maestroControlled = rexOverwrite.maestroControlled;
    rexEntity.maestroEventId =
      rexOverwrite.maestroEventId === "" ? null : rexOverwrite.maestroEventId;
    rexEntity.isRunning = rexOverwrite.isRunning;
    rexEntity.maestroEventUrl = rexOverwrite.maestroEventUrl;
    rexEntity.maestroActivityPropertiesByRefUuid = rexOverwrite.maestroActivityPropertiesByRefUuid;
    rexEntity.updatedAt = Date.now();
  });

  // Read back the updated rexes from the doc
  const updatedMission = missionDocHandle.doc();
  return [
    updatedMission.rexes[rexOverwrite.uuid],
    ...rexUuidsToStop.map((uuid) => updatedMission.rexes[uuid]),
  ].filter(Boolean);
}

export default router;
