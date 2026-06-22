import isEqual from "lodash/isEqual";
import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";
import { getTotalDistance } from "utils/mapping/geoMath";
import { getTraverseEndpoints } from "client/automerge/getTraverseEndpoints";
import { thunkFetchElevation } from "store/thunk/thunkElevation";
import type { AppDispatch } from "utils/useAppDispatch";

import { stageDuplicateActions } from "./stage-actions";

/**
 * Build a `TraverseDuplicationStageData` from a doc mission.
 *
 * Pre-allocates the new traverse uuid, detaches the cloned traverse, and
 * recursively stages the duplication of all child actions.
 */
export function stageDuplicateTraverse(
  mission: Mission,
  args: {
    sourceTraverseUuid: string;
    preserveRefUuid: boolean;
  }
): TraverseDuplicationStageData | undefined {
  const sourceTraverse = mission.traverses?.[args.sourceTraverseUuid];
  if (!sourceTraverse) return undefined;

  const newTraverse: Traverse = JSON.parse(JSON.stringify(sourceTraverse));
  newTraverse.uuid = uuidv4();

  if (!args.preserveRefUuid) {
    newTraverse.refUuid = uuidv4();
    const now = getAccurateNow().getTime();
    newTraverse.createdAt = now;
    newTraverse.updatedAt = now;
  }
  newTraverse.actionOrderUuids = [];

  const sourceActions = Object.values(mission.actions ?? {})
    .filter((a) => a.traverseUuid === sourceTraverse.uuid)
    .sort(
      (a, b) =>
        (sourceTraverse.actionOrderUuids?.findIndex((o) => o === a.uuid) ?? 0) -
        (sourceTraverse.actionOrderUuids?.findIndex((o) => o === b.uuid) ?? 0)
    );

  const actionsStageData = stageDuplicateActions(mission, {
    actions: sourceActions,
    preserveRefUuid: args.preserveRefUuid,
    promotingFromPoi: false,
    parent: { kind: "traverse", traverseUuid: newTraverse.uuid },
  });

  return {
    oldTraverseUuid: sourceTraverse.uuid,
    newTraverseUuid: newTraverse.uuid,
    newTraverse,
    actionsStage: actionsStageData,
  };
}

/**
 * Build a `TraverseUpdateStageData` for a single traverse: snaps its endpoints
 * to their neighboring stations/lander, recalculates per-segment distances,
 * and fetches the elevation profile.
 *
 * Returns `null` when the traverse or its parent EVA cannot be found.
 */
export async function stageTraverseUpdate(
  mission: Mission,
  dispatch: AppDispatch,
  args: TraverseUpdateArgs
): Promise<TraverseUpdateStageData | null> {
  const {
    traverseUuid,
    renameTraverse = false,
    overrides: {
      path: customPath,
      evaSequence: evaSequenceOverride,
      stationOverride,
      egressUuid: egressLocationUuidOverride,
      ingressUuid: ingressLocationUuidOverride,
    } = {},
  } = args;

  const traverse = mission?.traverses?.[traverseUuid];
  if (!traverse) return null;

  const eva = Object.values(mission?.evas ?? {}).find((e) =>
    e.sequence.some((s) => s.uuid === traverseUuid)
  );

  const resolvedEvaSequence: EvaSequenceItem[] = evaSequenceOverride ?? eva?.sequence ?? [];

  // Build the working path: prefer customPath, then existing traverse path, then lander→lander
  let newPath: AEGISPoint[];
  if (customPath && customPath.length > 0) {
    newPath = cloneDeep(customPath);
  } else if (traverse.path && traverse.path.length > 0) {
    newPath = cloneDeep(traverse.path);
  } else {
    newPath = [mission.landerLocation, mission.landerLocation];
  }

  // Snap endpoints to their neighboring station/lander locations
  const { locationBefore, locationAfter, nameBefore, nameAfter } = getTraverseEndpoints(
    traverseUuid,
    resolvedEvaSequence,
    egressLocationUuidOverride ?? eva?.egressLocationUuid,
    ingressLocationUuidOverride ?? eva?.ingressLocationUuid,
    mission.stations,
    mission.landerLocation,
    stationOverride
  );

  if (locationBefore && !isEqual(newPath.at(0), locationBefore)) newPath[0] = locationBefore;
  if (locationAfter && !isEqual(newPath.at(-1), locationAfter))
    newPath[newPath.length - 1] = locationAfter;

  // Recalculate per-segment distances
  const pathSegmentDistances: number[] = [];
  for (let i = 1; i < newPath.length; i++) {
    pathSegmentDistances.push(getTotalDistance([newPath[i - 1], newPath[i]], mission.planetRadius));
  }

  // Fetch elevation profile
  const elevationResponse = await dispatch(
    thunkFetchElevation({ path: newPath, pathSegmentDistances, uuid: traverseUuid })
  );

  const newPathSegmentElevations =
    elevationResponse.meta.requestStatus === "fulfilled"
      ? (elevationResponse.payload as number[][])
      : null;

  return {
    traverseUuid,
    newPath,
    newPathSegmentDistances: pathSegmentDistances,
    newPathSegmentElevations,
    newName: renameTraverse ? `${nameBefore} to ${nameAfter}` : undefined,
    updatedAt: getAccurateNow().getTime(),
  } satisfies TraverseUpdateStageData;
}
