/**
 * Science Traceability Matrix (STM) shaped like:
 *
 * 1. Mission A (e.g. Artemis 3)
 *    1. Level1 1
 *       a. Level2 1a
 *          1. Level3 1a-1
 *          2. Level3 1a-2
 *       b. Level2 1b
 *       c. Level2 1c
 *    2. Level1 2
 * 2. Mission B
 *    1. ...
 */

type STMLevel3 = {
  uuid: string; //unique identifier
  numbering: string; // e.g. "1"
  name: string; // e.g. "Inventory, relationships, and ages of nonmare rocks"
  level2Uuid: string;
  createdAt?: string;
  updatedAt?: string;
};
type STMLevel2 = {
  uuid: string;
  numbering: string; // e.g. "a"
  name: string; // e.g. "Differentiation: Magma Oceans, Crust, and Mantle"
  level1Uuid: string;
  createdAt?: string;
  updatedAt?: string;
};
type STMLevel1 = {
  uuid: string;
  numbering: string; // e.g. "1"
  name: string; // Understanding Planetary Processes
  missionId: number;
  createdAt?: string;
  updatedAt?: string;
};

type STMLevel1_db_type = Omit<STMLevel1, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};

type STMLevel2_db_type = Omit<STMLevel2, "level1Uuid" | "createdAt" | "updatedAt"> & {
  level1: STMLevel1_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

type STMLevel3_db_type = Omit<STMLevel3, "level2Uuid" | "createdAt" | "updatedAt"> & {
  level2: STMLevel2_db_type;
  createdAt?: Date;
  updatedAt?: Date;
};

type STMRule = {
  uuid: string;
  missionId: number;
  stmUuid: string;
  count: number;
  verbUuids: string[];
  nounUuids: string[];
  adjectiveUuids: string[];
  verbAny: boolean;
  nounAny: boolean;
  adjectiveAny: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type STMRule_db_type = Omit<STMRule, "createdAt" | "updatedAt"> & {
  createdAt?: Date;
  updatedAt?: Date;
};

/**
 * STM Rules v2 "EVA Coverage" report types (see utils/stmEvaCoverage.ts)
 */

/** Which REX action statuses count toward rule satisfaction on REX columns. */
type RexStatusFilter = "all" | "notSkipped" | "completeOnly";

/**
 * One column of the coverage grid. As-planned EVAs are keyed by their evaUuid;
 * REX columns are keyed by rexUuid (an EVA referenced by multiple rexes yields
 * one column per rex).
 *
 * Columns are ordered and grouped by as-planned EVA: each plan column is
 * immediately followed by its REX execution columns (linked via the rex EVA's
 * refUuid, which stageDuplicateEva preserves when creating a REX). groupKey is
 * the as-planned EVA's uuid — identical for the plan column and its rexes — and
 * groupLabel is the as-planned EVA's name. Orphan rexes (no as-planned EVA with
 * a matching refUuid) share a trailing "Other REXes" group.
 */
type EvaReportColumn = {
  key: string;
  kind: "eva" | "rex" | "campaignPlanned" | "campaignExecuted";
  evaUuid?: string;
  isRex: boolean;
  rexUuid?: string;
  campaignUuid?: string;
  label: string;
  groupKey: string;
  groupLabel: string;
};

/** A run of consecutive coverage columns sharing a groupKey (one as-planned EVA family). */
type StmCoverageColumnGroup = {
  groupKey: string;
  groupLabel: string;
  columns: EvaReportColumn[];
};

/** Coverage of a single rule within one EVA column. */
type StmCoverageRule = {
  ruleUuid: string;
  matchCount: number;
  required: number;
  satisfied: boolean;
  matchingActionUuids: string[];
};

/**
 * Result of pairing one rule's matching actions between the baseline column
 * and a selected cell, by actionDefinition tuple (verb|noun|adjective) only —
 * station/traverse never participates. Multiset semantics: duplicate tuples
 * pair 1:1. `matched` and `added` hold the selected cell's Action objects;
 * `removed` holds the baseline column's Action objects.
 */
type StmCoverageRuleActionDiff = {
  matched: Action[];
  added: Action[];
  removed: Action[];
};

type StmCoverageLevel3Status = "satisfied" | "partial" | "none" | "noRules";

/**
 * Rollup of all of a level3's rules within one EVA column.
 * totalMatches counts match instances (an action matching two rules counts twice)
 * so that per-station breakdowns sum to the column total.
 */
type StmCoverageLevel3 = {
  stmUuid: string;
  status: StmCoverageLevel3Status;
  rules: StmCoverageRule[];
  totalMatches: number;
};

/** Per-station / per-traverse breakdown of a StmCoverageLevel3 for the expanded-column view. */
type StmCoverageSequenceItemMatches = {
  stations: { [stationUuid: string]: number };
  traverses: { [traverseUuid: string]: number };
  evas: { [evaUuid: string]: number };
};

/**
 * One sub-column of an expanded EVA column: a station or traverse in EVA
 * sequence order. `icon` is the station's emoji icon value (stations only).
 */
type StmCoverageSequenceItem = {
  type: "station" | "traverse" | "eva";
  uuid: string;
  name: string;
  icon?: string;
};

/** Tabs of the v2 STM Satisfaction Rules pane. (EVA Coverage moved to the Reports pane.) */
type StmRulesTab = "rules" | "matches";

/** Which STM tier name columns are expanded (names) vs collapsed (ordinals only). */
type StmRulesTierExpansion = {
  level1: boolean;
  level2: boolean;
};

/** A selected coverage cell (or sub-cell), or null when nothing is selected. */
type StmCoverageCellSelection = {
  stmUuid: string;
  columnKey: string;
  /** set when a per-station sub-cell was clicked */
  stationUuid?: string;
  /** set when a per-traverse sub-cell was clicked */
  traverseUuid?: string;
  /** set when a campaign member EVA sub-cell was clicked */
  evaUuid?: string;
} | null;

// Derived column-report data (visibleColumns, coverageByColumnKey, ...) now
// lives in the `report` slice as ColumnReportDerivedData — see typings/store.d.ts.
