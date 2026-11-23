/**
 * Standalone JSON-schema validation for history store Mission documents.
 */
import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import fs from "fs";
import path from "node:path";
import type { ErrorObject } from "ajv";
import { serverLogger } from "utils/logging/serverLogger";
import { isValidDocumentId } from "historyStore/util";
import { createToolHistoryRepo } from "server/historyStore/tools/createToolHistoryRepo";

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

const { repo: historyRepo } = createToolHistoryRepo();

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
      logId:
        "automerge-schema-validate:missionSchemaValidatorRunner:startingMissionSchemaValidation",
      logValue: "Starting history store mission schema validation...",
    });

    const allDocListings: AutomergeDocListing[] = await getAutomergeDocListing();
    const failures: MissionValidationFailure[] = [];
    const unreadable: { missionId: number; automergeUrl: string; reason: string }[] = [];
    let validCount = 0;

    for (const docListing of allDocListings) {
      if (!isValidDocumentId(docListing.automergeUrl)) {
        unreadable.push({
          missionId: docListing.missionId,
          automergeUrl: docListing.automergeUrl,
          reason: "Invalid document id in doc listing",
        });
        serverLogger.error(
          {
            logId:
              "automerge-schema-validate:missionSchemaValidatorRunner:invalidAutomergeUrlInDocListing",
            logValue: `Mission ${docListing.missionId}: invalid document id ${docListing.automergeUrl}`,
          },
          new Error(`Invalid document id for mission ${docListing.missionId}`)
        );
        continue;
      }

      let doc: Mission | undefined;
      try {
        const docHandle = await historyRepo.find<Mission>(docListing.automergeUrl);
        doc = docHandle.doc();
        await historyRepo.removeFromCache(docHandle.documentId);
      } catch (err: unknown) {
        doc = undefined;
        unreadable.push({
          missionId: docListing.missionId,
          automergeUrl: docListing.automergeUrl,
          reason: err instanceof Error ? err.message : String(err),
        });
        serverLogger.error(
          {
            logId:
              "automerge-schema-validate:missionSchemaValidatorRunner:failedToLoadAutomergeDocument",
            logValue: `Mission ${docListing.missionId}: failed to load history document`,
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
            logId:
              "automerge-schema-validate:missionSchemaValidatorRunner:automergeDocumentIsUndefined",
            logValue: `Mission ${docListing.missionId}: history document is undefined`,
          },
          new Error(`History document undefined for mission ${docListing.missionId}`)
        );
        continue;
      }

      // structuredClone instead of cloneDeep so no extra dependency is pulled into
      // the esbuild bundle. Gives AJV a mutable copy of the frozen confirmed state.
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
          logId:
            "automerge-schema-validate:missionSchemaValidatorRunner:missionFailedSchemaValidation",
          logValue: `Mission ${doc.id} - ${doc.name} is invalid (${violations.length} violation(s))`,
        },
        new Error(`Mission ${doc.id} - ${doc.name} failed schema validation`)
      );
    }

    // Write the JSON report even when validation is successful
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
      logId:
        "automerge-schema-validate:missionSchemaValidatorRunner:schemaValidationCompleteWithReportPath",
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
      {
        logId:
          "automerge-schema-validate:missionSchemaValidatorRunner:unhandledErrorInSchemaValidation",
        logValue: "Unhandled error in schema validation",
      },
      err instanceof Error ? err : new Error(String(err))
    );
    process.exitCode = 1;
    process.exit();
  });
