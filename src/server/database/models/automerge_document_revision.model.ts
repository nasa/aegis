import { defineEntity, p } from "@mikro-orm/postgresql";

/**
 * Audit ledger of every Automerge document URL that has ever been assigned
 * to a mission, organised by database epoch.
 *
 * During a `restoreCutover` run a new row is inserted for each mission with
 * state `preparing`.  Once all documents are validated and the atomic swap
 * is committed the new rows become `active` and the previous ones become
 * `retired`.
 *
 * Key constraints:
 *  - Unique on `(database_epoch, mission_id)` — at most one revision per
 *    mission per epoch.
 *  - Unique on `(mission_id, revision_number)` — monotonically increasing
 *    revision counter per mission.
 *  - Partial unique on `mission_id WHERE state = 'active'` — exactly one
 *    active revision per mission at any point in time.
 *
 * `predecessorId` links each revision back to the row it replaced, forming
 * a per-mission linked list that supports historical tracing.
 */
export type AutomergeDocumentRevisionState = "preparing" | "active" | "retired" | "failed";

export const Automerge_Document_Revision_dbSchema = defineEntity({
  name: "Automerge_Document_Revision_db",
  tableName: "automerge_document_revision_db",
  properties: {
    id: p.bigint().autoincrement().primary(),
    databaseEpoch: p.uuid(),
    missionId: p.integer(),
    revisionNumber: p.integer(),
    automergeUrl: p.text().unique(),
    predecessorId: p.bigint().nullable(),
    state: p.enum(["preparing", "active", "retired", "failed"]),
    createdAt: p.datetime().onCreate(() => new Date()),
    validatedAt: p.datetime().nullable(),
    activatedAt: p.datetime().nullable(),
    retiredAt: p.datetime().nullable(),
  },
  uniques: [
    { properties: ["databaseEpoch", "missionId"] },
    { properties: ["missionId", "revisionNumber"] },
    { properties: ["missionId"], where: { state: "active" } },
  ],
});

export class Automerge_Document_Revision_db extends Automerge_Document_Revision_dbSchema.class {
  override predecessorId: bigint | null = null;
  override validatedAt: Date | null = null;
  override activatedAt: Date | null = null;
  override retiredAt: Date | null = null;
}

Automerge_Document_Revision_dbSchema.setClass(Automerge_Document_Revision_db);
