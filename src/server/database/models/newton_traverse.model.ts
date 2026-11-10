import { defineEntity, p } from "@mikro-orm/postgresql";
import { Doc_Listing_db } from "./doc_listing.model";

// One row per distinct Newton request, shared by every mission and caller.
export const Newton_Traverse_dbSchema = defineEntity({
  name: "Newton_Traverse_db",
  properties: {
    uuid: p.uuid().primary(),
    /** SHA-256 of AEGIS's canonical request. Not Newton's `request_hash`. */
    requestKey: p.text().fieldName("request_key").unique("newton_traverse_db_request_key_unique"),
    request: p.json<Newton.TraverseProblem>(),
    status: p.text().$type<NewtonTraverseStatus>().index("newton_traverse_db_status_index"),
    newtonTraverseId: p.text().fieldName("newton_traverse_id").nullable(),
    requestHash: p.text().fieldName("request_hash").nullable(),
    /** Newton joined an identical running job. Never cancel such a job. */
    deduplicated: p.boolean().default(false),
    effectiveProblem: p.json<Record<string, unknown>>().fieldName("effective_problem").nullable(),
    rawPath: p.json<Newton.LineString>().fieldName("raw_path").nullable().lazy(),
    rawVertexCount: p.integer().fieldName("raw_vertex_count").nullable(),
    path: p.json<AEGISPoint[]>().nullable(),
    segmentDistances: p.json<number[]>().fieldName("segment_distances").nullable(),
    mapInfo: p.json<Newton.MapInfo[]>().fieldName("map_info").nullable(),
    runtimeMs: p.integer().fieldName("runtime_ms").nullable(),
    error: p.json<NewtonTraverseError>().nullable(),
    /** Fingerprint of Newton's maps for the planet when the row was submitted. */
    mapsFingerprint: p.text().fieldName("maps_fingerprint").nullable(),
    submitAttempts: p.integer().fieldName("submit_attempts").default(0),
    nextSubmitAt: p.datetime(3).fieldName("next_submit_at").nullable(),
    submittedAt: p.datetime(3).fieldName("submitted_at").nullable(),
    lastPolledAt: p.datetime(3).fieldName("last_polled_at").nullable(),
    /** The last time a client asked for this row. Queued rows nobody asks for aren't submitted. */
    lastRequestedAt: p.datetime(3).fieldName("last_requested_at").nullable(),
    finishedAt: p.datetime(3).fieldName("finished_at").nullable(),
    /** Who first asked, for stats only. */
    firstUsername: p.text().fieldName("first_username").nullable(),
    firstMissionId: p
      .manyToOne(Doc_Listing_db)
      .mapToPk()
      .fieldName("first_mission_id")
      .nullable()
      .updateRule("cascade")
      .deleteRule("set null"),
    createdAt: p.datetime(3).fieldName("created_at"),
    updatedAt: p.datetime(3).fieldName("updated_at"),
  },
});

export class Newton_Traverse_db extends Newton_Traverse_dbSchema.class {}
Newton_Traverse_dbSchema.setClass(Newton_Traverse_db);
