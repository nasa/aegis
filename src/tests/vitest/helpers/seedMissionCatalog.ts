import type { AutomergeUrl } from "@automerge/automerge-repo/slim";
import { globalValues } from "server/express/global";
import { createMissionSummary } from "server/automerge/missionCatalog";

/** Catalog fixtures are persisted explicitly; list endpoints must never fall back to doc loads. */
export async function seedMissionCatalog(listings: AutomergeDocListing[]): Promise<void> {
  for (const listing of listings) {
    const handle = await globalValues.automergeRepo.find<Mission>(
      listing.automergeUrl as AutomergeUrl
    );
    await createMissionSummary(globalValues.automergeRepo, handle);
  }
}
