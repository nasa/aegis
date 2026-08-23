import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";
import { getTotalDistance } from "utils/mapping/geoMath";
import { thunkFetchElevation } from "store/thunk/thunkElevation";
import { thunkFetchTerrainProfile } from "store/thunk/thunkTerrainProfile";
import { claimTraverseProfileRevisions } from "operations/helpers/traverseProfileRevision";
import type { AppDispatch } from "utils/useAppDispatch";
import type { CompleteTerrainProfile } from "utils/terrainProfile";

/**
 * Build a `LanderLocationUpdateStageData` after the lander moves to a new
 * location.
 *
 * Fetches all required elevations in parallel (lander, per-station walkbacks,
 * egress/ingress boundary traverses) then assembles the stage so the caller
 * can apply everything atomically in a single `.change()`.
 *
 * This function never calls `.change()` itself.
 */
export async function stageLanderLocationUpdate(
  mission: Mission,
  dispatch: AppDispatch,
  newLocation: AEGISPoint
): Promise<LanderLocationUpdateStageData> {
  // ── Build walkback paths for every station that has a location ────────────
  type WalkbackPlan = {
    stationUuid: string;
    newWalkbackPath: AEGISPoint[];
    distances: number[];
  };

  const walkbackPlans: WalkbackPlan[] = Object.values(mission.stations ?? {})
    .filter((station) => !!station.location) // skip stations without a placed location
    .map((station) => {
      const stationWalkbackPath = station.walkbackPath;
      let newWalkbackPath: AEGISPoint[];
      if (!stationWalkbackPath || stationWalkbackPath.length === 0) {
        newWalkbackPath = cloneDeep([station.location, newLocation]);
      } else {
        newWalkbackPath = cloneDeep(stationWalkbackPath);
        // Snap start to station, end to the new lander location
        newWalkbackPath[0] = station.location;
        newWalkbackPath[newWalkbackPath.length - 1] = newLocation;
      }

      const distances: number[] = [];
      for (let i = 1; i < newWalkbackPath.length; i++) {
        distances.push(
          getTotalDistance([newWalkbackPath[i - 1], newWalkbackPath[i]], mission.planetRadius)
        );
      }

      return { stationUuid: station.uuid, newWalkbackPath, distances };
    });

  // ── Collect egress/ingress traverses affected by the lander move ──────────
  //
  // We do NOT delegate to stageTraverseUpdate here. That helper resolves lander
  // endpoints from mission.landerLocation, which still holds the OLD value at
  // this point.
  // Traverses are deduplicated so the same uuid is only staged once even if
  // multiple EVAs reference it.
  type TraversePlan = {
    traverseUuid: string;
    newPath: AEGISPoint[];
    distances: number[];
  };

  /**
   * Build a corrected traverse path with the updated lander endpoint(s)
   * `snapStart` and `snapEnd` control which endpoint(s) to snap
   * Both may be true when the same traverse is both the first and last item in
   * the EVA sequence (single-traverse EVA with lander on both sides).
   */
  const buildLanderTraversePath = (
    traverseUuid: string,
    snapStart: boolean,
    snapEnd: boolean
  ): TraversePlan => {
    const traverse = mission.traverses?.[traverseUuid];
    let path: AEGISPoint[];
    if (traverse?.path && traverse.path.length > 0) {
      path = cloneDeep(traverse.path);
    } else {
      path = [newLocation, newLocation];
    }
    if (snapStart) path[0] = newLocation;
    if (snapEnd) path[path.length - 1] = newLocation;
    const distances: number[] = [];
    for (let i = 1; i < path.length; i++) {
      distances.push(getTotalDistance([path[i - 1], path[i]], mission.planetRadius));
    }
    return { traverseUuid, newPath: path, distances };
  };

  const traversesSeen = new Set<string>();
  const traversePlans: TraversePlan[] = [];

  for (const eva of Object.values(mission.evas ?? {})) {
    if (eva.sequence.length === 0) continue;

    const firstUuid = eva.sequence[0].uuid;
    const lastUuid = eva.sequence[eva.sequence.length - 1].uuid;
    const egressIsLander = eva.egressLocationUuid === "lander";
    const ingressIsLander = eva.ingressLocationUuid === "lander";

    // When both egress and ingress touch the lander and they resolve to the
    // same traverse (single-item sequence), snap both endpoints in one plan.
    if (egressIsLander && ingressIsLander && firstUuid === lastUuid) {
      if (!traversesSeen.has(firstUuid)) {
        traversesSeen.add(firstUuid);
        traversePlans.push(buildLanderTraversePath(firstUuid, true, true));
      }
      continue;
    }

    if (egressIsLander && !traversesSeen.has(firstUuid)) {
      traversesSeen.add(firstUuid);
      traversePlans.push(buildLanderTraversePath(firstUuid, true, false));
    }

    if (ingressIsLander && !traversesSeen.has(lastUuid)) {
      traversesSeen.add(lastUuid);
      traversePlans.push(buildLanderTraversePath(lastUuid, false, true));
    }
  }

  const traverseProfileRevisions = claimTraverseProfileRevisions(
    traversePlans.map(({ traverseUuid }) => traverseUuid)
  );

  // ── Fetch all elevations in parallel ─────────────────────────────────────
  // Three typed groups so TypeScript can narrow each result correctly.
  const [landerElevResult, walkbackElevResults, traverseElevResults] = await Promise.all([
    // Lander point elevation
    dispatch(
      thunkFetchElevation({ path: [newLocation], pathSegmentDistances: [0], uuid: "lander" })
    ),
    // Walkback elevations — one per station
    Promise.all(
      walkbackPlans.map(({ stationUuid, newWalkbackPath, distances }) =>
        dispatch(
          thunkFetchElevation({
            path: newWalkbackPath,
            pathSegmentDistances: distances,
            uuid: `${stationUuid}_walkback`,
          })
        )
      )
    ),
    // Traverse profiles — paths already have the correct new lander endpoint
    Promise.all(
      traversePlans.map(({ traverseUuid, newPath, distances }) =>
        dispatch(
          thunkFetchTerrainProfile({
            path: newPath,
            pathSegmentDistances: distances,
            uuid: traverseUuid,
          })
        )
      )
    ),
  ]);

  // ── Assemble walkback stage data ─────────────────────────────────────────
  const walkbackUpdates: WalkbackUpdateStageData[] = walkbackPlans.map((plan, i) => {
    const elevResult = walkbackElevResults[i];
    return {
      stationUuid: plan.stationUuid,
      newWalkbackPath: plan.newWalkbackPath,
      newWalkbackPathSegmentDistances: plan.distances,
      newWalkbackPathSegmentElevations:
        elevResult.meta.requestStatus === "fulfilled" ? (elevResult.payload as number[][]) : null,
    } satisfies WalkbackUpdateStageData;
  });

  // ── Assemble traverse stage data ─────────────────────────────────────────
  const now = getAccurateNow().getTime();
  const traverseUpdates: TraverseUpdateStageData[] = traversePlans.map((plan, i) => {
    const profileResult = traverseElevResults[i];
    const profile =
      profileResult.meta.requestStatus === "fulfilled"
        ? (profileResult.payload as CompleteTerrainProfile)
        : null;
    return {
      traverseUuid: plan.traverseUuid,
      profileRevision: traverseProfileRevisions.get(plan.traverseUuid)!,
      newPath: plan.newPath,
      newPathSegmentDistances: plan.distances,
      newPathSegmentElevations: profile?.elevationsMeters ?? null,
      newPathSegmentAbsoluteSlopes: profile?.terrainSlopesDegrees ?? null,
      updatedAt: now,
    } satisfies TraverseUpdateStageData;
  });

  return {
    newLocation,
    newElevation:
      landerElevResult.meta.requestStatus === "fulfilled"
        ? (landerElevResult.payload as number)
        : null,
    walkbackUpdates,
    traverseUpdates,
  } satisfies LanderLocationUpdateStageData;
}
