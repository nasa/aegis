import type { DocumentId, Repo } from "@automerge/automerge-repo/slim";
import { serverLogger } from "utils/logging/serverLogger";

/** Release an already flushed document without broadcasting or saving an empty placeholder. */
export async function releaseMissionDocument(repo: Repo, documentId: DocumentId): Promise<void> {
  const handle = repo.handles[documentId];
  if (!handle) return;

  // Repo 2.5.6 unloads before detaching storage and sync. The empty A.init() placeholder
  // emits heads-changed/change: it can overwrite storage and leave pending sync callbacks
  // waiting for an unloaded handle. Skip that transition while Repo clears its caches and
  // synchronizer. The orphaned handle/doc are collected once pending callbacks finish.
  const unload = handle.unload;
  handle.unload = () => {};
  try {
    await repo.removeFromCache(documentId);
  } finally {
    handle.unload = unload;
  }
  serverLogger.debug({
    logId: "mission-release",
    logValue: "Released mission document from memory",
    documentId,
  });
}
