import { setImmediate } from "node:timers/promises";
import type { AutomergeUrl, Repo } from "@automerge/automerge-repo/slim";

// Shared across list requests so simultaneous callers cannot start parallel cold loads.
let pendingLoad: Promise<void> = Promise.resolve();

export function loadMissionForList(repo: Repo, url: AutomergeUrl): Promise<Mission> {
  const result = pendingLoad.then(async () => {
    // Let socket traffic, timers, and other requests run between document loads.
    await setImmediate();
    const handle = await repo.find<Mission>(url);
    await handle.whenReady();
    return handle.doc();
  });
  // A failed document must not prevent subsequent requests from using the queue.
  pendingLoad = result.then(
    (): void => undefined,
    (): void => undefined
  );
  return result;
}
