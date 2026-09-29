import type { DocHandle } from "@automerge/automerge-repo/slim";
import type { MikroORM } from "@mikro-orm/postgresql";

export type AutomergeMigrationIdentity = {
  version: number;
  name: string;
};

export type AutomergeMigrationContext = {
  docListing: AutomergeDocListing;
  orm: MikroORM;
};

export type AutomergeMigration = AutomergeMigrationIdentity & {
  migrate: (docHandle: DocHandle<Mission>, context: AutomergeMigrationContext) => Promise<void>;
};
