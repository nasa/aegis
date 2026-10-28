import type { DocHandle, Repo } from "@automerge/automerge-repo/slim";
import { LockMode } from "@mikro-orm/postgresql";
import type { EntityManager } from "@mikro-orm/postgresql";
import isEqual from "lodash/isEqual";
import {
  Doc_Listing_db,
  Mission_Catalog_db,
  Mission_Eva_Catalog_db,
} from "server/database/models/_allModels";
import { globalValues } from "server/express/global";

// Retain only the small indexed values, never an Automerge document. Newly created or loaded
// handles have no entry and are refreshed once; released handles can be garbage collected normally.
const indexedValues = new WeakMap<DocHandle<Mission>, string>();

function catalogKey(catalogEntry: ReturnType<typeof summarizeMission>): string {
  return JSON.stringify({
    summary: catalogEntry.summary,
    evas: [...catalogEntry.evas].sort((a, b) => a.evaUuid.localeCompare(b.evaUuid)),
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
  const rows = await em.find(
    Mission_Catalog_db,
    {
      ...(missionIds === undefined ? {} : { missionId: { $in: missionIds } }),
      ...(includeArchived ? {} : activeMissionFilter),
    },
    { fields: ["summary"] }
  );
  return rows
    .map(({ summary }) => summary)
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id);
}

const activeMissionFilter = {
  $or: [{ summary: { archivedAt: null } }, { summary: { archivedAt: 0 } }],
};

export async function getAsPlannedEvaSummaries(): Promise<(EvaSummary & { missionId: number })[]> {
  const em = globalValues.orm.em.fork();
  const activeMissions = em
    .createQueryBuilder(Mission_Catalog_db)
    .select("missionId")
    .where(activeMissionFilter);
  const rows = await em.find(
    Mission_Eva_Catalog_db,
    { isAsPlanned: true, missionId: { $in: activeMissions } },
    { orderBy: { missionId: "asc", evaUuid: "asc" } }
  );
  return rows.map(({ missionId, evaUuid, name, isAsPlanned }) => ({
    missionId,
    evaUuid,
    name,
    isAsPlanned,
  }));
}

export async function getMissionIdsForEva(evaUuid: string): Promise<number[]> {
  // Duplication can preserve entity UUIDs: retain ALL matching missions, including archives,
  // to preserve getRexesByEva's existing API semantics.
  const rows = await globalValues.orm.em
    .fork()
    .find(
      Mission_Eva_Catalog_db,
      { evaUuid },
      { fields: ["missionId"], orderBy: { missionId: "asc" } }
    );
  return rows.map(({ missionId }) => missionId);
}

export async function getUnindexedMissionListings(
  em = globalValues.orm.em.fork()
): Promise<AutomergeDocListing[]> {
  // The ORM-managed version is a revision counter, not a summary format version.
  const indexedMissions = em.createQueryBuilder(Mission_Catalog_db).select("missionId");
  return em.find(
    Doc_Listing_db,
    { missionId: { $nin: indexedMissions } },
    { fields: ["missionId", "automergeUrl"], orderBy: { missionId: "asc" } }
  );
}

/** Startup preloads only missions whose persisted catalog reports an active REX. */
export async function getRunningMissionListings(): Promise<AutomergeDocListing[]> {
  const em = globalValues.orm.em.fork();
  const runningMissions = em
    .createQueryBuilder(Mission_Catalog_db)
    .select("missionId")
    .where({ summary: { runningRex: { $ne: null } } });
  return em.find(
    Doc_Listing_db,
    { missionId: { $in: runningMissions } },
    { fields: ["missionId", "automergeUrl"], orderBy: { missionId: "asc" } }
  );
}

/**
 * Compare only the indexed fields in memory before doing any database work. The save
 * notification queues another check if more changes arrive during summary creation.
 * Returns true when a summary was written, false when no index work was needed.
 */
export async function createMissionSummary(
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
    const listings = await tx.find(
      Doc_Listing_db,
      { automergeUrl: handle.url },
      { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true }
    );
    if (!listings.length) return; // Deleted, or a newly created doc not yet registered.
    // Read after taking the listing lock so concurrent explicit and queued summary creation
    // cannot overwrite a newer summary with a previously captured document.
    const catalogEntry = summarizeMission(handle.doc());
    const key = catalogKey(catalogEntry);
    if (!force && indexedValues.get(handle) === key) return;

    // Capture the summary under the listing lock, then persist that document before
    // publishing it. Reading the handle after an await could include a later, unsaved edit
    // and incorrectly remember that edit as indexed. Its save notification will instead
    // queue a separate summary creation.
    await repo.flush([handle.documentId]);

    const missionIds = listings.map(({ missionId }) => missionId);
    const summaries = await tx.find(
      Mission_Catalog_db,
      { missionId: { $in: missionIds } },
      { refresh: true }
    );
    const evas = await tx.find(
      Mission_Eva_Catalog_db,
      { missionId: { $in: missionIds } },
      { refresh: true }
    );
    const evaUuids = new Set(catalogEntry.evas.map(({ evaUuid }) => evaUuid));
    tx.remove(evas.filter(({ evaUuid }) => !evaUuids.has(evaUuid)));

    for (const { missionId } of listings) {
      const summary = { ...catalogEntry.summary, id: missionId };
      const existing = summaries.find((entry) => entry.missionId === missionId);
      if (existing) {
        // PostgreSQL JSONB reorders object keys. Preserve the loaded object when only
        // key order differs so replacing it does not trigger a spurious version bump.
        if (!isEqual(existing.summary, summary)) existing.summary = summary;
      } else tx.create(Mission_Catalog_db, { missionId, summary });

      // Managed entities let the unit of work write only changed rows and check/increment
      // the summary version automatically. Unchanged EVA rows are not rewritten.
      for (const eva of catalogEntry.evas) {
        const existingEva = evas.find(
          (entry) => entry.missionId === missionId && entry.evaUuid === eva.evaUuid
        );
        if (existingEva) {
          existingEva.name = eva.name;
          existingEva.isAsPlanned = eva.isAsPlanned;
        } else {
          tx.create(Mission_Eva_Catalog_db, { missionId, ...eva });
        }
      }
    }
    return key;
  });
  if (writtenKey !== undefined && rememberValues) indexedValues.set(handle, writtenKey);
  return writtenKey !== undefined;
}
