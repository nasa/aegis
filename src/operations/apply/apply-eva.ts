import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";

import { applyDuplicateStationStage, applyDeleteStations } from "./apply-station";
import { applyDuplicateTraverseStage, applyDeleteTraverses } from "./apply-traverse";
import { applyDeleteActions } from "./apply-action";

/** Insert/replace an EVA in the doc. */
export function applyUpsertEva(m: Mission, eva: Eva): void {
  m.evas[eva.uuid] = cloneDeep(eva);
}

/**
 * Update an EVA field, or an element of an EVA's array
 * field when `index` is supplied.
 */
export function applyUpdateEvaByField<K extends keyof Eva>(
  m: Mission,
  params: {
    evaUuid: string;
    fieldName: K;
    value: Eva[K];
    preserveUpdatedAt?: boolean;
  }
): void;
export function applyUpdateEvaByField<K extends keyof Eva>(
  m: Mission,
  params: {
    evaUuid: string;
    fieldName: K;
    index: Eva[K] extends Array<infer _> ? number : never;
    value: Eva[K] extends Array<infer E> ? E : never;
    preserveUpdatedAt?: boolean;
  }
): void;
export function applyUpdateEvaByField<K extends keyof Eva>(
  m: Mission,
  params: {
    evaUuid: string;
    fieldName: K;
    index?: Eva[K] extends Array<infer _> ? number : never;
    value: Eva[K] | (Eva[K] extends Array<infer E> ? E : never);
    preserveUpdatedAt?: boolean;
  }
): void {
  const { evaUuid, fieldName, value, preserveUpdatedAt = false } = params;
  const index = "index" in params ? (params.index as number) : undefined;
  const eva = m.evas[evaUuid];
  if (!eva) return;
  if (index !== undefined) {
    // Array element update: eva[fieldName][index] = value
    (eva[fieldName] as unknown[])[index] = cloneDeep(value);
  } else {
    // Top-level field update: eva[fieldName] = value
    eva[fieldName] = cloneDeep(value) as Eva[K];
  }
  if (!preserveUpdatedAt) {
    eva.updatedAt = getAccurateNow().getTime();
  }
}

/** Push items onto an EVA's sequence. */
export function applyPushEvaSequenceItems(
  m: Mission,
  { evaUuid, items }: { evaUuid: string; items: EvaSequenceItem[] }
): void {
  const eva = m.evas[evaUuid];
  if (!eva) return;
  // Do a full array reassignment due to an automerge bug where the push/splice updating to the maestro socket.
  // Existing elements are serialized through JSON first to fully detach them from the live
  // Automerge proxy — spreading proxy objects directly back into the doc throws
  // "Cannot create a reference to an existing document object".
  const existingSequence: EvaSequenceItem[] = JSON.parse(JSON.stringify(eva.sequence));
  eva.sequence = [...existingSequence, ...items.map((item) => cloneDeep(item))];
  eva.updatedAt = getAccurateNow().getTime();
}

/** Splice an EVA's sequence. */
export function applySpliceEvaSequence(
  m: Mission,
  { evaUuid, start, deleteCount }: { evaUuid: string; start: number; deleteCount: number }
): void {
  const eva = m.evas[evaUuid];
  if (!eva) return;
  // Do a full array reassignment due to an automerge bug where the push/splice updating to the maestro socket.
  // Serialize through JSON first to fully detach elements from the live Automerge proxy —
  // slicing/spreading proxy objects directly back into the doc throws
  // "Cannot create a reference to an existing document object".
  const existingSequence: EvaSequenceItem[] = JSON.parse(JSON.stringify(eva.sequence));
  eva.sequence = [
    ...existingSequence.slice(0, start),
    ...existingSequence.slice(start + deleteCount),
  ];
  eva.updatedAt = getAccurateNow().getTime();
}

/** Swap two items in an EVA's sequence. */
export function applySwapEvaSequenceItems(
  m: Mission,
  { evaUuid, indexA, indexB }: { evaUuid: string; indexA: number; indexB: number }
): void {
  const eva = m.evas[evaUuid];
  if (!eva) return;
  // JSON round-trip is required to detach Automerge proxies before re-inserting;
  // cloneDeep leaves proxy linkage intact and causes "Cannot assign unknown object" at runtime.
  const a: EvaSequenceItem = JSON.parse(JSON.stringify(eva.sequence[indexA]));
  const b: EvaSequenceItem = JSON.parse(JSON.stringify(eva.sequence[indexB]));
  eva.sequence[indexA] = b;
  eva.sequence[indexB] = a;
  eva.updatedAt = getAccurateNow().getTime();
}

/** Delete a list of EVAs from the doc. */
export function applyDeleteEvas(m: Mission, evaUuids: string[]): void {
  for (const uuid of evaUuids) {
    delete m.evas[uuid];
  }
}

/**
 * Apply a fully-built `EvaDuplicationStageData` to the doc draft in one
 * atomic step.
 */
export function applyDuplicateEvaStage(m: Mission, stage: EvaDuplicationStageData): void {
  for (const stationStage of stage.stationStages) {
    applyDuplicateStationStage(m, stationStage);
  }
  for (const traverseStage of stage.traverseStages) {
    applyDuplicateTraverseStage(m, traverseStage);
  }
  if (stage.ingressStationStage) {
    applyDuplicateStationStage(m, stage.ingressStationStage);
  }
  if (stage.egressStationStage) {
    applyDuplicateStationStage(m, stage.egressStationStage);
  }
  m.evas[stage.newEvaUuid] = stage.newEva;
}

/**
 * Apply a pre-built `EvaDeletionStageData`.
 * Deletes all traverses, traverse actions, stations, station actions,
 * dependent REX EVAs, dependent REXes, and the EVA itself in one pass.
 */
export function applyDeleteEvaStage(m: Mission, stage: EvaDeletionStageData): void {
  // Delete all traverse actions and station actions
  applyDeleteActions(m, [...stage.traverseActionUuids, ...stage.stationActionUuids]);
  // Delete traverses and stations
  applyDeleteTraverses(m, stage.traverseUuids);
  applyDeleteStations(m, stage.stationUuids);
  // Delete dependent REX EVAs + REXes
  for (const rexEvaUuid of stage.dependentRexEvaUuids) {
    delete m.evas[rexEvaUuid];
  }
  for (const rexUuid of stage.dependentRexUuids) {
    delete m.rexes[rexUuid];
  }
  // Delete the primary EVA
  delete m.evas[stage.evaUuid];
}
