import type { AutomergeUrl, Repo } from "@automerge/automerge-repo/slim";
import { getUnindexedMissionListings, createMissionSummary } from "./missionCatalog";
import { releaseMissionDocument } from "./releaseMissionDocument";
import { serverLogger } from "utils/logging/serverLogger";

// TEMPORARY: remove this function and its startup call in the next MR after catalog rollout.
export async function populateMissionCatalogOnce(repo: Repo, missionIds?: number[]): Promise<void> {
  const pending = (await getUnindexedMissionListings()).filter(
    (listing) => !missionIds || missionIds.includes(listing.missionId)
  );
  if (!pending.length) return;

  const started = Date.now();
  serverLogger.info({
    logId: "mission-catalog",
    logValue: `Populating ${pending.length} mission summaries sequentially`,
  });
  for (const listing of pending) {
    const handle = await repo.find<Mission>(listing.automergeUrl as AutomergeUrl);
    await createMissionSummary(repo, handle, undefined, true);
    await releaseMissionDocument(repo, handle.documentId);
  }
  serverLogger.info({
    logId: "mission-catalog",
    logValue: "Initial catalog population complete",
    missions: pending.length,
    durationMs: Date.now() - started,
  });
}
