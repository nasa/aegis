import { asError } from "@emss/utils";
import type { Request, Response } from "express";

import express from "express";

import { serverLogger } from "utils/logging/serverLogger";
import { emssTokenIsValid } from "utils/permissions";
import { getAutomergeMissions } from "../../../express/routes/missionAutomerge";

type RefUuidMap = {
  [refUuid: string]: string; // uuid of the as-planned entity
};

type MissionRefUuidMaps = {
  [missionId: number]: {
    evas: RefUuidMap;
    stations: RefUuidMap;
    traverses: RefUuidMap;
    actions: RefUuidMap;
  };
};

const router = express.Router();

// Used by Maestro to map every as-planned entity's refUuid to its uuid, for every active mission
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions
  const viewPermissions = emssTokenIsValid(emssToken);

  if (!viewPermissions) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "emss/getRefUuidMap",
      message: "Unauthorized access attempt",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const refUuidMaps = await getRefUuidMapData();
    res.status(200).json({
      status: "success",
      message: `refUuid maps retrieved`,
      data: refUuidMaps,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "emss/getRefUuidMap",
      message: "Error getting refUuid maps",
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error getting refUuid maps ${e}` });
  }
});

/**
 * Build a `refUuid` → `uuid` map for the EVAs, stations, traverses and actions of every
 * active mission.
 *
 * A `refUuid` is only unique within a scope: executing an EVA creates a REX, which
 * deep-duplicates the EVA and its stations, traverses and actions with fresh `uuid`s but the
 * same `refUuid`s. Only the as-planned scope is emitted here, so each `refUuid` resolves to
 * exactly one `uuid`.
 *
 * The as-planned EVAs are the ones not referenced by any `rex.evaUuid`. Entities reachable
 * only from a REX EVA's sequence are excluded; everything else (including stations and actions
 * that belong to no EVA at all) is as-planned.
 */
export async function getRefUuidMapData(): Promise<MissionRefUuidMaps> {
  const allMissions = await getAutomergeMissions();
  const activeMissions = allMissions.filter((mission) => !mission.archivedAt);

  const result: MissionRefUuidMaps = {};

  for (const mission of activeMissions) {
    result[mission.id] = buildMissionRefUuidMap(mission);
  }

  return result;
}

function buildMissionRefUuidMap(mission: Mission): {
  evas: RefUuidMap;
  stations: RefUuidMap;
  traverses: RefUuidMap;
  actions: RefUuidMap;
} {
  const rexEvaUuids = new Set(Object.values(mission.rexes ?? {}).map((rex) => rex.evaUuid));

  const asPlannedEvas: Eva[] = [];
  const rexEvas: Eva[] = [];
  for (const eva of Object.values(mission.evas ?? {})) {
    if (rexEvaUuids.has(eva.uuid)) rexEvas.push(eva);
    else asPlannedEvas.push(eva);
  }

  const asPlannedStationUuids = new Set<string>();
  const asPlannedTraverseUuids = new Set<string>();
  collectSequenceUuids(asPlannedEvas, asPlannedStationUuids, asPlannedTraverseUuids);

  const rexStationUuids = new Set<string>();
  const rexTraverseUuids = new Set<string>();
  collectSequenceUuids(rexEvas, rexStationUuids, rexTraverseUuids);

  // A station or traverse is excluded only when a REX owns it and no as-planned EVA does.
  const isRexStation = (uuid: string) =>
    rexStationUuids.has(uuid) && !asPlannedStationUuids.has(uuid);
  const isRexTraverse = (uuid: string) =>
    rexTraverseUuids.has(uuid) && !asPlannedTraverseUuids.has(uuid);

  const stations = toRefUuidMap(
    Object.values(mission.stations ?? {}).filter((station) => !isRexStation(station.uuid))
  );
  const traverses = toRefUuidMap(
    Object.values(mission.traverses ?? {}).filter((traverse) => !isRexTraverse(traverse.uuid))
  );
  const actions = toRefUuidMap(
    Object.values(mission.actions ?? {}).filter(
      (action) =>
        !(action.stationUuid && isRexStation(action.stationUuid)) &&
        !(action.traverseUuid && isRexTraverse(action.traverseUuid))
    )
  );

  return {
    evas: toRefUuidMap(asPlannedEvas),
    stations,
    traverses,
    actions,
  };
}

/** Add every non-empty station/traverse uuid in the given EVAs' sequences to the passed sets. */
function collectSequenceUuids(evas: Eva[], stationUuids: Set<string>, traverseUuids: Set<string>) {
  for (const eva of evas) {
    for (const item of eva.sequence ?? []) {
      // Sequence items may hold an empty uuid placeholder until the user picks an entity
      if (!item.uuid) continue;
      if (item.type === "station") stationUuids.add(item.uuid);
      else traverseUuids.add(item.uuid);
    }
  }
}

function toRefUuidMap(entities: { uuid: string; refUuid: string }[]): RefUuidMap {
  const map: RefUuidMap = {};
  for (const entity of entities) {
    if (!entity.refUuid) continue;
    map[entity.refUuid] = entity.uuid;
  }
  return map;
}

export default router;
