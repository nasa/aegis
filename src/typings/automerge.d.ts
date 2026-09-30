type AutomergeDocListing = {
  missionId: number | null;
  automergeUrl: string;
};

type DocListing_db_type = AutomergeDocListing;

type DocHandle<T> = import("@automerge/automerge-repo").DocHandle<T>;
