import dotenv from "dotenv"; //needed to allow vitest to init Mikro in globalTeardown
dotenv.config({ override: true, quiet: true });

import { PostgreSqlDriver, defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { SeedManager } from "@mikro-orm/seeder";
import { allSchemas } from "./models/_allModels";
import path from "node:path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  dbName: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  driver: PostgreSqlDriver,
  password: process.env.DB_PASS,
  migrations: {
    path: path.join(__dirname, "./migrations"), // path to the folder with migrations
    snapshot: false,
  },
  seeder: {
    path: path.join(__dirname, "./seeds"), // path to the folder with seed files
  },
  entitiesTs: allSchemas,
  entities: allSchemas,
  debug: process.env.DEBUG === "true" || process.env.DEBUG?.includes("db"),
  extensions: [Migrator, SeedManager],
});
