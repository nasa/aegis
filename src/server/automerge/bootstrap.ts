import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });

import { initializeBase64Wasm } from "@automerge/automerge/slim";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { Repo } from "@automerge/automerge-repo/slim";
import type { StorageAdapterInterface } from "@automerge/automerge-repo/slim";
import { MikroORM } from "@mikro-orm/postgresql";
import pg from "pg";
import { PostgresStorageAdapter } from "server/automerge/automerge-repo-storage-postgres";
import { LegacyMissionDb } from "server/automerge/legacyMission.model";
import config from "server/database/mikro-orm.config";

initializeBase64Wasm(automergeWasmBase64);

const pool = new pg.Pool({
  user: "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: 5432,
});
const storage: StorageAdapterInterface = new PostgresStorageAdapter("automerge_native_db", pool);
const repo = new Repo({ storage });
const orm = await MikroORM.init({
  ...config,
  entities: [LegacyMissionDb],
  entitiesTs: [LegacyMissionDb],
  extensions: [],
});

try {
  const em = orm.em.fork();
  const connection = em.getConnection();
  const tableRows = (await connection.execute(
    `select to_regclass('public.mission_db') as "missionTable"`
  )) as { missionTable: string | null }[];

  if (!tableRows[0]?.missionTable) {
    console.log("Legacy mission_db is absent; Automerge document bootstrap is already complete");
  } else {
    const missions = await em.find(LegacyMissionDb, {});
    const listingRows = (await connection.execute(
      `select "mission_id" as "missionId" from "doc_listing_db"`
    )) as { missionId: number }[];
    const listedMissionIds = new Set(listingRows.map(({ missionId }) => missionId));
    let createdCount = 0;

    for (const legacyMission of missions) {
      if (listedMissionIds.has(legacyMission.id)) continue;

      const { version: _version, ...missionFields } = legacyMission;
      const handle = repo.create<Mission>(missionFields as unknown as Mission);
      await connection.execute(
        `insert into "doc_listing_db" ("mission_id", "automerge_url", "version") values (?, ?, 1)`,
        [legacyMission.id, handle.url]
      );
      createdCount += 1;
    }

    await repo.flush();
    console.log(`Created ${createdCount} missing Automerge document(s) from mission_db`);
  }
} finally {
  await orm.close(true);
  await pool.end();
}
