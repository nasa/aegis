type Rex = {
  missionId: number;
  uuid: string;
  ownerId: number;
  name: string;
  description: string;
  petStartStopTimestamp: string | null; // the timestamp the play/pause button was clicked
  petValueAtStartStop: string; // the value of the pet timer when the play/pause button was clicked in "+hh:mm:ss"
  petRunning: boolean; // whether the timer is currently running
  evaUuid: string;
  isRunning: boolean;
  posEntries: PosEntry[] | null;
  posTypes: PosType[];
  posSources: PosSource[];
  stationEntries: ActivityEntries | null;
  traverseEntries: ActivityEntries | null;
  actionEntries: ActionEntries | null;
  maestroControlled: boolean;
  maestroEventId: string | null;
  maestroEventUrl: string | null;
  maestroActivityProperties: MaestroActivityProperties | null;
  createdAt?: number;
  updatedAt?: number;
};

/**
 * A REX plus every legacy field that has been removed from `Rex` but still
 * exists as a `rex_db` column and on docs that predate the migration that
 * strips it.
 *
 * - `xgressEntries` — egress/ingress REX status from before egress/ingress
 *   became real stations. Now folded into `stationEntries` keyed by the real
 *   xgress station uuid.
 * - `maestroActivityPropertiesByRefUuid` — activity display properties from
 *   before Maestro addressed activities by AEGIS uuid. Now
 *   `maestroActivityProperties`, keyed by uuid.
 *
 * The Automerge migration script seeds these from the DB, converts them onto
 * their replacements, then deletes them.
 */
type RexWithLegacyFields = Rex & {
  xgressEntries?: { [role: string]: { rexStatus: RexStatus } } | null;
  maestroActivityPropertiesByRefUuid?: { [refUuid: string]: MaestroActivityProperty } | null;
};

/**
 * The derelict `rex_db` table never received the field renames, so it has the
 * legacy columns and none of their replacements.
 */
type Rex_db_type = Omit<
  RexWithLegacyFields,
  "createdAt" | "updatedAt" | "maestroActivityProperties"
> & {
  createdAt?: Date;
  updatedAt?: Date;
};

interface PosSource {
  uuid: string;
  name: string;
  abbr: string;
}

interface PosEntry {
  uuid: string;
  location: AEGISPoint;
  elevation: number | null;
  petSeconds: number;
  posTypeUuids: string[];
  posSourceUuid: string;
  createdAt: number;
  updatedAt: number;
}

interface PosType {
  uuid: string;
  abbr: string;
  name: string;
  icon: string;
  pathColor: string;
}

type RexStatus = "pending" | "in-progress" | "complete" | "skipped";
interface ActivityEntry {
  rexStatus: RexStatus;
  maestroPercentCompleteEv1?: number;
  maestroPercentCompleteEv2?: number;
}

interface ActivityEntries {
  [stationOrTraverseUuid: string]: ActivityEntry; // "activity" is Station or Traverse
}

interface MaestroActivityProperty {
  color?: string | null; // hex color for the activity
  number?: string | null; // string of the activity number in the maestro procedure
}

interface MaestroActivityProperties {
  [uuid: string]: MaestroActivityProperty;
}

interface ActionEntry {
  rexStatus: RexStatus | null;
  mass?: number | null;
  markerId?: string | null;
  containerId?: string | null;
  secondaryContainerId?: string | null;
}

interface ActionEntries {
  [actionUuid: string]: ActionEntry;
}
