import { defineEntity, p } from "@mikro-orm/postgresql";

/**
 * Singleton row (id = 1) that tracks the active database epoch and the
 * overall readiness of the Automerge document store.
 *
 * - `activeDatabaseEpoch` — UUID of the epoch whose documents are currently
 *   served by the API.  Matches the value in the DATABASE_EPOCH_FILE.
 * - `pendingDatabaseEpoch` — UUID of the epoch being prepared during an
 *   in-progress `restoreCutover` run.  `null` when no cutover is active.
 * - `state` — lifecycle state of the cutover process:
 *     - `ready`     — store is healthy; API may start.
 *     - `preparing` — cutover in progress; API must not start.
 *     - `failed`    — cutover aborted; manual intervention required.
 * - `reason` — human-readable explanation of the current state.
 * - `pipelineId` / `jobId` — CI identifiers recorded for traceability.
 */
export type AutomergeOperationalState = "ready" | "preparing" | "failed";

export const Automerge_Operational_State_dbSchema = defineEntity({
  name: "Automerge_Operational_State_db",
  tableName: "automerge_operational_state_db",
  properties: {
    id: p.integer().primary().default(1),
    activeDatabaseEpoch: p.uuid().nullable(),
    pendingDatabaseEpoch: p.uuid().nullable(),
    state: p.enum(["ready", "preparing", "failed"]).default("ready"),
    reason: p.text().nullable(),
    pipelineId: p.text().nullable(),
    jobId: p.text().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
  },
});

export class Automerge_Operational_State_db extends Automerge_Operational_State_dbSchema.class {
  override activeDatabaseEpoch: string | null = null;
  override pendingDatabaseEpoch: string | null = null;
  override reason: string | null = null;
  override pipelineId: string | null = null;
  override jobId: string | null = null;
}

Automerge_Operational_State_dbSchema.setClass(Automerge_Operational_State_db);
