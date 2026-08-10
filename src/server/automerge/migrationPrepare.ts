import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });

import path from "node:path";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";

const boundary = process.argv[2];

if (!boundary) {
  throw new Error("A migration boundary name is required");
}

const orm = await MikroORM.init({
  ...config,
  migrations: {
    ...config.migrations,
    path: path.resolve("src/server/database/migrations"),
  },
});

try {
  const pending = await orm.migrator.getPending();
  const migrations = pending
    .map(({ name }) => name)
    .filter((name) => name.localeCompare(boundary) < 0)
    .sort((left, right) => left.localeCompare(right));

  if (migrations.length === 0) {
    console.log(`No pending MikroORM migrations before ${boundary}`);
  } else {
    console.log(`Applying MikroORM migrations before ${boundary}: ${migrations.join(", ")}`);
    await orm.migrator.up({ migrations });
  }
} finally {
  await orm.close(true);
}
