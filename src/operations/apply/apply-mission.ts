import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";
import { applyTraverseUpdatesStage } from "./apply-traverse";
import { getPlanetRadius, usesLgrsCoordinates } from "utils/planets";
import { getTotalDistance } from "utils/mapping/geoMath";

/** Keep saved path lengths and terrain cache inputs consistent when a mission changes bodies. */
export function applyMissionPlanet(mission: Mission, planet: Planet): void {
  if (mission.planet === planet) return;
  mission.planet = planet;
  if (usesLgrsCoordinates(mission)) mission.serverFileGrid = null;
  recalculateMissionDistances(mission);
}

export function recalculateMissionDistances(mission: Mission): void {
  const radius = getPlanetRadius(mission);
  const distances = (points: AEGISPoint[]): number[] =>
    points.slice(1).map((point, index) => getTotalDistance([points[index], point], radius));
  const differs = (before: number[] | null, after: number[]): boolean =>
    before?.length !== after.length || after.some((distance, index) => distance !== before[index]);
  for (const traverse of Object.values(mission.traverses ?? {})) {
    if (!traverse.path) continue;
    const updated = distances(traverse.path);
    if (differs(traverse.pathSegmentDistances, updated)) traverse.pathSegmentDistances = updated;
  }
  for (const station of Object.values(mission.stations ?? {})) {
    if (!station.walkbackPath) continue;
    const updated = distances(station.walkbackPath);
    if (differs(station.walkbackPathSegmentDistances, updated))
      station.walkbackPathSegmentDistances = updated;
  }
}

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
  } else if (fieldName === "planet") {
    applyMissionPlanet(m, value as Planet);
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
 *  - The location/elevation of every lander xgress station
 */
export function applyLanderLocationUpdateStage(
  m: Mission,
  stage: LanderLocationUpdateStageData
): void {
  // 1. Update mission-level lander fields
  m.landerLocation = cloneDeep(stage.newLocation);
  if (usesLgrsCoordinates(m)) m.serverFileGrid = null;
  m.landerElevationMeters = stage.newElevation;
  m.updatedAt = getAccurateNow().getTime();

  // 2. Update each station's walkback
  for (const wb of stage.walkbackUpdates) {
    const station = m.stations?.[wb.stationUuid];
    if (!station) continue;
    station.walkbackPath = cloneDeep(wb.newWalkbackPath);
    station.walkbackPathSegmentDistances = wb.newWalkbackPathSegmentDistances;
  }

  // 3. Update xgress stations at lander
  for (const stationUuid of stage.landerXgressStationUuids ?? []) {
    const station = m.stations?.[stationUuid];
    if (!station) continue;
    station.location = cloneDeep(stage.newLocation);
    station.elevation = stage.newElevation;
    station.updatedAt = getAccurateNow().getTime();
  }

  // 4. Update affected traverses
  applyTraverseUpdatesStage(m, stage.traverseUpdates);
}
