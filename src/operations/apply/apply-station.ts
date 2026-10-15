import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";

import { applyDuplicateActionsStage } from "./apply-action";
import { applyRemoveItemsFromAllFolders } from "./apply-mission-folder";
import { applyTraverseUpdatesStage } from "./apply-traverse";

/** Insert/replace a station in the doc. */
export function applyUpsertStation(m: Mission, station: Station): void {
  m.stations[station.uuid] = cloneDeep(station);
}

/** Update a single station field. */
export function applyUpdateStationByField<K extends keyof Station>(
  m: Mission,
  {
    stationUuid,
    fieldName,
    value,
    preserveUpdatedAt = false,
  }: {
    stationUuid: string;
    fieldName: K;
    value: Station[K];
    preserveUpdatedAt?: boolean;
  }
): void {
  const station = m.stations[stationUuid];
  if (!station) return;
  station[fieldName] = cloneDeep(value);
  if (!preserveUpdatedAt) {
    station.updatedAt = getAccurateNow().getTime();
  }
}

/**
 * Delete a list of stations from the doc.
 *
 * Also cleans up any matching entries from every REX's `stationEntries` map and
 * every folder so we don't leave orphaned references pointing at deleted stations.
 */
export function applyDeleteStations(m: Mission, stationUuids: string[]): void {
  if (stationUuids.length === 0) return;
  for (const uuid of stationUuids) {
    delete m.stations[uuid];
  }
  applyRemoveItemsFromAllFolders(m, stationUuids);
  for (const rex of Object.values(m.rexes ?? {})) {
    if (!rex.stationEntries) continue;
    for (const uuid of stationUuids) {
      if (uuid in rex.stationEntries) {
        delete rex.stationEntries[uuid];
      }
    }
  }
}

/** Toggle visibility on a station's map circle. */
export function applyToggleStationCircleVisible(
  m: Mission,
  { stationUuid, circleUuid }: { stationUuid: string; circleUuid: string }
): void {
  const station = m.stations[stationUuid];
  if (!station) return;
  station.mapCircleControls[circleUuid].visible = !station.mapCircleControls[circleUuid].visible;
  station.updatedAt = getAccurateNow().getTime();
}

/** Update the style of a station's map circle. */
export function applyUpdateStationCircleStyle(
  m: Mission,
  {
    stationUuid,
    circleUuid,
    layerStyle,
  }: { stationUuid: string; circleUuid: string; layerStyle: MapSublayerStyle }
): void {
  const station = m.stations[stationUuid];
  if (!station) return;
  station.mapCircleControls[circleUuid].style = layerStyle;
  station.updatedAt = getAccurateNow().getTime();
}

/**
 * Batch-update `mapCircleControls` for multiple stations
 * in a single pass. Takes a map of stationUuid → new MapCircleControls.
 * `preserveUpdatedAt` when true keeps the existing `updatedAt` value.
 */
export function applyUpdateAllStationCircleControls(
  m: Mission,
  updates: Record<string, MapCircleControls>,
  preserveUpdatedAt = true
): void {
  for (const [stationUuid, newMapCircleControls] of Object.entries(updates)) {
    const station = m.stations[stationUuid];
    if (!station) continue;
    station.mapCircleControls = cloneDeep(newMapCircleControls);
    if (!preserveUpdatedAt) {
      station.updatedAt = getAccurateNow().getTime();
    }
  }
}

/**
 * Add/remove `mapCircleControls` entries on every (non-lander) station so they
 * match the current set of circle definitions on the mission.
 */
export function applySyncStationCircleControlsWithCircleDefinitions(m: Mission): void {
  const circleDefinitions = m.circleDefinitions ?? {};
  const now = getAccurateNow().getTime();
  for (const station of Object.values(m.stations)) {
    if (station.isLanderXgress) continue;
    let changed = false;
    for (const circleUuid of Object.keys(circleDefinitions)) {
      if (!station.mapCircleControls[circleUuid]) {
        station.mapCircleControls[circleUuid] = {
          uuid: circleUuid,
          visible: false,
          style: { ...defaultSublayerStyle },
        };
        changed = true;
      }
    }
    for (const circleUuid of Object.keys(station.mapCircleControls)) {
      if (!(circleUuid in circleDefinitions)) {
        delete station.mapCircleControls[circleUuid];
        changed = true;
      }
    }
    if (changed) station.updatedAt = now;
  }
}

/**
 * Apply a `StationDuplicationStageData`
 */
export function applyDuplicateStationStage(m: Mission, stage: StationDuplicationStageData): void {
  m.stations[stage.newStationUuid] = stage.newStation;
  applyDuplicateActionsStage(m, stage.actionsStage);
}

/**
 * Apply a pre-computed station location update staged data.
 */
export function applyStationLocationUpdateStage(
  m: Mission,
  stage: StationLocationUpdateStageData
): void {
  const station = m.stations[stage.stationUuid];
  if (!station) return;

  // Update station location and elevation
  station.location = cloneDeep(stage.newLocation);
  station.updatedAt = getAccurateNow().getTime();
  if (stage.newElevation !== null) {
    station.elevation = stage.newElevation;
  }

  // Update walkback path
  station.walkbackPath = cloneDeep(stage.newWalkbackPath);
  station.walkbackPathSegmentDistances = stage.newWalkbackPathSegmentDistances;
  station.walkbackPathSegmentElevations = stage.newWalkbackPathSegmentElevations;

  // Update all adjacent traverses
  applyTraverseUpdatesStage(m, stage.traverseUpdates);
}
