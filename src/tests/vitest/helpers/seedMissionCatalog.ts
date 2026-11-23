import { globalValues } from "server/express/global";
import { createMissionSummary } from "server/missionCatalog/missionCatalog";

/** Catalog fixtures are persisted explicitly; list endpoints must never fall back to doc loads. */
export async function seedMissionCatalog(listings: AutomergeDocListing[]): Promise<void> {
  for (const listing of listings) {
    const handle = await globalValues.historyRepo.find<Mission>(
      listing.automergeUrl as HistoryDocumentId
    );
    await createMissionSummary(globalValues.historyRepo, handle);
  }
}
