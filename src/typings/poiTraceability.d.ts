/**
 * Ambient types for the POI Traceability report (Reports pane, Workstream D).
 *
 * These describe the pure rollups produced by `src/utils/poiTraceability.ts`.
 * Like the rest of the domain model they are declared without `export` and are
 * referenced by name across the codebase.
 */

// NOTE: `PoiTraceScope` (all / campaignPlanned / campaignExecuted) is declared
// with the report UI state in `store.d.ts` and reused here by name — it mirrors
// the campaign planned/executed column sets of the other two reports so a
// campaign's set means exactly the same EVAs here as in the coverage/comparison
// grids.

/** Collapsed execution status for a promoted action in a REX. */
type PoiTraceActionStatus = "pending" | "complete" | "skipped";

/**
 * One station-action copy of a POI action (an action whose parentActionUuid is
 * the POI action), restricted to the current scope.
 */
type PoiTraceStationCopy = {
  stationActionUuid: string;
  stationUuid: string | null;
  stationName: string | null;
  stationIcon: string | null;
  traverseUuid: string | null;
  traverseName: string | null;
  parentCopyDate: number | null;
  /** In-scope EVAs whose stations/traverses contain this station action. */
  inScopeEvaUuids: string[];
  /** Per in-scope execution REX that contains this action. */
  executions: { rexUuid: string; rexName: string; status: PoiTraceActionStatus }[];
};

/** One POI action and the station copies it was promoted into, in scope. */
type PoiTraceActionDetail = {
  poiActionUuid: string;
  name: string;
  stationCopies: PoiTraceStationCopy[];
};

/** A single POI row in the traceability report. */
type PoiTraceRow = {
  poiUuid: string;
  name: string;
  tags: string[];
  priorityOverride: number | null;
  /** As-planned stations linked via poiUuids that appear in in-scope EVAs. */
  linkedStationCount: number;
  /** POI actions with >=1 in-scope station copy. */
  promotedActionCount: number;
  /** poi.actionOrderUuids length. */
  totalPoiActionCount: number;
  /** Distinct in-scope EVAs containing linkage or promoted copies. */
  plannedEvaCount: number;
  completeCount: number;
  skippedCount: number;
  actions: PoiTraceActionDetail[];
  /** Every as-planned station linked via poiUuids (with its in-scope EVAs). */
  linkedStations: {
    stationUuid: string;
    stationName: string;
    stationIcon: string | null;
    inScopeEvaUuids: string[];
  }[];
};
