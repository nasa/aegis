import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";

import { applyDeleteActions } from "./apply-action";
import { applyDeleteEvas, applyDuplicateEvaStage } from "./apply-eva";
import { applyDeleteStations } from "./apply-station";
import { applyDeleteTraverses } from "./apply-traverse";

/** Insert/replace a REX in the doc. */
export function applyUpsertRex(m: Mission, rex: Rex): void {
  m.rexes[rex.uuid] = cloneDeep(rex);
}

/** Update a single REX field. */
export function applyUpdateRexByField<K extends keyof Rex>(
  m: Mission,
  {
    rexUuid,
    fieldName,
    value,
    preserveUpdatedAt = false,
  }: {
    rexUuid: string;
    fieldName: K;
    value: Rex[K];
    preserveUpdatedAt?: boolean;
  }
): void {
  const rex = m.rexes[rexUuid];
  if (!rex) return;
  rex[fieldName] = cloneDeep(value);
  if (!preserveUpdatedAt) {
    rex.updatedAt = getAccurateNow().getTime();
  }
}

/** Upsert into one of a REX's keyed entry maps. */
export function applyUpsertRexEntryItem<
  K extends "stationEntries" | "traverseEntries" | "actionEntries",
>(
  m: Mission,
  {
    rexUuid,
    mapField,
    itemUuid,
    value,
  }: {
    rexUuid: string;
    mapField: K;
    itemUuid: string;
    value: NonNullable<Rex[K]>[keyof NonNullable<Rex[K]>];
  }
): void {
  const rex = m.rexes[rexUuid];
  if (!rex) return;
  if (!rex[mapField]) {
    (rex[mapField] as Record<string, unknown>) = {};
  }
  (rex[mapField] as Record<string, unknown>)[itemUuid] = cloneDeep(value);
  rex.updatedAt = getAccurateNow().getTime();
}

/** Delete a list of REXes from the doc. */
export function applyDeleteRexes(m: Mission, rexUuids: string[]): void {
  for (const uuid of rexUuids) {
    delete m.rexes[uuid];
  }
}

/**
 * Apply a `RexCreationStageData`: first apply the embedded EVA duplication
 * stage (inserts stations, traverses, actions, new EVA), then insert the new
 * REX itself.
 */
export function applyCreateRexStage(m: Mission, stage: RexCreationStageData): void {
  applyDuplicateEvaStage(m, stage.evaStage);
  m.rexes[stage.newRexUuid] = stage.newRex;
}

/**
 * Apply a `RexDeletionStageData`: delete the REX itself plus every related
 * entity (EVA, sequence stations, ingress/egress stations, sequence
 * traverses, and all attached actions) in one atomic step.
 */
export function applyDeleteRexStage(m: Mission, stage: RexDeletionStageData): void {
  applyDeleteActions(m, stage.actionUuids);
  applyDeleteStations(m, stage.stationUuids);
  applyDeleteTraverses(m, stage.traverseUuids);
  applyDeleteEvas(m, [stage.evaUuid]);
  delete m.rexes[stage.rexUuid];
}

/**
 * Record that a REX has been executed, which freezes its `executeEditMode` and
 * establishes the action-letter baseline. Idempotent: a stop / re-execute cycle
 * never re-snapshots.
 *
 * The baseline is captured for every mode, since its presence is what marks the
 * mode as frozen. It records each REX-EVA station's and traverse's action order
 * at execution time, which is what pins an action's displayed letter under
 * limited editing.
 */
export function applyFreezeExecuteEditMode(m: Mission, { rexUuid }: { rexUuid: string }): void {
  const rex = m.rexes[rexUuid];
  if (!rex || rex.executeEditState) return;

  const actionLetterOrderByParent: { [parentUuid: string]: string[] } = {};
  const eva = m.evas?.[rex.evaUuid];
  for (const item of eva?.sequence ?? []) {
    // An unselected station slot is a supported state.
    if (!item.uuid) continue;
    const stationOrTraverse =
      item.type === "station" ? m.stations?.[item.uuid] : m.traverses?.[item.uuid];
    if (!stationOrTraverse) continue;
    actionLetterOrderByParent[item.uuid] = [...(stationOrTraverse.actionOrderUuids ?? [])];
  }

  rex.executeEditState = {
    addedStationUuids: [],
    addedTraverseUuids: [],
    addedActionUuids: [],
    actionLetterOrderByParent,
  };
  rex.updatedAt = getAccurateNow().getTime();
}

/** Mark a station as created in this REX's EVA under limited editing. */
export function applyRegisterAddedStation(
  m: Mission,
  { rexUuid, stationUuid }: { rexUuid: string; stationUuid: string }
): void {
  const executeEditState = m.rexes[rexUuid]?.executeEditState;
  if (!executeEditState || !stationUuid) return;
  if (!executeEditState.addedStationUuids.includes(stationUuid))
    executeEditState.addedStationUuids.push(stationUuid);
}

/** Mark a traverse as created in this REX's EVA under limited editing. */
export function applyRegisterAddedTraverse(
  m: Mission,
  { rexUuid, traverseUuid }: { rexUuid: string; traverseUuid: string }
): void {
  const executeEditState = m.rexes[rexUuid]?.executeEditState;
  if (!executeEditState || !traverseUuid) return;
  if (!executeEditState.addedTraverseUuids.includes(traverseUuid))
    executeEditState.addedTraverseUuids.push(traverseUuid);
}

/**
 * Mark an action as created under limited editing. When its parent existed
 * before execution, the action is also appended to that parent's letter
 * baseline, which is what gives it the next letter in sequence.
 */
export function applyRegisterAddedAction(
  m: Mission,
  { rexUuid, actionUuid, parentUuid }: { rexUuid: string; actionUuid: string; parentUuid: string }
): void {
  const executeEditState = m.rexes[rexUuid]?.executeEditState;
  if (!executeEditState || !actionUuid) return;
  if (!executeEditState.addedActionUuids.includes(actionUuid))
    executeEditState.addedActionUuids.push(actionUuid);

  const baseline = executeEditState.actionLetterOrderByParent?.[parentUuid];
  if (baseline && !baseline.includes(actionUuid)) baseline.push(actionUuid);
}

/** Undo `applyRegisterAddedStation`, e.g. when an added sequence slot is re-picked. */
export function applyUnregisterAddedStation(
  m: Mission,
  { rexUuid, stationUuid }: { rexUuid: string; stationUuid: string }
): void {
  const executeEditState = m.rexes[rexUuid]?.executeEditState;
  if (!executeEditState) return;
  const index = executeEditState.addedStationUuids.indexOf(stationUuid);
  if (index >= 0) executeEditState.addedStationUuids.splice(index, 1);
}

/** Undo `applyRegisterAddedTraverse`. */
export function applyUnregisterAddedTraverse(
  m: Mission,
  { rexUuid, traverseUuid }: { rexUuid: string; traverseUuid: string }
): void {
  const executeEditState = m.rexes[rexUuid]?.executeEditState;
  if (!executeEditState) return;
  const index = executeEditState.addedTraverseUuids.indexOf(traverseUuid);
  if (index >= 0) executeEditState.addedTraverseUuids.splice(index, 1);
}

/**
 * Undo `applyRegisterAddedAction`. Pre-existing parents never need baseline
 * compaction — their actions cannot be deleted — so only the added-action list
 * is touched.
 */
export function applyUnregisterAddedAction(
  m: Mission,
  { rexUuid, actionUuid }: { rexUuid: string; actionUuid: string }
): void {
  const executeEditState = m.rexes[rexUuid]?.executeEditState;
  if (!executeEditState) return;
  const index = executeEditState.addedActionUuids.indexOf(actionUuid);
  if (index >= 0) executeEditState.addedActionUuids.splice(index, 1);
}

/**
 * Update PET timer start/stop state directly on a REX in the Mission draft.
 */
export function applyRexPetStartStop(
  m: Mission,
  {
    rexUuid,
    directive,
    petValue,
  }: {
    rexUuid: string;
    directive: "start" | "stop";
    petValue: string;
  }
): void {
  const rex = m.rexes[rexUuid];
  if (!rex) return;
  rex.petRunning = directive === "start";
  rex.petValueAtStartStop = petValue;
  rex.petStartStopTimestamp = getAccurateNow().toISOString();
  rex.updatedAt = getAccurateNow().getTime();
}

/**
 * Update a single field on a PosSource within a REX in the Mission draft.
 */
export function applyUpdatePosSourceField(
  m: Mission,
  {
    rexUuid,
    uuid,
    fieldName,
    value,
  }: {
    rexUuid: string;
    uuid: string;
    fieldName: keyof PosSource;
    value: PosSource[keyof PosSource];
  }
): void {
  const rex = m.rexes[rexUuid];
  if (!rex) return;
  const posSource = rex.posSources?.find((ps) => ps.uuid === uuid);
  if (!posSource) return;
  posSource[fieldName] = cloneDeep(value);
  rex.updatedAt = getAccurateNow().getTime();
}

/**
 * Update a single field on a PosType within a REX in the Mission draft.
 */
export function applyUpdatePosTypeField(
  m: Mission,
  {
    rexUuid,
    uuid,
    fieldName,
    value,
  }: {
    rexUuid: string;
    uuid: string;
    fieldName: keyof PosType;
    value: PosType[keyof PosType];
  }
): void {
  const rex = m.rexes[rexUuid];
  if (!rex) return;
  const posTypeIndex = rex.posTypes?.findIndex((item) => item.uuid === uuid);
  if (posTypeIndex === undefined || posTypeIndex < 0) return;
  (rex.posTypes[posTypeIndex] as Record<typeof fieldName, PosType[keyof PosType]>)[fieldName] =
    cloneDeep(value);
  rex.updatedAt = getAccurateNow().getTime();
}

/**
 * Delete a PosSource from a Rex by uuid (array splice).
 */
export function applyDeletePosSource(
  m: Mission,
  { rexUuid, posSourceUuid }: { rexUuid: string; posSourceUuid: string }
): void {
  const rex = m.rexes[rexUuid];
  if (!rex || !rex.posSources) return;
  // Do a full array reassignment due to an automerge bug where the push/splice updating to the maestro socket.
  // Serialize through JSON first to fully detach elements from the live Automerge proxy —
  // filtering proxy objects directly and reassigning them back throws
  // "Cannot create a reference to an existing document object".
  const existingPosSources: PosSource[] = JSON.parse(JSON.stringify(rex.posSources));
  rex.posSources = existingPosSources.filter((ps) => ps.uuid !== posSourceUuid);
  rex.updatedAt = getAccurateNow().getTime();
}

/**
 * Delete a PosType from a Rex by uuid (array splice).
 */
export function applyDeletePosType(
  m: Mission,
  { rexUuid, posTypeUuid }: { rexUuid: string; posTypeUuid: string }
): void {
  const rex = m.rexes[rexUuid];
  if (!rex?.posTypes) return;
  // Do a full array reassignment due to an automerge bug where the push/splice updating to the maestro socket.
  // Serialize through JSON first to fully detach elements from the live Automerge proxy —
  // filtering proxy objects directly and reassigning them back throws
  // "Cannot create a reference to an existing document object".
  const existingPosTypes: PosType[] = JSON.parse(JSON.stringify(rex.posTypes));
  rex.posTypes = existingPosTypes.filter((item) => item.uuid !== posTypeUuid);
  rex.updatedAt = getAccurateNow().getTime();
}

/** Append a crew position entry to a REX. Does nothing for a missing REX or an existing uuid. */
export function applyCreatePosEntry(
  m: Mission,
  { rexUuid, posEntry }: { rexUuid: string; posEntry: PosEntry }
): void {
  const rex = m.rexes[rexUuid];
  if (!rex) return;
  if (rex.posEntries?.some((entry) => entry.uuid === posEntry.uuid)) return;
  // Reassign the whole array: a push/splice is not picked up by the Maestro socket. JSON
  // detaches the existing entries from the Automerge proxy before they are written back.
  const existingPosEntries: PosEntry[] = JSON.parse(JSON.stringify(rex.posEntries ?? []));
  rex.posEntries = [...existingPosEntries, cloneDeep(posEntry)];
  rex.updatedAt = getAccurateNow().getTime();
}

/** Write only the given fields of an existing position entry. Does nothing for a deleted entry. */
export function applyUpdatePosEntry(
  m: Mission,
  {
    rexUuid,
    posEntryUuid,
    changes,
  }: { rexUuid: string; posEntryUuid: string; changes: Partial<PosEntryEditValues> }
): void {
  const rex = m.rexes[rexUuid];
  const entry = rex?.posEntries?.find((item) => item.uuid === posEntryUuid);
  if (!entry) return;
  const fields = Object.keys(changes) as (keyof PosEntryEditValues)[];
  if (fields.length === 0) return;
  for (const field of fields) {
    (entry as unknown as Record<string, unknown>)[field] = cloneDeep(changes[field] ?? null);
  }
  const now = getAccurateNow().getTime();
  entry.updatedAt = now;
  rex.updatedAt = now;
}

/** Delete a position entry from a REX by uuid. */
export function applyDeletePosEntry(
  m: Mission,
  { rexUuid, posEntryUuid }: { rexUuid: string; posEntryUuid: string }
): void {
  const rex = m.rexes[rexUuid];
  if (!rex?.posEntries) return;
  // Reassign the whole array for the Maestro socket, detached through JSON (see applyCreatePosEntry).
  const existingPosEntries: PosEntry[] = JSON.parse(JSON.stringify(rex.posEntries));
  rex.posEntries = existingPosEntries.filter((entry) => entry.uuid !== posEntryUuid);
  rex.updatedAt = getAccurateNow().getTime();
}
