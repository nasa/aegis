import { performance } from "node:perf_hooks";
import { serverLogger } from "utils/logging/serverLogger";
import { getRuntimeMemory } from "./runtimeLoadDiagnostics";
import { setImmediate } from "node:timers/promises";
import type { AutomergeUrl, Repo } from "@automerge/automerge-repo/slim";

// Shared across list requests so simultaneous callers cannot start parallel cold loads.
let pendingLoad: Promise<void> = Promise.resolve();

export function loadMissionForList(repo: Repo, url: AutomergeUrl): Promise<Mission> {
  const queuedAt = performance.now();
  const result = pendingLoad.then(async () => {
    // Let socket traffic, timers, and other requests run between document loads.
    await setImmediate();
    const started = performance.now();
    const queueWaitMs = Math.round(started - queuedAt);
    const cpuStart = process.cpuUsage();
    serverLogger.info({
      logId: "mission-list-load",
      logValue: "Document load started",
      automergeUrl: url,
      queueWaitMs,
      ...getRuntimeMemory(),
    });
    try {
      const handle = await repo.find<Mission>(url);
      await handle.whenReady();
      const mission = handle.doc();
      const cpu = process.cpuUsage(cpuStart);
      serverLogger.info({
        logId: "mission-list-load",
        logValue: "Document load completed",
        automergeUrl: url,
        missionId: mission.id,
        durationMs: Math.round(performance.now() - started),
        queueWaitMs,
        processCpuMs: Math.round((cpu.user + cpu.system) / 1000),
        ...getRuntimeMemory(),
      });
      return mission;
    } catch (error) {
      serverLogger.error(
        {
          logId: "mission-list-load",
          logValue: "Document load failed",
          automergeUrl: url,
          durationMs: Math.round(performance.now() - started),
          queueWaitMs,
          ...getRuntimeMemory(),
        },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  });
  // A failed document must not prevent subsequent requests from using the queue.
  pendingLoad = result.then(
    (): void => undefined,
    (): void => undefined
  );
  return result;
}
