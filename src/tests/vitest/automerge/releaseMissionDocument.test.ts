// @vitest-environment node
import { Repo } from "@automerge/automerge-repo/slim";
import type { StorageAdapterInterface, StorageKey } from "@automerge/automerge-repo/slim";
import { releaseMissionDocument } from "server/automerge/releaseMissionDocument";

class MemoryStorage implements StorageAdapterInterface {
  private data = new Map<string, Uint8Array>();
  async load(key: StorageKey) {
    return this.data.get(JSON.stringify(key));
  }
  async save(key: StorageKey, value: Uint8Array) {
    this.data.set(JSON.stringify(key), value);
  }
  async remove(key: StorageKey) {
    this.data.delete(JSON.stringify(key));
  }
  async loadRange(prefix: StorageKey) {
    return [...this.data.entries()].flatMap(([encoded, data]) => {
      const key: StorageKey = JSON.parse(encoded);
      return prefix.every((p, i) => key[i] === p) ? [{ key, data }] : [];
    });
  }
  async removeRange(prefix: StorageKey) {
    for (const { key } of await this.loadRange(prefix)) await this.remove(key);
  }
}

test("eviction preserves storage after delayed saves and a fresh repository reload", async () => {
  const storage = new MemoryStorage();
  const writer = new Repo({ storage });
  const original = writer.create({ name: "Persisted mission", description: "Latest edit" });
  await writer.shutdown();
  const reader = new Repo({ storage });
  const handle = await reader.find<{ name: string; description: string }>(original.url);
  handle.change((doc) => {
    doc.description = "Saved before eviction";
  });
  await reader.flush([handle.documentId]);
  const onChange = vi.fn();
  handle.on("change", onChange);
  await releaseMissionDocument(reader, handle.documentId);
  expect(reader.handles[handle.documentId]).toBeUndefined();

  // Immediate reloads hide the bug: unload's debounced empty save has not fired yet.
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(onChange).not.toHaveBeenCalled();
  const restarted = new Repo({ storage });
  try {
    const reloaded = await restarted.find(original.url);
    expect(reloaded.doc()).toEqual({
      name: "Persisted mission",
      description: "Saved before eviction",
    });
  } finally {
    await restarted.shutdown();
    await reader.shutdown();
  }
});
