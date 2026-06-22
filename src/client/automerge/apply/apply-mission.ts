import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";
import { applyTraverseUpdatesStage } from "./apply-traverse";

/**
 * Update a top-level field on the Mission draft.
 * Overload: top-level field
 */
export function applyUpdateMissionByField<K extends keyof Mission>(
  m: Mission,
  params: {
    fieldName: K;
    value: Mission[K];
    preserveUpdatedAt?: boolean;
  }
): void;

/**
 * Update a nested map field on the Mission draft.
 * Overload: nested map field
 */
export function applyUpdateMissionByField<
  K extends keyof Mission,
  MapKey extends keyof NonNullable<Mission[K]>,
>(
  m: Mission,
  params: {
    fieldName: K;
    mapKey: MapKey;
    mapValue: NonNullable<Mission[K]>[MapKey];
    preserveUpdatedAt?: boolean;
  }
): void;

export function applyUpdateMissionByField<
  K extends keyof Mission,
  MapKey extends keyof NonNullable<Mission[K]>,
>(
  m: Mission,
  params: {
    fieldName: K;
    value?: Mission[K];
    mapKey?: MapKey;
    mapValue?: NonNullable<Mission[K]>[MapKey];
    preserveUpdatedAt?: boolean;
  }
): void {
  const { fieldName, value, mapKey, mapValue, preserveUpdatedAt = false } = params;

  if (mapKey !== undefined) {
    // This is map field with a nested key/value we need to update

    // Init to {} if this object structure is null or undefined
    if (m[fieldName] == null) {
      (m[fieldName] as NonNullable<Mission[K]>) = {} as NonNullable<Mission[K]>;
    }

    const map = m[fieldName] as NonNullable<Mission[K]>;
    map[mapKey] = cloneDeep(mapValue) as NonNullable<Mission[K]>[MapKey];
  } else {
    m[fieldName] = cloneDeep(value) as Mission[K];
  }
  if (!preserveUpdatedAt) m.updatedAt = getAccurateNow().getTime();
}

/**
 * Apply a pre-computed lander location update atomically.
 *
 * Updates:
 *  - `mission.landerLocation` + `mission.landerElevationMeters`
 *  - The walkback path/distances/elevations for every affected station
 *  - The path/distances/elevations for every egress or ingress boundary
 *    traverse that touches the lander
 */
export function applyLanderLocationUpdateStage(
  m: Mission,
  stage: LanderLocationUpdateStageData
): void {
  // 1. Update mission-level lander fields
  m.landerLocation = cloneDeep(stage.newLocation);
  if (stage.newElevation !== null) {
    m.landerElevationMeters = stage.newElevation;
  }
  m.updatedAt = getAccurateNow().getTime();

  // 2. Update each station's walkback
  for (const wb of stage.walkbackUpdates) {
    const station = m.stations?.[wb.stationUuid];
    if (!station) continue;
    station.walkbackPath = cloneDeep(wb.newWalkbackPath);
    station.walkbackPathSegmentDistances = wb.newWalkbackPathSegmentDistances;
    station.walkbackPathSegmentElevations = wb.newWalkbackPathSegmentElevations;
  }

  // 3. Update affected traverses
  applyTraverseUpdatesStage(m, stage.traverseUpdates);
}
