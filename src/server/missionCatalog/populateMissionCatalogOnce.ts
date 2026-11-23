import type { ServerHistoryRepo } from "server/historyStore/ServerHistoryRepo";
import { getUnindexedMissionListings, createMissionSummary } from "./missionCatalog";
import { serverLogger } from "utils/logging/serverLogger";

// TEMPORARY: remove this function and its startup call in the next MR after catalog rollout.
export async function populateMissionCatalogOnce(repo: ServerHistoryRepo, missionIds?: number[]): Promise<void> {
  const pending = (await getUnindexedMissionListings()).filter(
    (listing) => !missionIds || missionIds.includes(listing.missionId)
  );
  if (!pending.length) return;

  const started = Date.now();
  serverLogger.info({
    logId: "mission-catalog:populateMissionCatalogOnce:startingSequentialMissionSummaryPopulation",
    logValue: `Populating ${pending.length} mission summaries sequentially`,
  });
  for (const listing of pending) {
    const handle = await repo.find<Mission>(listing.automergeUrl as HistoryDocumentId);
    await createMissionSummary(repo, handle, undefined, true);
    await repo.removeFromCache(handle.documentId);
  }
  serverLogger.info({
    logId: "mission-catalog:populateMissionCatalogOnce:initialCatalogPopulationComplete",
    logValue: "Initial catalog population complete",
    missions: pending.length,
    durationMs: Date.now() - started,
  });
}
