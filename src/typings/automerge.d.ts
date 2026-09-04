type AutomergeDocListing = {
  missionId: number | null;
  automergeUrl: string;
};

/**
 * Response payload from `GET /api/v1/docListing/resolve`.
 *
 * Carries everything the client needs to safely open a mission's Automerge
 * document: the canonical URL (which may have changed after a restore
 * cutover), the mission ID for cross-validation, and the server's current
 * database epoch (used by the mutation gate and socket epoch checks).
 */
interface MissionResolution {
  missionId: number;
  automergeUrl: string;
  databaseEpoch: string;
}

type DocListing_db_type = AutomergeDocListing;

type DocHandle<T> = import("@automerge/automerge-repo").DocHandle<T>;
