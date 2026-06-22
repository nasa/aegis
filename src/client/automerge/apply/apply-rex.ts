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
  K extends "stationEntries" | "traverseEntries" | "actionEntries" | "xgressEntries",
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
  const index = rex.posSources.findIndex((ps) => ps.uuid === posSourceUuid);
  if (index !== -1) rex.posSources.splice(index, 1);
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
  const index = rex.posTypes.findIndex((item) => item.uuid === posTypeUuid);
  if (index !== -1) rex.posTypes.splice(index, 1);
  rex.updatedAt = getAccurateNow().getTime();
}
