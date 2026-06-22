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
import path from "path";
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

type IntegrityFinding = {
  missionId: number;
  missionName: string;
  entity: string;
  entityUuid: string;
  field: string;
  orphanedUuid: string;
};

/**
 * Checks all intra-doc FK references in a Mission Automerge document.
 * Read-only — never logs or mutates the doc. Returns an array of findings.
 */
function checkMissionIntegrity(missionId: number, doc: Mission): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  const log = (field: string, orphanUuid: string, ownerEntity: string, ownerUuid: string) => {
    findings.push({
      missionId,
      missionName: doc.name,
      entity: ownerEntity,
      entityUuid: ownerUuid,
      field,
      orphanedUuid: orphanUuid,
    });
  };

  const actionUuids = new Set(Object.keys(doc.actions ?? {}));
  const stationUuids = new Set(Object.keys(doc.stations ?? {}));
  const traverseUuids = new Set(Object.keys(doc.traverses ?? {}));
  const poiUuids = new Set(Object.keys(doc.pois ?? {}));
  const evaUuids = new Set(Object.keys(doc.evas ?? {}));

  // Mission-level dictionaries — used by Action references
  const equipmentItemUuids = new Set(Object.keys(doc.equipmentItems ?? {}));
  const geographicUnitUuids = new Set(Object.keys(doc.geographicUnits ?? {}));
  const verbUuids = new Set(Object.keys(doc.actionDefinitions?.verbs ?? {}));
  const nounUuids = new Set(Object.keys(doc.actionDefinitions?.nouns ?? {}));
  const adjectiveUuids = new Set(Object.keys(doc.actionDefinitions?.adjectives ?? {}));

  // ── POIs ───────────────────────────────────────────────────────────────────
  for (const poi of Object.values(doc.pois ?? {})) {
    for (const uuid of poi.actionOrderUuids ?? []) {
      if (!actionUuids.has(uuid)) log("actionOrderUuids", uuid, "POI", poi.uuid);
    }
  }

  // ── Stations ───────────────────────────────────────────────────────────────
  for (const station of Object.values(doc.stations ?? {})) {
    for (const uuid of station.actionOrderUuids ?? []) {
      if (!actionUuids.has(uuid)) log("actionOrderUuids", uuid, "Station", station.uuid);
    }
    for (const uuid of station.poiUuids ?? []) {
      if (!poiUuids.has(uuid)) log("poiUuids", uuid, "Station", station.uuid);
    }
  }

  // ── Traverses ──────────────────────────────────────────────────────────────
  for (const traverse of Object.values(doc.traverses ?? {})) {
    for (const uuid of traverse.actionOrderUuids ?? []) {
      if (!actionUuids.has(uuid)) log("actionOrderUuids", uuid, "Traverse", traverse.uuid);
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  for (const action of Object.values(doc.actions ?? {})) {
    if (action.poiUuid && !poiUuids.has(action.poiUuid)) {
      log("poiUuid", action.poiUuid, "Action", action.uuid);
    }
    if (action.stationUuid && !stationUuids.has(action.stationUuid)) {
      log("stationUuid", action.stationUuid, "Action", action.uuid);
    }
    if (action.traverseUuid && !traverseUuids.has(action.traverseUuid)) {
      log("traverseUuid", action.traverseUuid, "Action", action.uuid);
    }
    if (action.parentActionUuid && !actionUuids.has(action.parentActionUuid)) {
      log("parentActionUuid", action.parentActionUuid, "Action", action.uuid);
    }
    for (const uuid of Object.keys(action.equipmentItemsUsage ?? {})) {
      if (!equipmentItemUuids.has(uuid)) log("equipmentItemsUsage", uuid, "Action", action.uuid);
    }
    for (const uuid of action.geographicUnitsUsage ?? []) {
      if (!geographicUnitUuids.has(uuid)) log("geographicUnitsUsage", uuid, "Action", action.uuid);
    }
    if (action.actionDefinition) {
      const { verbUuid, nounUuid, adjectiveUuid } = action.actionDefinition;
      if (verbUuid && !verbUuids.has(verbUuid))
        log("actionDefinition.verbUuid", verbUuid, "Action", action.uuid);
      if (nounUuid && !nounUuids.has(nounUuid))
        log("actionDefinition.nounUuid", nounUuid, "Action", action.uuid);
      if (adjectiveUuid && !adjectiveUuids.has(adjectiveUuid))
        log("actionDefinition.adjectiveUuid", adjectiveUuid, "Action", action.uuid);
    }
  }

  // ── EVAs ───────────────────────────────────────────────────────────────────
  for (const eva of Object.values(doc.evas ?? {})) {
    if (eva.egressLocationUuid !== "lander" && !stationUuids.has(eva.egressLocationUuid)) {
      log("egressLocationUuid", eva.egressLocationUuid, "EVA", eva.uuid);
    }
    if (eva.ingressLocationUuid !== "lander" && !stationUuids.has(eva.ingressLocationUuid)) {
      log("ingressLocationUuid", eva.ingressLocationUuid, "EVA", eva.uuid);
    }
    // Guard against falsy uuids — empty-string entries in sequence are invalid data,
    // not missing entities, and should not be reported as orphans.
    for (const item of eva.sequence ?? []) {
      if (!item.uuid) continue;
      if (item.type === "station" && !stationUuids.has(item.uuid)) {
        log("sequence[].uuid (station)", item.uuid, "EVA", eva.uuid);
      } else if (item.type === "traverse" && !traverseUuids.has(item.uuid)) {
        log("sequence[].uuid (traverse)", item.uuid, "EVA", eva.uuid);
      }
    }
  }

  // ── Rexes ──────────────────────────────────────────────────────────────────
  for (const rex of Object.values(doc.rexes ?? {})) {
    if (rex.evaUuid && !evaUuids.has(rex.evaUuid)) {
      log("evaUuid", rex.evaUuid, "Rex", rex.uuid);
    }
    for (const uuid of Object.keys(rex.stationEntries ?? {})) {
      if (!stationUuids.has(uuid)) log("stationEntries", uuid, "Rex", rex.uuid);
    }
    for (const uuid of Object.keys(rex.traverseEntries ?? {})) {
      if (!traverseUuids.has(uuid)) log("traverseEntries", uuid, "Rex", rex.uuid);
    }
    for (const uuid of Object.keys(rex.actionEntries ?? {})) {
      if (!actionUuids.has(uuid)) log("actionEntries", uuid, "Rex", rex.uuid);
    }
    // Deduplicate: the same orphaned posTypeUuid/posSourceUuid can appear across
    // many posEntries, so collect unique orphans before emitting one finding each.
    const posTypeUuids = new Set((rex.posTypes ?? []).map((pt) => pt.uuid));
    const posSourceUuids = new Set((rex.posSources ?? []).map((ps) => ps.uuid));
    const orphanedPosTypeUuids = new Set<string>();
    const orphanedPosSourceUuids = new Set<string>();
    for (const entry of rex.posEntries ?? []) {
      for (const uuid of entry.posTypeUuids ?? []) {
        if (!posTypeUuids.has(uuid)) orphanedPosTypeUuids.add(uuid);
      }
      if (entry.posSourceUuid && !posSourceUuids.has(entry.posSourceUuid)) {
        orphanedPosSourceUuids.add(entry.posSourceUuid);
      }
    }
    for (const uuid of orphanedPosTypeUuids) {
      log("posEntries[].posTypeUuids", uuid, "Rex", rex.uuid);
    }
    for (const uuid of orphanedPosSourceUuids) {
      log("posEntries[].posSourceUuid", uuid, "Rex", rex.uuid);
    }
  }

  return findings;
}

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
