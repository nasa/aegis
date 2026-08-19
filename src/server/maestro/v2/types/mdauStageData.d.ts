import type { MDAU } from "./mdau";

/**
 * A diffed set of fields to write to a single station. Always carries `uuid`;
 * every other key is optional and will only have a value if there is a diff
 */
export interface StationStage {
  uuid: string;
  name?: string;
  duration?: number;
  /** Reordered action uuids (reorder-only; already validated). */
  actionOrderUuids?: string[];
  updatedAt?: number;
}

/** A diffed set of fields to write to a single traverse. */
export interface TraverseStage {
  uuid: string;
  duration?: number;
  actionOrderUuids?: string[];
  updatedAt?: number;
}

/** A diffed set of fields to write to a single EVA. */
export interface EvaStage {
  uuid: string;
  name?: string;
  datetime?: number | null;
  updatedAt?: number;
}

/** A diffed set of fields to write to a single action. */
export interface ActionStage {
  uuid: string;
  name?: string;
  descriptionTask?: string | null;
  duration?: number | null;
  actionDefinition?: ActionDefinition | null;
  stmAction?: boolean;
  crewAssigned?: Crew[];
  updatedAt?: number;
}

/**
 * A fully-resolved plan for a single rex. Entry maps are keyed by resolved
 * AEGIS uuid (not refUuid). Top-level fields are copied verbatim from the MDAU
 * payload (per the v2 contract) — no per-field diffing on rexes.
 */
export interface RexStage {
  uuid: string;
  updatedAt: number;
  /** Verbatim scalar fields to overwrite on the rex. */
  fields: Partial<
    Pick<
      Rex,
      | "petStartStopTimestamp"
      | "petValueAtStartStop"
      | "petRunning"
      | "isRunning"
      | "maestroControlled"
    >
  >;
  /** Whether the incoming payload flips this rex to running (used for stop-others + posEntries). */
  startsRunning: boolean;
  /** maestroActivityPropertiesByRefUuid resolved to uuid keys. */
  maestroActivityProperties: MaestroActivityProperties | null;
  /**
   * Resolved station/traverse activity entries keyed by sequence uuid.
   */
  stationEntries: { [uuid: string]: MDAU.AegisActivityEntry };
  traverseEntries: { [uuid: string]: MDAU.AegisActivityEntry };
  /** Resolved action entries keyed by action uuid. */
  actionEntries: {
    [uuid: string]: {
      rexStatus: MDAU.AegisRexStatus;
      markerId: string;
      containerId: string;
      secondaryContainerId: string;
    };
  };
}

/** The complete resolved + diffed plan for one `sendMDAU` payload. */
export interface MdauStageData {
  stations: StationStage[];
  traverses: TraverseStage[];
  evas: EvaStage[];
  actions: ActionStage[];
  rexes: RexStage[];
}
