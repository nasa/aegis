/**
 * Stage data types.
 *
 * A "stage" is a fully-populated, sync-built plan that describes everything a
 * intended to mutate in the Automerge mission doc. Stages are produced by
 * `stage*` builder functions (in `src/client/automerge/stage/`) which read a
 * mission of the mission and pre-allocate every new UUID. Stages are then
 * consumed by `apply*` helper functions (in `src/client/automerge/apply/`) inside
 * a single `missionDocHandle.change()` block, so all mutations land atomically.
 *
 * Naming convention:
 *  - Stage types end in `StageData` (e.g. `EvaDuplicationStageData`).
 *  - Builders are named `stage*` (e.g. `stageDuplicateEva`).
 *  - Inner apply mutators are named `apply*` (e.g. `applyDuplicateEva`).
 */

// ─── Action duplication ────────────────────────────────────────────────────

type ActionDuplicationItem = {
  oldUuid: string;
  newUuid: string;
  /** Detached plain-object clone of the source action ready for re-insertion. */
  newAction: Action;
};

type ActionsDuplicationParent =
  | { kind: "station"; stationUuid: string }
  | { kind: "poi"; poiUuid: string }
  | { kind: "traverse"; traverseUuid: string };

type ActionsDuplicationStageData = {
  parent: ActionsDuplicationParent;
  /** Whether the source actions were duplicated for a REX (preserves refUuid). */
  preserveRefUuid: boolean;
  /** Whether the actions are being promoted from a POI to a station. */
  promotingFromPoi: boolean;
  /** New action items in order. Each item carries its old uuid for traceability. */
  newActions: ActionDuplicationItem[];
  /**
   * The full new actionOrderUuids array the parent should end up with after
   * the apply step. Includes any pre-existing uuids the parent already had,
   * followed by the new uuids appended.
   */
  newActionOrderUuids: string[];
};

// ─── Station duplication ───────────────────────────────────────────────────

type StationDuplicationStageData = {
  oldStationUuid: string;
  newStationUuid: string;
  /** Detached plain-object clone of the source station, ready for insertion. */
  newStation: Station;
  /** Stage describing how to duplicate the source station's actions. */
  actionsStage: ActionsDuplicationStageData;
};

// ─── Adjacent traverse renames stage ──────────────────────────────────────

/**
 * A single traverse whose auto-generated "<before> to <after>" display name
 * needs to be updated because one of its endpoint stations was renamed.
 */
type TraverseRenameStageData = {
  traverseUuid: string;
  newName: string;
};

// ─── Traverse duplication ──────────────────────────────────────────────────

type TraverseDuplicationStageData = {
  oldTraverseUuid: string;
  newTraverseUuid: string;
  newTraverse: Traverse;
  actionsStage: ActionsDuplicationStageData;
};

// ─── EVA duplication ───────────────────────────────────────────────────────

type EvaDuplicationStageData = {
  sourceEvaUuid: string;
  newEvaUuid: string;
  /**
   * Detached plain-object clone of the new EVA, with its `sequence` array
   * already populated with the NEW station/traverse uuids (from
   * `stationStages`/`traverseStages`) and its `ingressLocationUuid` /
   * `egressLocationUuid` already remapped to the new ingress/egress station
   * uuids when applicable.
   */
  newEva: Eva;
  /**
   * True when this duplication is being performed to create a REX. Affects
   * naming (new name is blank), refUuid preservation, and whether ingress /
   * egress stations are duplicated.
   */
  isRexEva: boolean;
  /** Whether stations from the source EVA's sequence should be duplicated. */
  includeStations: boolean;
  stationStages: StationDuplicationStageData[];
  traverseStages: TraverseDuplicationStageData[];
  /** Present only when isRexEva && source's ingressLocationUuid !== "lander". */
  ingressStationStage?: StationDuplicationStageData;
  /** Present only when isRexEva && source's egressLocationUuid !== "lander". */
  egressStationStage?: StationDuplicationStageData;
};

/**
 * Async-fetched data needed to apply an `EvaDuplicationStageData`.
 *
 * EVA duplication today does NOT require any async fetches — stations and
 * traverses are cloned wholesale from the source (including their
 * pre-computed `pathSegmentElevations`). This type exists for future-proofing
 * (e.g. if we ever need to recompute elevations for moved coordinates) and
 * for symmetry with how non-duplication compound operations could plug in.
 */
type EvaDuplicationAsyncData = Record<string, never>;

// ─── REX creation ──────────────────────────────────────────────────────────

type RexCreationStageData = {
  newRexUuid: string;
  /**
   * Detached plain-object clone of the new REX. Its `evaUuid` is already set
   * to `evaStage.newEvaUuid`.
   */
  newRex: Rex;
  /** Stage describing the embedded EVA duplication (always isRexEva=true). */
  evaStage: EvaDuplicationStageData;
};

// ─── REX deletion ──────────────────────────────────────────────────────────

/**
 * Stage describing everything to delete when a REX is removed. Built sync
 * from the doc mission so the apply step can drop everything in one .change().
 *
 * Includes the REX's EVA, all sequence stations & traverses, all child actions,
 * and any non-lander ingress/egress stations specific to the REX's EVA.
 */
type RexDeletionStageData = {
  rexUuid: string;
  /** The EVA owned by this REX (will be deleted alongside it). */
  evaUuid: string;
  /** All station uuids attached to the REX (sequence + ingress/egress). */
  stationUuids: string[];
  /** All traverse uuids in the REX's EVA sequence. */
  traverseUuids: string[];
  /** All action uuids hanging off the deleted stations/traverses. */
  actionUuids: string[];
};

// ─── Traverse update stage ─────────────────────────────────────────────────

type TraverseEndpointsResult = {
  locationBefore: AEGISPoint | undefined;
  locationAfter: AEGISPoint | undefined;
  nameBefore: string;
  nameAfter: string;
};

type TraverseUpdateArgs = {
  traverseUuid: string;
  /**
   * When true, sets `newName` to "<before> to <after>" on the returned stage data.
   */
  renameTraverse?: boolean;
  overrides?: {
    /**
     * Provide a custom path instead of using the traverse's stored path.
     * Used by thunkDocUpdateTraverse when the caller supplies a new polyline.
     */
    path?: AEGISPoint[];
    /**
     * Override the EVA sequence used to resolve endpoints.
     * Used by thunkDocUpdateTraverse when dispatched from thunkDocResetTraverse,
     * which may supply a different EVA's sequence than the one stored on the doc.
     */
    evaSequence?: EvaSequenceItem[];
    /**
     * Substitute a pending station location/name that hasn't been written to the
     * doc yet — passed through to getTraverseEndpoints.
     */
    stationOverride?: { uuid: string; location: AEGISPoint; name: string };
    /**
     * Override the egress location UUID used to resolve the traverse's start
     * endpoint. Use when the EVA's egressLocationUuid is a pending write that
     * hasn't been committed to the doc yet (e.g. thunkDocChangeIngressEgress).
     */
    egressUuid?: string;
    /**
     * Override the ingress location UUID used to resolve the traverse's end
     * endpoint. Use when the EVA's ingressLocationUuid is a pending write that
     * hasn't been committed to the doc yet (e.g. thunkDocChangeIngressEgress).
     */
    ingressUuid?: string;
  };
};

/**
 * Describes a single traverse path update to be applied inside a single
 * `.change()` block. Produced by thunk-layer helpers after all async elevation
 * fetches are complete; consumed by `applyTraverseUpdatesStage`.
 */
type TraverseUpdateStageData = {
  traverseUuid: string;
  newPath: AEGISPoint[];
  newPathSegmentDistances: number[];
  newPathSegmentElevations: number[][] | null;
  newPathSegmentAbsoluteSlopes: (number | null)[][] | null;
  /** When present, the traverse name is also updated. */
  newName?: string;
  updatedAt: number;
};

// ─── Station location update stage ────────────────────────────────────────

/**
 * Describes everything to update when a station moves to a new location:
 * the station itself, its walkback path, and all adjacent traverses (both
 * EVA sequence traverses and egress/ingress boundary traverses).
 * Built synchronously from a doc snapshot; async elevation fetches run before
 * this is applied.
 */
type StationLocationUpdateStageData = {
  stationUuid: string;
  newLocation: AEGISPoint;
  newElevation: number | null;
  newWalkbackPath: AEGISPoint[];
  newWalkbackPathSegmentDistances: number[];
  newWalkbackPathSegmentElevations: number[][] | null;
  newWalkbackPathSegmentAbsoluteSlopes: (number | null)[][] | null;
  /** All adjacent EVA sequence traverses + egress/ingress boundary traverses to update. */
  traverseUpdates: TraverseUpdateStageData[];
};

// ─── Lander location update stage ─────────────────────────────────────────

/**
 * Per-station walkback update produced by `stageLanderLocationUpdate`.
 * Mirrors the shape of `StationLocationUpdateStageData` but scoped only to
 * walkback fields (the station location itself does not change).
 */
type WalkbackUpdateStageData = {
  stationUuid: string;
  newWalkbackPath: AEGISPoint[];
  newWalkbackPathSegmentDistances: number[];
  newWalkbackPathSegmentElevations: number[][] | null;
  newWalkbackPathSegmentAbsoluteSlopes: (number | null)[][] | null;
};

/**
 * Describes everything to update when the lander moves to a new location:
 * the mission's landerLocation + landerElevationMeters, the walkback for
 * every station that has one, and the egress/ingress boundary traverses for
 * EVAs whose first/last traverse touches the lander.
 *
 * Built asynchronously by `stageLanderLocationUpdate` after all elevation
 * fetches complete; consumed by `applyLanderLocationUpdateStage` inside a
 * single `.change()`.
 */
type LanderLocationUpdateStageData = {
  newLocation: AEGISPoint;
  newElevation: number | null;
  walkbackUpdates: WalkbackUpdateStageData[];
  traverseUpdates: TraverseUpdateStageData[];
};

// ─── EVA deletion stage ────────────────────────────────────────────────────

/**
 * Describes everything to delete when an EVA and all its dependents are
 * removed. Built synchronously from the doc snapshot so the apply step can
 * delete everything in one `.change()`.
 */
type EvaDeletionStageData = {
  evaUuid: string;
  traverseUuids: string[];
  traverseActionUuids: string[];
  /** Populated when forRex=true: sequence station uuids owned by the REX EVA. */
  stationUuids: string[];
  /** Action uuids hanging off the deleted stations. */
  stationActionUuids: string[];
  /** REX uuids to delete alongside this planned EVA (only when forRex=false and it has dependents). */
  dependentRexUuids: string[];
  /** EVA uuids belonging to those dependent REXes. */
  dependentRexEvaUuids: string[];
};
