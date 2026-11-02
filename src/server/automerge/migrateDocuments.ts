import { releaseMissionDocument } from "./releaseMissionDocument";
import { performance } from "node:perf_hooks";
import { setImmediate } from "node:timers/promises";
import { isValidAutomergeUrl } from "@automerge/automerge-repo/slim";
import type { Repo } from "@automerge/automerge-repo/slim";
import type { MikroORM } from "@mikro-orm/postgresql";
import type { AutomergeMigration } from "./migrations/types";
import { missionValidator } from "utils/validateSchemaServer";
import { serverLogger } from "utils/logging/serverLogger";

const logProgress = (message: string) => {
  const memory = process.memoryUsage();
  const mib = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  serverLogger.info({
    logId: "automerge-migration",
    logValue: `${message}; memory MiB: rss=${mib(memory.rss)}, heapUsed=${mib(memory.heapUsed)}, heapTotal=${mib(memory.heapTotal)}, external=${mib(memory.external)}, arrayBuffers=${mib(memory.arrayBuffers)}`,
  });
};

export const migrateDocuments = async (
  repo: Repo,
  listings: readonly AutomergeDocListing[],
  migrations: readonly AutomergeMigration[],
  orm: MikroORM
): Promise<void> => {
  const runStart = performance.now();
  logProgress(`Processing ${listings.length} document(s) sequentially`);
  for (const [index, docListing] of listings.entries()) {
    const label = `Mission ${docListing.missionId} (${index + 1}/${listings.length})`;
    const missionStart = performance.now();
    let phase = "load";
    try {
      if (!isValidAutomergeUrl(docListing.automergeUrl)) {
        throw new Error(`Invalid automerge URL: ${docListing.automergeUrl}`);
      }
      logProgress(`${label}: load started`);
      let handle = await repo.find<Mission>(docListing.automergeUrl);
      await handle.whenReady();
      logProgress(`${label}: load completed in ${Math.round(performance.now() - missionStart)} ms`);

      for (const migration of migrations) {
        phase = `migration ${migration.version}-${migration.name}`;
        const start = performance.now();
        logProgress(`${label}: ${phase} started`);
        await migration.migrate(handle, { docListing, orm });
        // A migration may replace the document and update its listing.
        if (handle.url !== docListing.automergeUrl) {
          if (!isValidAutomergeUrl(docListing.automergeUrl)) {
            throw new Error(`Invalid migrated automerge URL for mission ${docListing.missionId}`);
          }
          handle = await repo.find<Mission>(docListing.automergeUrl);
          await handle.whenReady();
        }
        logProgress(`${label}: ${phase} completed in ${Math.round(performance.now() - start)} ms`);
      }

      phase = "validation";
      let start = performance.now();
      logProgress(`${label}: validation started`);
      if (!missionValidator(structuredClone(handle.doc()))) {
        // AJV verbose errors include document data; log only the failing paths and keywords.
        const errors = missionValidator.errors?.map(({ instancePath, keyword, message }) => ({
          instancePath,
          keyword,
          message,
        }));
        throw new Error(`Invalid mission: ${JSON.stringify(errors)}`);
      }
      logProgress(`${label}: validation completed in ${Math.round(performance.now() - start)} ms`);

      phase = "save";
      start = performance.now();
      logProgress(`${label}: save started`);
      // Persist before evicting; the migration ledger is written only after every mission succeeds.
      await repo.flush([handle.documentId]);
      logProgress(`${label}: save completed in ${Math.round(performance.now() - start)} ms`);
      phase = "release";
      await releaseMissionDocument(repo, handle.documentId);
      logProgress(`${label}: released; total ${Math.round(performance.now() - missionStart)} ms`);
    } catch (error) {
      logProgress(
        `${label}: FAILED during ${phase} after ${Math.round(performance.now() - missionStart)} ms`
      );
      throw error;
    }
    // Allow pending storage timers and I/O to run between missions.
    await setImmediate();
  }
  logProgress(
    `Processed ${listings.length} document(s) in ${Math.round(performance.now() - runStart)} ms`
  );
};
