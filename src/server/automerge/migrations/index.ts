import { Migration20260416000000 } from "server/automerge/migrations/Migration20260416000000";
import { Migration20260528000000 } from "server/automerge/migrations/Migration20260528000000";
import { Migration20260717000000 } from "server/automerge/migrations/Migration20260717000000";
import { Migration20260722000000 } from "server/automerge/migrations/Migration20260722000000";
import { Migration20260807000000 } from "server/automerge/migrations/Migration20260807000000";
import { Migration20260809000000 } from "server/automerge/migrations/Migration20260809000000";
import { Migration20260810000000 } from "server/automerge/migrations/Migration20260810000000";
import type {
  AutomergeMigration,
  AutomergeMigrationIdentity,
} from "server/automerge/migrations/types";

export const AUTOMERGE_MIGRATIONS: readonly AutomergeMigration[] = [
  Migration20260416000000,
  Migration20260528000000,
  Migration20260717000000,
  Migration20260722000000,
  Migration20260807000000,
  Migration20260809000000,
  Migration20260810000000,
];

export const getPendingAutomergeMigrations = (
  registered: readonly AutomergeMigration[],
  completed: readonly AutomergeMigrationIdentity[]
): AutomergeMigration[] => {
  for (let index = 0; index < registered.length; index += 1) {
    const migration = registered[index];
    const previous = registered[index - 1];
    if (previous && migration.version <= previous.version) {
      throw new Error("Automerge migrations must have unique, ascending versions");
    }
  }

  const registeredByVersion = new Map(
    registered.map((migration) => [migration.version, migration.name])
  );
  const completedByVersion = new Map<number, string>();

  for (const migration of completed) {
    const registeredName = registeredByVersion.get(migration.version);
    if (registeredName === undefined) {
      throw new Error(
        `Database contains unknown automerge migration ${migration.version}-${migration.name}`
      );
    }
    if (registeredName !== migration.name) {
      throw new Error(
        `Automerge migration version ${migration.version} was recorded as "${migration.name}", not "${registeredName}"`
      );
    }
    completedByVersion.set(migration.version, migration.name);
  }

  return registered.filter(({ version }) => !completedByVersion.has(version));
};
