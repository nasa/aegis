import type { AutomergeUrl } from "@automerge/automerge-repo/slim";
import { globalValues } from "server/express/global";
import { projectMission } from "server/automerge/missionCatalog";

/** Catalog fixtures are persisted explicitly; list endpoints must never fall back to doc loads. */
export async function seedMissionCatalog(listings: AutomergeDocListing[]): Promise<void> {
  for (const listing of listings) {
    const handle = await globalValues.automergeRepo.find<Mission>(
      listing.automergeUrl as AutomergeUrl
    );
    await projectMission(globalValues.automergeRepo, handle);
  }
}
