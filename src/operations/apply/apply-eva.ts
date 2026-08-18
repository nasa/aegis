import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";
import {
  LANDER_UUID,
  getEgressStationUuid,
  getIngressStationUuid,
  isLanderXgressStation,
} from "operations/helpers/evaSequence";

import {
  applyDuplicateStationStage,
  applyDeleteStations,
  applyUpsertStation,
} from "./apply-station";
import { applyDuplicateTraverseStage, applyDeleteTraverses } from "./apply-traverse";
import { applyDeleteActions } from "./apply-action";

/**
 * Re-derive the deprecated `egressLocationUuid` / `ingressLocationUuid` /
 * `egressDuration` / `ingressDuration` fields from the EVA's sequence.
 *
 * The sequence is authoritative; these four fields are a transitional mirror
 * kept in sync so readers that have not been migrated off them yet stay
 * correct. Call this after any mutation that changes xgress station,
 * or that changes xgress stations' durations.
 *
 * Removed once the last reader is migrated.
 */
export function applySyncEvaXgressMirror(m: Mission, evaUuid: string): void {
  const eva = m.evas?.[evaUuid];
  if (!eva) return;

  const resolve = (stationUuid: string | undefined) => {
    if (!stationUuid) return { locationUuid: LANDER_UUID, duration: null as number | null };
    const station = m.stations?.[stationUuid];
    return {
      locationUuid: isLanderXgressStation(station) ? LANDER_UUID : stationUuid,
      duration: station?.duration ?? null,
    };
  };

  const egress = resolve(getEgressStationUuid(eva));
  const ingress = resolve(getIngressStationUuid(eva));

  if (eva.egressLocationUuid !== egress.locationUuid) eva.egressLocationUuid = egress.locationUuid;
  if (eva.ingressLocationUuid !== ingress.locationUuid) {
    eva.ingressLocationUuid = ingress.locationUuid;
  }
  if (eva.egressDuration !== egress.duration) eva.egressDuration = egress.duration;
  if (eva.ingressDuration !== ingress.duration) eva.ingressDuration = ingress.duration;
}

/**
 * Re-derive the xgress mirror for every EVA whose xgress position holds one of the
 * given stations. Used after a station's duration changes, since that value is
 * mirrored onto each EVA that egresses/ingresses there.
 */
export function applySyncEvaXgressMirrorForStations(m: Mission, stationUuids: string[]): void {
  if (stationUuids.length === 0) return;
  const affected = new Set(stationUuids);
  for (const eva of Object.values(m.evas ?? {})) {
    const egressUuid = getEgressStationUuid(eva);
    const ingressUuid = getIngressStationUuid(eva);
    if ((egressUuid && affected.has(egressUuid)) || (ingressUuid && affected.has(ingressUuid))) {
      applySyncEvaXgressMirror(m, eva.uuid);
    }
  }
}

/** Insert/replace an EVA in the doc. */
export function applyUpsertEva(m: Mission, eva: Eva): void {
  m.evas[eva.uuid] = cloneDeep(eva);
  applySyncEvaXgressMirror(m, eva.uuid);
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
  if (fieldName === "sequence") applySyncEvaXgressMirror(m, evaUuid);
}

/**
 * Insert items into an EVA's sequence at index, shifting later items right.
 */
export function applyInsertEvaSequenceItems(
  m: Mission,
  { evaUuid, insertAt, items }: { evaUuid: string; insertAt: number; items: EvaSequenceItem[] }
): void {
  const eva = m.evas[evaUuid];
  if (!eva) return;
  // Do a full array reassignment due to an automerge bug where the push/splice updating to the maestro socket.
  // Serialize through JSON first to fully detach elements from the live Automerge proxy —
  // slicing/spreading proxy objects directly back into the doc throws
  // "Cannot create a reference to an existing document object".
  const existingSequence: EvaSequenceItem[] = JSON.parse(JSON.stringify(eva.sequence));
  eva.sequence = [
    ...existingSequence.slice(0, insertAt),
    ...items.map((item) => cloneDeep(item)),
    ...existingSequence.slice(insertAt),
  ];
  eva.updatedAt = getAccurateNow().getTime();
  applySyncEvaXgressMirror(m, evaUuid);
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
  applySyncEvaXgressMirror(m, evaUuid);
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
  applySyncEvaXgressMirror(m, evaUuid);
}

/**
 * Apply an `EvaXgressChangeStageData`
 * Change the EVA's egress or ingress station.
 */
export function applyEvaXgressChangeStage(m: Mission, stage: EvaXgressChangeStageData): void {
  const eva = m.evas?.[stage.evaUuid];
  if (!eva) return;

  // Insert the incoming station before updating the sequence.
  if (stage.newLanderStation) {
    applyUpsertStation(m, stage.newLanderStation);
  }
  if (stage.stationStage) {
    applyDuplicateStationStage(m, stage.stationStage);
  }

  eva.sequence[stage.sequenceIndex] = { type: "station", uuid: stage.newStationUuid };
  eva.updatedAt = getAccurateNow().getTime();

  // Remove the outgoing station if it was a duplicate for the EVA.
  applyDeleteActions(m, stage.actionUuidsToDelete);
  if (stage.stationUuidToDelete) {
    applyDeleteStations(m, [stage.stationUuidToDelete]);
  }

  applySyncEvaXgressMirror(m, stage.evaUuid);
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
  m.evas[stage.newEvaUuid] = stage.newEva;
  applySyncEvaXgressMirror(m, stage.newEvaUuid);
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
