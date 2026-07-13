/**
 * integrityCheck.ts
 *
 * Standalone FK integrity check for Automerge Mission documents.
 * Connects to the Automerge Postgres storage, reads every mission doc,
 * checks all intra-doc UUID references, writes a JSON report to
 * .local/integrity-report-<timestamp>.json, and exits.
 * Does NOT run migrations or modify any document.
 *
 * Build: npm run automerge:integrity:build
 * Run:   npm run automerge:integrity
 * Full:  npm run test:automerge:integrity
 */
import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import fs from "fs";
import path from "node:path";
import { isValidAutomergeUrl, Repo } from "@automerge/automerge-repo/slim";
import type { DocHandle, StorageAdapterInterface } from "@automerge/automerge-repo/slim";
import { PostgresStorageAdapter } from "server/automerge/automerge-repo-storage-postgres";
import pg from "pg";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { initializeBase64Wasm } from "@automerge/automerge/slim";
import { serverLogger } from "utils/logging/serverLogger";

import { getAutomergeDocListing } from "server/express/routes/docListing";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import {
  checkMissionIntegrity,
  type IntegrityFinding,
} from "server/automerge/checkMissionIntegrity";
export type { IntegrityFinding };
export { checkMissionIntegrity };

// Required on the server: Vite handles WASM loading on the client.
initializeBase64Wasm(automergeWasmBase64);

const dbPool: pg.Pool = new pg.Pool({
  user: "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: 5432,
});
const storageAdapter: StorageAdapterInterface = new PostgresStorageAdapter(
  "automerge_native_db",
  dbPool
);
const automergeRepo = new Repo({ storage: storageAdapter });

const getORM = async () => {
  globalValues.orm = await MikroORM.init(config);
};

getORM()
  .then(async () => {
    serverLogger.info({
      logId: "automerge-integrity",
      logValue: "Starting FK integrity check...",
    });

    const allDocListings: AutomergeDocListing[] = await getAutomergeDocListing();
    const allFindings: IntegrityFinding[] = [];

    for (const docListing of allDocListings) {
      if (!isValidAutomergeUrl(docListing.automergeUrl)) continue;

      const docHandle: DocHandle<Mission> = await automergeRepo.find(docListing.automergeUrl);
      await docHandle.whenReady();
      const doc = docHandle.doc();

      if (!doc) {
        serverLogger.error(
          {
            logId: "automerge-integrity",
            logValue: `Could not load doc for mission ${docListing.missionId}`,
          },
          new Error(`Could not load doc for mission ${docListing.missionId}`)
        );
        continue;
      }

      const findings = checkMissionIntegrity(docListing.missionId, doc);

      for (const finding of findings) {
        allFindings.push(finding);
        serverLogger.warning({
          logId: "automerge-integrity",
          logValue:
            `Mission ${finding.missionId}: orphaned FK — ` +
            `${finding.entity}[${finding.entityUuid}].${finding.field} = "${finding.orphanedUuid}"`,
        });
      }

      if (findings.length > 0) {
        serverLogger.info({
          logId: "automerge-integrity",
          logValue: `Mission ${docListing.missionId} (${doc.name}): ${findings.length} finding(s)`,
        });
      }
    }

    // Write JSON report
    const reportDir = path.resolve(".local");
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(reportDir, `integrity-report-${reportTimestamp}.json`);
    const report = {
      generatedAt: new Date().toISOString(),
      totalFindings: allFindings.length,
      findings: allFindings,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    serverLogger.info({
      logId: "automerge-integrity",
      logValue:
        `Integrity check complete. ${allFindings.length} finding(s) across ` +
        `${allDocListings.length} mission(s). Report: ${reportPath}`,
    });

    process.exitCode = 0;
    process.exit();
  })
  .catch((err: unknown) => {
    serverLogger.error(
      { logId: "automerge-integrity", logValue: "Unhandled error in integrity check runner" },
      err instanceof Error ? err : new Error(String(err))
    );
    process.exitCode = 1;
    process.exit();
  });
