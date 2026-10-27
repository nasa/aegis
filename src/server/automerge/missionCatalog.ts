import type { DocHandle, Repo } from "@automerge/automerge-repo/slim";
import type { EntityManager } from "@mikro-orm/postgresql";
import { globalValues } from "server/express/global";

export const MISSION_CATALOG_VERSION = 1;

// Retain only the small indexed values, never an Automerge document. Newly created or loaded
// handles have no entry and are refreshed once; released handles can be garbage collected normally.
const indexedValues = new WeakMap<DocHandle<Mission>, string>();

function catalogKey(projected: ReturnType<typeof summarizeMission>): string {
  return JSON.stringify({
    summary: projected.summary,
    evas: [...projected.evas].sort((a, b) => a.evaUuid.localeCompare(b.evaUuid)),
  });
}

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

/** Startup preloads only missions whose persisted catalog reports an active REX. */
export async function getRunningMissionListings(): Promise<AutomergeDocListing[]> {
  return globalValues.orm.em.fork().execute<AutomergeDocListing[]>(
    `select d.mission_id as "missionId", d.automerge_url as "automergeUrl"
     from doc_listing_db d join mission_catalog_db c using (mission_id)
     where c.summary->>'runningRex' is not null
     order by d.mission_id`
  );
}

/**
 * Compare only the indexed fields in memory before doing any database work. The save
 * notification queues another check if more changes arrive during projection.
 * Returns true when a projection was written, false when no index work was needed.
 */
export async function projectMission(
  repo: Repo,
  handle: DocHandle<Mission>,
  em?: EntityManager,
  force = false
): Promise<boolean> {
  if (!force && indexedValues.get(handle) === catalogKey(summarizeMission(handle.doc()))) {
    return false;
  }
  em ??= globalValues.orm.em.fork();
  // A caller-owned transaction (mission duplication) can still roll back after we return.
  // Only remember values once this function owns and completes the outer transaction.
  const rememberValues = !em.isInTransaction();

  const writtenKey = await em.transactional(async (tx) => {
    const listings = await tx.execute<{ missionId: number }[]>(
      `select mission_id as "missionId" from doc_listing_db
       where automerge_url = ? for update`,
      [handle.url]
    );
    if (!listings.length) return; // Deleted, or a newly created doc not yet registered.
    // Read after taking the listing lock so concurrent explicit and queued projections
    // cannot overwrite a newer summary with a previously captured document.
    const projected = summarizeMission(handle.doc());
    const key = catalogKey(projected);
    if (!force && indexedValues.get(handle) === key) return;

    // Capture the summary under the listing lock, then persist that document before
    // publishing it. Reading the handle after an await could include a later, unsaved edit
    // and incorrectly remember that edit as indexed. Its save notification will instead
    // queue a separate projection.
    await repo.flush([handle.documentId]);

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
    return key;
  });
  if (writtenKey !== undefined && rememberValues) indexedValues.set(handle, writtenKey);
  return writtenKey !== undefined;
}
