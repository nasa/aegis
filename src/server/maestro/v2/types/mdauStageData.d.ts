import type { MDAU } from "./mdau";

/**
 * A diffed set of fields to write to a single station. Always carries `uuid`;
 * every other key is optional and will only have a value if there is a diff
 */
export interface StationStage {
  uuid: string;
  name?: string;
  duration?: number;
  /** New action order, including added and excluding deleted actions (already validated). */
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

/**
 * Maestro's `maestroEventId`/`maestroEventUrl` arrive on the `MdauEva`
 * payload but belong on the REX tied to that EVA (`rex.evaUuid === eva.uuid`),
 * not on the EVA itself.
 */
export interface RexEventInfoStage {
  uuid: string;
  maestroEventId: string;
  maestroEventUrl: string;
}

/** A diffed set of fields to write to a single action. */
export interface ActionStage {
  uuid: string;
  name?: string;
  descriptionTask?: string | null;
  duration?: number | null;
  actionDefinition?: ActionDefinition | null;
  missionPriorityUuid?: string | null;
  stmAction?: boolean;
  crewAssigned?: Crew[];
  enabled?: boolean;
  updatedAt?: number;
}

/**
 * A fully-resolved plan for a single rex. Entry maps are keyed by AEGIS uuid.
 * Top-level fields are copied verbatim from the MDAU payload (per the v2
 * contract) — no per-field diffing on rexes.
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
  /**
   * The incoming `executeEditMode`, staged only when it differs from the doc
   * and the rex is not yet frozen (`executeEditState` is null). Once frozen,
   * the mode is fixed for the REX's life and Maestro's value is ignored.
   */
  executeEditMode?: RexExecuteEditMode;
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
  /** Actions Maestro added, fully built with their parent set. */
  newActions: Action[];
  /** Actions Maestro deleted. */
  deletedActionUuids: string[];
  rexes: RexStage[];
  rexEventInfo: RexEventInfoStage[];
}
