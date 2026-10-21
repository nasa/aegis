import type { DocHandle, Repo } from "@automerge/automerge-repo/slim";
import type { EntityManager } from "@mikro-orm/postgresql";
import { globalValues } from "server/express/global";

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
  const em = globalValues.orm.em.fork();
  const rows = await em.execute<{ summary: MissionSummary }[]>(
    `select summary from mission_catalog_db
     where (? or mission_id = any(array[?]::int[]))
       and (? or coalesce((summary->>'archivedAt')::bigint, 0) = 0)
     order by lower(summary->>'name'), mission_id`,
    [missionIds === undefined, missionIds ?? [], includeArchived]
  );
  return rows.map(({ summary }) => summary);
}

export async function getAsPlannedEvaSummaries(): Promise<(EvaSummary & { missionId: number })[]> {
  return globalValues.orm.em.fork().execute(
    `select e.mission_id as "missionId", e.eva_uuid as "evaUuid", e.name,
            e.is_as_planned as "isAsPlanned"
     from mission_eva_catalog_db e join mission_catalog_db m using (mission_id)
     where e.is_as_planned and coalesce((m.summary->>'archivedAt')::bigint, 0) = 0
     order by e.mission_id, e.eva_uuid`
  );
}

export async function getMissionIdsForEva(evaUuid: string): Promise<number[]> {
  // Duplication can preserve entity UUIDs: retain ALL matching missions, including archives,
  // to preserve getRexesByEva's existing API semantics.
  const rows = await globalValues.orm.em.fork().execute<{ missionId: number }[]>(
    `select mission_id as "missionId" from mission_eva_catalog_db
     where eva_uuid = ? order by mission_id`,
    [evaUuid]
  );
  return rows.map(({ missionId }) => missionId);
}

export async function getPendingMissionListings(
  em = globalValues.orm.em.fork()
): Promise<AutomergeDocListing[]> {
  return em.execute<AutomergeDocListing[]>(
    `select d.mission_id as "missionId", d.automerge_url as "automergeUrl"
     from doc_listing_db d
     left join mission_catalog_db c using (mission_id)
     left join mission_catalog_pending_db p on d.automerge_url = 'automerge:' || p.document_id
     where c.mission_id is null or c.projection_version <> ? or p.document_id is not null
     order by d.mission_id`,
    [MISSION_CATALOG_VERSION]
  );
}

/**
 * Persist a summary and its EVA index together, then acknowledge exactly the storage generation
 * read before projection. A newer write leaves its durable marker in place for retry/restart.
 * Used by the single API repo; document migrations must run with the API stopped.
 */
export async function projectMission(
  repo: Repo,
  handle: DocHandle<Mission>,
  em: EntityManager = globalValues.orm.em.fork()
): Promise<boolean> {
  const pending = await em.execute<{ generation: string }[]>(
    "select generation::text from mission_catalog_pending_db where document_id = ?",
    [handle.documentId]
  );
  const generation = pending[0]?.generation;
  const doc = handle.doc();
  if (!doc) return false;
  const projected = summarizeMission(doc);

  // A catalog must never describe an edit which only exists in RAM. If this flush changes
  // the generation, the compare below rejects the projection and the caller retries.
  await repo.flush([handle.documentId]);

  return em.transactional(async (tx) => {
    const listings = await tx.execute<{ missionId: number }[]>(
      `select mission_id as "missionId" from doc_listing_db
       where automerge_url = ? for update`,
      [handle.url]
    );
    if (!listings.length) return true; // Deleted, or a newly created doc not yet registered.
    const current = await tx.execute<{ generation: string }[]>(
      "select generation::text from mission_catalog_pending_db where document_id = ? for update",
      [handle.documentId]
    );
    if (current[0]?.generation !== generation) return false;

    for (const { missionId } of listings) {
      const summary = { ...projected.summary, id: missionId };
      await tx.execute(
        `insert into mission_catalog_db(mission_id, summary, projection_version) values (?, ?::jsonb, ?)
         on conflict (mission_id) do update set summary = excluded.summary,
           projection_version = excluded.projection_version
         where mission_catalog_db.summary is distinct from excluded.summary
            or mission_catalog_db.projection_version <> excluded.projection_version`,
        [missionId, JSON.stringify(summary), MISSION_CATALOG_VERSION]
      );
      // Synchronize only changed EVA rows. High-frequency position changes should not rewrite
      // an otherwise unchanged EVA index.
      await tx.execute(
        `delete from mission_eva_catalog_db where mission_id = ?
         and not (eva_uuid = any(array[?]::text[]))`,
        [missionId, projected.evas.map((eva) => eva.evaUuid)]
      );
      if (projected.evas.length) {
        await tx.execute(
          `insert into mission_eva_catalog_db(mission_id, eva_uuid, name, is_as_planned)
           select ?, e."evaUuid", e.name, e."isAsPlanned"
           from jsonb_to_recordset(?::jsonb) as e("evaUuid" text, name text, "isAsPlanned" boolean)
           on conflict (mission_id, eva_uuid) do update set name = excluded.name,
             is_as_planned = excluded.is_as_planned
           where (mission_eva_catalog_db.name, mission_eva_catalog_db.is_as_planned)
             is distinct from (excluded.name, excluded.is_as_planned)`,
          [missionId, JSON.stringify(projected.evas)]
        );
      }
    }
    if (generation !== undefined) {
      await tx.execute(
        "delete from mission_catalog_pending_db where document_id = ? and generation = ?",
        [handle.documentId, generation]
      );
    }
    return true;
  });
}
