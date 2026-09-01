/**
 * schemaValidate.ts
 *
 * Standalone JSON-schema validation for Automerge Mission documents.
 * Connects to the Automerge Postgres storage, reads every mission doc, validates
 * each one against the generated Mission schema, writes a JSON report to
 * .local/schema-validation-report-<timestamp>.json, and exits non-zero if any
 * mission failed validation.
 *
 * Unlike the validation pass inside the migration script, this runner never stops
 * early: every mission is checked and every failure is collected into the report.
 * It does NOT run migrations or modify any document.
 *
 * Build: npm run automerge:validate:build
 * Run:   npm run automerge:validate:run
 * Full:  npm run automerge:validate
 */
import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import fs from "fs";
import path from "node:path";
import { isValidAutomergeUrl, Repo } from "@automerge/automerge-repo/slim";
import type { DocHandle, StorageAdapterInterface } from "@automerge/automerge-repo/slim";
import type { ErrorObject } from "ajv";
import { PostgresStorageAdapter } from "server/automerge/automerge-repo-storage-postgres";
import pg from "pg";
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64.js";
import { initializeBase64Wasm } from "@automerge/automerge/slim";
import { serverLogger } from "utils/logging/serverLogger";

import { getAutomergeDocListing } from "server/express/routes/docListing";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { missionValidator } from "utils/validateSchemaServer";

/** A single schema violation, trimmed down from the raw AJV error. */
type SchemaViolation = {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
  params: Record<string, unknown>;
};

/** Every violation found on one mission document. */
type MissionValidationFailure = {
  missionId: number;
  missionName: string;
  automergeUrl: string;
  violationCount: number;
  violations: SchemaViolation[];
};

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

/**
 * The AJV instance is configured with `verbose: true`, which attaches the offending
 * `data` plus the `schema`/`parentSchema` to every error. Those payloads can be an
 * entire mission subtree per violation, which would make the artifact unusable.
 * Keep only the fields needed to locate and understand the violation.
 */
const toSchemaViolation = (error: ErrorObject): SchemaViolation => ({
  instancePath: error.instancePath,
  schemaPath: error.schemaPath,
  keyword: error.keyword,
  message: error.message ?? "",
  params: error.params ?? {},
});

getORM()
  .then(async () => {
    serverLogger.info({
      logId: "automerge-schema-validate",
      logValue: "Starting Automerge mission schema validation...",
    });

    const allDocListings: AutomergeDocListing[] = await getAutomergeDocListing();
    const failures: MissionValidationFailure[] = [];
    const unreadable: { missionId: number; automergeUrl: string; reason: string }[] = [];
    let validCount = 0;

    // Every mission is checked. Nothing short-circuits: a bad doc is recorded and the
    // loop continues so a single failure can't hide the ones behind it.
    for (const docListing of allDocListings) {
      if (!isValidAutomergeUrl(docListing.automergeUrl)) {
        unreadable.push({
          missionId: docListing.missionId,
          automergeUrl: docListing.automergeUrl,
          reason: "Invalid automerge URL in doc listing",
        });
        serverLogger.error(
          {
            logId: "automerge-schema-validate",
            logValue: `Mission ${docListing.missionId}: invalid automerge URL ${docListing.automergeUrl}`,
          },
          new Error(`Invalid automerge URL for mission ${docListing.missionId}`)
        );
        continue;
      }

      let doc: Mission | undefined;
      try {
        const docHandle: DocHandle<Mission> = await automergeRepo.find(docListing.automergeUrl);
        await docHandle.whenReady();
        doc = docHandle.doc();
      } catch (err: unknown) {
        doc = undefined;
        unreadable.push({
          missionId: docListing.missionId,
          automergeUrl: docListing.automergeUrl,
          reason: err instanceof Error ? err.message : String(err),
        });
        serverLogger.error(
          {
            logId: "automerge-schema-validate",
            logValue: `Mission ${docListing.missionId}: failed to load automerge doc`,
          },
          err instanceof Error ? err : new Error(String(err))
        );
        continue;
      }

      if (!doc) {
        unreadable.push({
          missionId: docListing.missionId,
          automergeUrl: docListing.automergeUrl,
          reason: "Document loaded as undefined",
        });
        serverLogger.error(
          {
            logId: "automerge-schema-validate",
            logValue: `Mission ${docListing.missionId}: automerge doc is undefined`,
          },
          new Error(`Automerge doc undefined for mission ${docListing.missionId}`)
        );
        continue;
      }

      // structuredClone instead of cloneDeep so no extra dependency is pulled into
      // the esbuild bundle. Detaches the doc from the Automerge proxy before AJV walks it.
      const isValid = missionValidator(structuredClone(doc));

      if (isValid) {
        validCount += 1;
        continue;
      }

      const violations = (missionValidator.errors ?? []).map(toSchemaViolation);
      failures.push({
        missionId: doc.id,
        missionName: doc.name,
        automergeUrl: docListing.automergeUrl,
        violationCount: violations.length,
        violations,
      });
      serverLogger.error(
        {
          logId: "automerge-schema-validate",
          logValue: `Mission ${doc.id} - ${doc.name} is invalid (${violations.length} violation(s))`,
        },
        new Error(`Mission ${doc.id} - ${doc.name} failed schema validation`)
      );
    }

    // Write the JSON report even when everything passed, so the artifact is always
    // present and a clean run is distinguishable from a run that never produced output.
    const reportDir = path.resolve(".local");
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(reportDir, `schema-validation-report-${reportTimestamp}.json`);
    const report = {
      generatedAt: new Date().toISOString(),
      missionsChecked: allDocListings.length,
      missionsValid: validCount,
      missionsInvalid: failures.length,
      missionsUnreadable: unreadable.length,
      totalViolations: failures.reduce((sum, failure) => sum + failure.violationCount, 0),
      unreadable,
      failures,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    serverLogger.info({
      logId: "automerge-schema-validate",
      logValue:
        `Schema validation complete. ${validCount} valid, ${failures.length} invalid, ` +
        `${unreadable.length} unreadable of ${allDocListings.length} mission(s). ` +
        `Report: ${reportPath}`,
    });

    // Fail the run if any mission was invalid or could not be read at all.
    process.exitCode = failures.length > 0 || unreadable.length > 0 ? 1 : 0;
    process.exit();
  })
  .catch((err: unknown) => {
    serverLogger.error(
      { logId: "automerge-schema-validate", logValue: "Unhandled error in schema validation" },
      err instanceof Error ? err : new Error(String(err))
    );
    process.exitCode = 1;
    process.exit();
  });
