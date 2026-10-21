import type { DocHandle, Repo } from "@automerge/automerge-repo/slim";
import type { EntityManager } from "@mikro-orm/postgresql";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";

export const MISSION_CATALOG_VERSION = 1;

export type EvaSummary = {
  evaUuid: string;
  name: string;
  isAsPlanned: boolean;
};

/** Read only the fields used by discovery; never clone/serialize the whole mission. */
export function summarizeMission(
  mission: Mission,
  missionId = mission.id
): {
  summary: MissionSummary;
  evas: EvaSummary[];
} {
  const rexes = Object.values(mission.rexes ?? {});
  const running = rexes.find((rex) => rex.isRunning);
  const rexEvaUuids = new Set(rexes.map((rex) => rex.evaUuid));
  const summary: MissionSummary = {
    id: missionId,
    name: mission.name,
    archivedAt: mission.archivedAt ?? null,
    actionSystemVersion: mission.actionSystemVersion,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    runningRex: running
      ? {
          uuid: running.uuid,
          name: running.name,
          petRunning: running.petRunning,
          petStartStopTimestamp: running.petStartStopTimestamp,
          petValueAtStartStop: running.petValueAtStartStop,
        }
      : null,
  };
  const evas: EvaSummary[] = Object.values(mission.evas ?? {}).map((eva) => ({
    evaUuid: eva.uuid,
    name: eva.name,
    isAsPlanned: !rexEvaUuids.has(eva.uuid),
  }));
  return { summary, evas };
}

export async function getMissionSummaries(
  missionIds?: number[],
  includeArchived = false
): Promise<MissionSummary[]> {
  const started = Date.now();
  const em = globalValues.orm.em.fork();
  const rows = await em.execute<{ summary: MissionSummary }[]>(
    `select summary from mission_catalog_db
     where (? or mission_id = any(array[?]::int[]))
       and (? or coalesce((summary->>'archivedAt')::bigint, 0) = 0)
     order by lower(summary->>'name'), mission_id`,
    [missionIds === undefined, missionIds ?? [], includeArchived]
  );
  serverLogger.debug({
    logId: "mission-catalog",
    logValue: "Mission summaries read from SQL",
    requestedMissions: missionIds?.length,
    allMissions: missionIds === undefined,
    includeArchived,
    results: rows.length,
    durationMs: Date.now() - started,
  });
  return rows.map(({ summary }) => summary);
}

export async function getAsPlannedEvaSummaries(): Promise<(EvaSummary & { missionId: number })[]> {
  const started = Date.now();
  const rows = await globalValues.orm.em.fork().execute<(EvaSummary & { missionId: number })[]>(
    `select e.mission_id as "missionId", e.eva_uuid as "evaUuid", e.name,
            e.is_as_planned as "isAsPlanned"
     from mission_eva_catalog_db e join mission_catalog_db m using (mission_id)
     where e.is_as_planned and coalesce((m.summary->>'archivedAt')::bigint, 0) = 0
     order by e.mission_id, e.eva_uuid`
  );
  serverLogger.debug({
    logId: "mission-catalog",
    logValue: "As-planned EVA summaries read from SQL",
    results: rows.length,
    durationMs: Date.now() - started,
  });
  return rows;
}

export async function getMissionIdsForEva(evaUuid: string): Promise<number[]> {
  const started = Date.now();
  // Duplication can preserve entity UUIDs: retain ALL matching missions, including archives,
  // to preserve getRexesByEva's existing API semantics.
  const rows = await globalValues.orm.em.fork().execute<{ missionId: number }[]>(
    `select mission_id as "missionId" from mission_eva_catalog_db
     where eva_uuid = ? order by mission_id`,
    [evaUuid]
  );
  serverLogger[rows.length > 1 ? "notice" : "debug"]({
    logId: "mission-catalog",
    logValue: "EVA mission lookup completed",
    evaUuid,
    matchingMissions: rows.length,
    missionIds: rows.map(({ missionId }) => missionId),
    duplicateEvaUuid: rows.length > 1,
    durationMs: Date.now() - started,
  });
  return rows.map(({ missionId }) => missionId);
}

export async function getUnindexedMissionListings(
  em = globalValues.orm.em.fork()
): Promise<AutomergeDocListing[]> {
  return em.execute<AutomergeDocListing[]>(
    `select d.mission_id as "missionId", d.automerge_url as "automergeUrl"
     from doc_listing_db d
     left join mission_catalog_db c using (mission_id)
     where c.mission_id is null or c.projection_version <> ?
     order by d.mission_id`,
    [MISSION_CATALOG_VERSION]
  );
}

/**
 * Update the mission summary and EVA rows together. Updates use the current resident document;
 * the save notification queues another pass if more changes arrive during projection.
 */
export async function projectMission(
  repo: Repo,
  handle: DocHandle<Mission>,
  em: EntityManager = globalValues.orm.em.fork()
): Promise<void> {
  const started = Date.now();
  let phase = "flush";
  let flushMs = 0;
  let missionIds: number[] = [];
  let summaryRowsChanged = 0;
  let evaRowsDeleted = 0;
  let evaRowsChanged = 0;
  let evaCount = 0;
  serverLogger.debug({
    logId: "mission-catalog",
    logValue: "Mission projection started",
    documentId: handle.documentId,
    projectionVersion: MISSION_CATALOG_VERSION,
  });
  try {
    await repo.flush([handle.documentId]);
    flushMs = Date.now() - started;
    phase = "transaction";

    await em.transactional(async (tx) => {
      const listings = await tx.execute<{ missionId: number }[]>(
        `select mission_id as "missionId" from doc_listing_db
       where automerge_url = ? for update`,
        [handle.url]
      );
      missionIds = listings.map(({ missionId }) => missionId);
      if (!listings.length) return; // Deleted, or a newly created doc not yet registered.
      // Read after taking the listing lock so concurrent explicit and queued projections
      // cannot overwrite a newer summary with a previously captured document.
      const projected = summarizeMission(handle.doc());
      evaCount = projected.evas.length;

      for (const { missionId } of listings) {
        const summary = { ...projected.summary, id: missionId };
        const changedSummaries = await tx.execute<{ mission_id: number }[]>(
          `insert into mission_catalog_db(mission_id, summary, projection_version) values (?, ?::jsonb, ?)
         on conflict (mission_id) do update set summary = excluded.summary,
           projection_version = excluded.projection_version
         where mission_catalog_db.summary is distinct from excluded.summary
            or mission_catalog_db.projection_version <> excluded.projection_version
         returning mission_id`,
          [missionId, JSON.stringify(summary), MISSION_CATALOG_VERSION]
        );
        summaryRowsChanged += changedSummaries.length;
        // Synchronize only changed EVA rows. High-frequency position changes should not rewrite
        // an otherwise unchanged EVA index.
        const deletedEvas = await tx.execute<{ eva_uuid: string }[]>(
          `delete from mission_eva_catalog_db where mission_id = ?
         and not (eva_uuid = any(array[?]::text[])) returning eva_uuid`,
          [missionId, projected.evas.map((eva) => eva.evaUuid)]
        );
        evaRowsDeleted += deletedEvas.length;
        if (projected.evas.length) {
          const changedEvas = await tx.execute<{ eva_uuid: string }[]>(
            `insert into mission_eva_catalog_db(mission_id, eva_uuid, name, is_as_planned)
           select ?, e."evaUuid", e.name, e."isAsPlanned"
           from jsonb_to_recordset(?::jsonb) as e("evaUuid" text, name text, "isAsPlanned" boolean)
           on conflict (mission_id, eva_uuid) do update set name = excluded.name,
             is_as_planned = excluded.is_as_planned
           where (mission_eva_catalog_db.name, mission_eva_catalog_db.is_as_planned)
             is distinct from (excluded.name, excluded.is_as_planned) returning eva_uuid`,
            [missionId, JSON.stringify(projected.evas)]
          );
          evaRowsChanged += changedEvas.length;
        }
      }
    });
    const durationMs = Date.now() - started;
    serverLogger[durationMs >= 1000 ? "warning" : "debug"]({
      logId: "mission-catalog",
      logValue: missionIds.length
        ? "Mission projection completed"
        : "Mission projection skipped; no document listing",
      documentId: handle.documentId,
      missionIds,
      durationMs,
      flushMs,
      transactionMs: durationMs - flushMs,
      summaryRowsChanged,
      evaRowsChanged,
      evaRowsDeleted,
      evaCount,
    });
  } catch (error) {
    serverLogger.error(
      {
        logId: "mission-catalog",
        logValue: "Mission projection failed",
        documentId: handle.documentId,
        missionIds,
        phase,
        durationMs: Date.now() - started,
        flushMs,
      },
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
}
