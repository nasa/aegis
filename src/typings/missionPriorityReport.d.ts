/**
 * Ambient types for the "Mission Priorities" report pure module
 * (src/utils/missionPriorityReport.ts). Declared without `export`, per repo convention.
 */

type MissionPriorityRowItem = {
  priorityUuid: string;
  trace: string;
  category: string;
};

type MissionPriorityCategoryGroup = {
  category: string;
  items: MissionPriorityRowItem[];
};

type ResolvedActionMissionPriority = {
  priorityUuid: string | null;
  trace: string;
  category: string;
  fromLegacyAdjective: boolean;
};

type MissionPriorityCellStatus =
  "complete" | "planned" | "inProgress" | "pending" | "skippedOnly" | "disabledOnly" | "none";

/** Why a baseline-only action is missing from a diff target column. */
type MissingBaselineExplanation =
  { kind: "text"; text: string } | { kind: "priorityChanged"; trace: string };

/** EVA prefix + located entity for one action within a report column. */
type MissionPriorityActionLocation = {
  /** As-planned EVA name prefix (campaign columns only). */
  memberEvaName: string | null;
  locationKind: "station" | "traverse" | "poi" | null;
  locationUuid: string | null;
  locationName: string;
};

/**
 * Rollup of a single Mission Priority Identifier within one report column.
 * Action UUID arrays preserve member occurrence multiplicity on campaign columns
 * (matching `getEligibleActionsForColumn` in `evaReportColumns.ts`) so that
 * expanded campaign member EVA sub-columns sum to `activeCount`.
 */
type MissionPriorityCellCoverage = {
  priorityUuid: string;
  status: MissionPriorityCellStatus;
  /** Count of enabled actions passing `rexStatusFilter` (shown as the primary cell count). */
  activeCount: number;
  /** Count of disabled actions (`!action.enabled`) carrying this priority in this column. */
  disabledCount: number;
  /** Breakdown by REX execution status among enabled actions (0 on plan columns). */
  completeCount: number;
  inProgressCount: number;
  pendingCount: number;
  skippedCount: number;
  /** Enabled actions passing `rexStatusFilter`. */
  activeActionUuids: string[];
  /** Disabled actions (`!action.enabled`) in this column. */
  disabledActionUuids: string[];
  /** Enabled actions excluded by `rexStatusFilter` (e.g. skipped/pending when filtered out). */
  excludedRexActionUuids: string[];
};

/**
 * Result of pairing one priority cell's active actions against the baseline
 * cell's active actions. Pairs first by `refUuid` (which links a planned
 * station/traverse action directly to its REX duplicate), then falls back to
 * `actionDefinition` tuple or free-text `name` when comparing distinct EVAs.
 */
type MissionPriorityCellDiff = {
  matched: Action[];
  added: Action[];
  removed: Action[];
  statusChanged: boolean;
  equal: boolean;
};

/**
 * Mission-wide usage summary for one priority identifier outside of (or across)
 * as-planned EVAs, surfacing POI actions not yet promoted, unassigned
 * station/traverse actions, and action templates.
 */
type MissionPriorityUnscheduledUsage = {
  priorityUuid: string;
  /** All POI actions carrying this priority. */
  poiActionUuids: string[];
  /** Subset of `poiActionUuids` that have zero station/traverse copies anywhere in the mission. */
  unpromotedPoiActionUuids: string[];
  /** Actions on as-planned stations/traverses that are not in any as-planned EVA sequence. */
  unassignedLocationActionUuids: string[];
  /** Action template UUIDs referencing this priority. */
  actionTemplateUuids: string[];
  /** Total enabled action occurrences carrying this priority across all as-planned EVAs. */
  plannedInAnyEvaCount: number;
};
