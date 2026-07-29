import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";
import { opApplyMdauStationUpdatesV2, type MdauStationUpdateV2 } from "operations/op-station";
import { getSequenceUuidByRefUuidAndRexUuid } from "store/selectors";
import type { MDAU } from "./types/mdau";

/**
 * Convert a Maestro-supplied `actionOrderRefUuids` into the
 * AEGIS `actionOrderUuids` form for a given station.
 *
 * Maestro is only allowed to reorder the station's existing actions — no
 * additions, deletions, or replacements.
 */
const convertActionOrderRefUuidsToUuids = (
  mission: Mission,
  stationUuid: string,
  actionOrderRefUuids: string[]
): string[] | null => {
  const station = mission.stations[stationUuid];
  const existingActionOrderUuids = station.actionOrderUuids;

  if (actionOrderRefUuids.length !== existingActionOrderUuids.length) {
    serverLogger.warning({
      logId: "socket-maestro-v2",
      logValue:
        `applyMdauStationsToDoc - station ${stationUuid}: incoming actionOrderRefUuids length ` +
        `(${actionOrderRefUuids.length}) does not match existing actionOrderUuids length ` +
        `(${existingActionOrderUuids.length}). Maestro may only reorder existing actions. ` +
        `Skipping actionOrder update for this station.`,
    });
    return null;
  }

  // Build refUuid → uuid map from just this station's current actions (size N).
  const refUuidToUuid = new Map<string, string>();
  for (const actionUuid of existingActionOrderUuids) {
    const action = mission.actions[actionUuid];
    if (!action) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue:
          `applyMdauStationsToDoc - station ${stationUuid}: action ${actionUuid} referenced ` +
          `by station.actionOrderUuids not found in mission.actions. ` +
          `Skipping actionOrder update for this station.`,
      });
      return null;
    }
    refUuidToUuid.set(action.refUuid, actionUuid);
  }

  const newActionOrderUuids: string[] = [];
  for (const actionRefUuid of actionOrderRefUuids) {
    const resolvedUuid = refUuidToUuid.get(actionRefUuid);
    if (!resolvedUuid) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue:
          `applyMdauStationsToDoc - station ${stationUuid}: incoming actionOrderRefUuids ` +
          `contains refUuid ${actionRefUuid} which does not match any of the station's ` +
          `existing actions. Maestro may only reorder existing actions. ` +
          `Skipping actionOrder update for this station.`,
      });
      return null;
    }
    newActionOrderUuids.push(resolvedUuid);
  }

  return newActionOrderUuids;
};

/**
 * Atomically applies station name updates from a Maestro MDAU payload to the
 * Automerge mission document.
 *
 * Each key of `aegisStations` is the station's `refUuid`.
 *
 * @param missionId    - The numeric mission ID
 * @param aegisStations - The `aegisStations` map from the MDAU payload
 */
export const applyMdauStationsToDoc = async (
  missionId: number,
  aegisStations: { [stationRefUuid: string]: MDAU.MdauStation }
): Promise<void> => {
  if (!aegisStations || Object.keys(aegisStations).length === 0) return;

  // Use the already-cached doc handle
  const docHandle = globalValues.maestroV2.docHandles.get(missionId);
  if (!docHandle) {
    serverLogger.warning({
      logId: "socket-maestro-v2",
      logValue: `applyMdauStationsToDoc - no doc handle available for mission ${missionId}`,
    });
    return;
  }
  const mission = docHandle.doc();

  // Validate station uuids
  const resolvedStations: (MDAU.MdauStation & { uuid: string })[] = [];
  const unresolved: { refUuid: string; rexUuid: string | null }[] = [];
  for (const stationRefUuid in aegisStations) {
    const stationUuid = getSequenceUuidByRefUuidAndRexUuid(mission, {
      refUuid: stationRefUuid,
      rexUuid: aegisStations[stationRefUuid].rexUuid ?? null,
    });
    // Not found, push to unresolved array
    if (!stationUuid || !mission.stations[stationUuid]) {
      unresolved.push({
        refUuid: stationRefUuid,
        rexUuid: aegisStations[stationRefUuid].rexUuid ?? null,
      });
      continue;
    }
    resolvedStations.push({ ...aegisStations[stationRefUuid], uuid: stationUuid });
  }
  // None of the stations could be found
  if (resolvedStations.length === 0) {
    for (const { refUuid, rexUuid } of unresolved) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `applyMdauStationsToDoc - could not resolve station uuid for refUuid ${refUuid} rexUuid ${rexUuid}`,
      });
    }
    return;
  }

  // Diff check. Filter out any fields that haven't changed
  const stationsToUpdate = resolvedStations.map((mdauStation): MdauStationUpdateV2 => {
    const {
      uuid,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      refUuid,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      rexUuid,
      actionOrderRefUuids, // Strip this out, we need to convert it to uuids
      ...mutableFields
    } = mdauStation;
    const existingStation = mission.stations[uuid];
    // Build a new object with only the fields that changed
    const incomingStation: MdauStationUpdateV2 = { uuid };
    for (const [field, incomingValue] of Object.entries(mutableFields)) {
      if (incomingValue === undefined) continue;
      if (incomingValue === (existingStation as unknown as Record<string, unknown>)[field])
        continue;
      // value was changed, add the field
      (incomingStation as Record<string, unknown>)[field] = incomingValue;
    }

    // Convert actionOrderRefUuids into actionOrderUuids
    if (actionOrderRefUuids !== undefined && actionOrderRefUuids !== null) {
      const newActionOrderUuids = convertActionOrderRefUuidsToUuids(
        mission,
        uuid,
        actionOrderRefUuids
      );
      if (newActionOrderUuids) {
        const existingActionOrderUuids = existingStation.actionOrderUuids;
        // Only include in the update if the order actually differs.
        const orderChanged = newActionOrderUuids.some((u, i) => u !== existingActionOrderUuids[i]);
        if (orderChanged) {
          incomingStation.actionOrderUuids = newActionOrderUuids;
        }
      }
    }

    return incomingStation;
  });

  // Check whether there is actually anything to write.
  const hasChanges = stationsToUpdate.some((s) => Object.keys(s).some((f) => f !== "uuid"));
  if (!hasChanges) return; // No changes to write

  // Apply the changes
  opApplyMdauStationUpdatesV2(docHandle, stationsToUpdate);
};
