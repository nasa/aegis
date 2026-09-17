import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

import { applyDuplicateActions, applyDuplicateActionsStage } from "./apply-action";

/** Insert/replace a traverse in the doc. */
export function applyUpsertTraverse(m: Mission, traverse: Traverse): void {
  m.traverses[traverse.uuid] = cloneDeep(traverse);
}

/** Update a single traverse field. */
export function applyUpdateTraverseByField<K extends keyof Traverse>(
  m: Mission,
  {
    traverseUuid,
    fieldName,
    value,
    preserveUpdatedAt = false,
  }: {
    traverseUuid: string;
    fieldName: K;
    value: Traverse[K];
    preserveUpdatedAt?: boolean;
  }
): void {
  const traverse = m.traverses[traverseUuid];
  if (!traverse) return;
  traverse[fieldName] = cloneDeep(value);
  if (!preserveUpdatedAt) {
    traverse.updatedAt = getAccurateNow().getTime();
  }
}

/**
 * Delete a list of traverses from the doc.
 *
 * Also cleans up any matching entries from every REX's `traverseEntries` map
 * so we don't leave orphaned rex entries pointing at deleted traverses.
 */
export function applyDeleteTraverses(m: Mission, traverseUuids: string[]): void {
  if (traverseUuids.length === 0) return;
  for (const uuid of traverseUuids) {
    delete m.traverses[uuid];
  }
  for (const rex of Object.values(m.rexes ?? {})) {
    if (!rex.traverseEntries) continue;
    for (const uuid of traverseUuids) {
      if (uuid in rex.traverseEntries) {
        delete rex.traverseEntries[uuid];
      }
    }
  }
}

/**
 * Duplicate a traverse (and its actions) inside the doc.
 *
 * Returns the new traverse (or undefined if the source did not exist) so the
 * caller can use the new uuid for further mutations in the same .change().
 */
export function applyDuplicateTraverse(
  m: Mission,
  {
    traverseUuid,
    preserveRefUuid,
  }: {
    traverseUuid: string;
    preserveRefUuid: boolean;
  }
): Traverse | undefined {
  if (!traverseUuid) return undefined;
  const traverse = m.traverses?.[traverseUuid];
  if (!traverse) return undefined;

  // Build the new traverse object. We must serialize through JSON to fully
  // detach from the live Automerge proxy — `cloneDeep` alone leaves residual
  // proxy linkage that causes "invalid op for object of type `list`" errors
  // when re-inserting into the doc.
  const newTraverse: Traverse = JSON.parse(JSON.stringify(traverse));
  newTraverse.uuid = uuidv4();
  // preservingRefUuids only occurs when duplicating an EVA for a REX.
  if (!preserveRefUuid) {
    newTraverse.refUuid = uuidv4();
    const newDateString = getAccurateNow().getTime();
    newTraverse.updatedAt = newDateString;
    newTraverse.createdAt = newDateString;
  }
  newTraverse.actionOrderUuids = [];

  // Upsert traverse.
  applyUpsertTraverse(m, newTraverse);

  // Duplicate the source traverse's actions onto the new traverse.
  const traverseActions = Object.values(m.actions ?? {})
    .filter((action) => action.traverseUuid === traverse.uuid)
    .sort(
      (a, b) =>
        traverse.actionOrderUuids.findIndex((o) => o === a.uuid) -
        traverse.actionOrderUuids.findIndex((o) => o === b.uuid)
    );

  applyDuplicateActions(m, {
    actions: traverseActions,
    traverseUuid: newTraverse.uuid,
    promotingFromPoi: false,
    preserveRefUuid,
  });

  return newTraverse;
}

/**
 * Apply a `TraverseDuplicationStageData`: insert the new traverse and apply
 * its actions staged data
 */
export function applyDuplicateTraverseStage(m: Mission, stage: TraverseDuplicationStageData): void {
  m.traverses[stage.newTraverseUuid] = stage.newTraverse;
  applyDuplicateActionsStage(m, stage.actionsStage);
}

/**
 * Apply a list of pre-computed traverse path updates atomically.
 */
export function applyTraverseUpdatesStage(m: Mission, updates: TraverseUpdateStageData[]): void {
  for (const update of updates) {
    const traverse = m.traverses[update.traverseUuid];
    if (!traverse) continue;
    traverse.path = cloneDeep(update.newPath);
    traverse.pathSegmentDistances = update.newPathSegmentDistances;
    traverse.pathSegmentElevations = update.newPathSegmentElevations;
    traverse.pathSegmentAbsoluteSlopes = update.newPathSegmentAbsoluteSlopes;
    if (update.newName !== undefined) traverse.name = update.newName;
    traverse.updatedAt = update.updatedAt;
  }
}
