/**
 * integrityCheck.ts
 *
 * Standalone FK integrity check for history store Mission documents.
 * Loads every listed mission doc from the history store (mission_history_db),
 * checks all intra-doc UUID references, writes a JSON report to
 * .local/integrity-report-<timestamp>.json, and exits.
 * Does NOT run migrations or modify any document.
 *
 * Build: npm run automerge:integrity:build
 * Run:   npm run automerge:integrity:run
 * Full:  npm run automerge:integrity
 */
import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });
import fs from "fs";
import path from "node:path";
import { serverLogger } from "utils/logging/serverLogger";
import { isValidDocumentId } from "historyStore/util";
import { createToolHistoryRepo } from "server/historyStore/tools/createToolHistoryRepo";

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

const { repo: historyRepo } = createToolHistoryRepo();

const getORM = async () => {
  globalValues.orm = await MikroORM.init(config);
};

getORM()
  .then(async () => {
    serverLogger.info({
      logId: "automerge-integrity:integrityCheckRunner:startingForeignKeyIntegrityCheck",
      logValue: "Starting FK integrity check...",
    });

    const allDocListings: AutomergeDocListing[] = await getAutomergeDocListing();
    const allFindings: IntegrityFinding[] = [];

    for (const docListing of allDocListings) {
      if (!isValidDocumentId(docListing.automergeUrl)) continue;

      const docHandle = await historyRepo.find<Mission>(docListing.automergeUrl);
      const doc = docHandle.doc();
      await historyRepo.removeFromCache(docHandle.documentId);

      if (!doc) {
        serverLogger.error(
          {
            logId: "automerge-integrity:integrityCheckRunner:couldNotLoadMissionDocument",
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
          logId: "automerge-integrity:integrityCheckRunner:orphanedForeignKeyFound",
          logValue:
            `Mission ${finding.missionId}: orphaned FK — ` +
            `${finding.entity}[${finding.entityUuid}].${finding.field} = "${finding.orphanedUuid}"`,
        });
      }

      if (findings.length > 0) {
        serverLogger.info({
          logId: "automerge-integrity:integrityCheckRunner:missionFindingCountSummary",
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
      logId: "automerge-integrity:integrityCheckRunner:integrityCheckCompleteWithReportPath",
      logValue:
        `Integrity check complete. ${allFindings.length} finding(s) across ` +
        `${allDocListings.length} mission(s). Report: ${reportPath}`,
    });

    process.exitCode = 0;
    process.exit();
  })
  .catch((err: unknown) => {
    serverLogger.error(
      {
        logId: "automerge-integrity:integrityCheckRunner:unhandledErrorInIntegrityCheckRunner",
        logValue: "Unhandled error in integrity check runner",
      },
      err instanceof Error ? err : new Error(String(err))
    );
    process.exitCode = 1;
    process.exit();
  });
