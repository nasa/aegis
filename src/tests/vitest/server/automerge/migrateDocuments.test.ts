import { Repo } from "@automerge/automerge-repo";
import type { StorageAdapterInterface } from "@automerge/automerge-repo";
import type { MikroORM } from "@mikro-orm/postgresql";
import { migrateDocuments } from "server/automerge/migrateDocuments";
import { generateBlankMission } from "store/storeUtils/mission";
import { serverLogger } from "utils/logging/serverLogger";

vi.unmock("@automerge/automerge-repo");
vi.mock("utils/logging/serverLogger", () => ({
  serverLogger: { info: vi.fn(), debug: vi.fn() },
}));

const createStorage = (): StorageAdapterInterface => {
  const chunks = new Map<string, Uint8Array>();
  return {
    load: async (key) => chunks.get(JSON.stringify(key)),
    save: async (key, data) => {
      chunks.set(JSON.stringify(key), data.slice());
    },
    remove: async (key) => {
      chunks.delete(JSON.stringify(key));
    },
    loadRange: async (prefix) =>
      Array.from(chunks.entries())
        .filter(([key]) => prefix.every((part, index) => JSON.parse(key)[index] === part))
        .map(([key, data]) => ({ key: JSON.parse(key), data })),
    removeRange: async (prefix) => {
      for (const key of chunks.keys()) {
        if (prefix.every((part, index) => JSON.parse(key)[index] === part)) chunks.delete(key);
      }
    },
  };
};

describe("sequential document migration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists ordered changes and evicts each mission before loading the next", async () => {
    const storage = createStorage();
    const seed = new Repo({ storage });
    const listings = [1, 2].map((id) => ({
      missionId: id,
      automergeUrl: seed.create<Mission>(generateBlankMission({ id })).url,
    }));
    await seed.shutdown();
    const repo = new Repo({ storage });
    const handles: DocHandle<Mission>[] = [];
    const seen: string[] = [];
    const migrations = [1, 2].map((version) => ({
      version,
      name: `step-${version}`,
      migrate: async (handle: DocHandle<Mission>) => {
        if (version === 1) {
          expect(handles.every((previous) => !repo.handles[previous.documentId])).toBe(true);
          handles.push(handle);
        }
        seen.push(`${handle.doc().id}:${version}`);
        handle.change((mission) => {
          mission.name = `${mission.name}/${version}`;
        });
      },
    }));
    try {
      await migrateDocuments(repo, listings, migrations, null as MikroORM);
      expect(seen).toEqual(["1:1", "1:2", "2:1", "2:2"]);
      expect(handles.every((handle) => !repo.handles[handle.documentId])).toBe(true);
      // Let delayed saves run before verifying that release preserved the document.
      await new Promise((resolve) => setTimeout(resolve, 150));
      const reader = new Repo({ storage });
      try {
        for (const listing of listings) {
          const handle = await reader.find<Mission>(listing.automergeUrl);
          expect(handle.doc().name.endsWith("/1/2")).toBe(true);
        }
      } finally {
        await reader.shutdown();
      }
      expect(serverLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          logValue: expect.stringContaining("Mission 2 (2/2): released; total"),
        })
      );
    } finally {
      await repo.shutdown();
    }
  });

  it("stops on a save failure without evicting or loading another mission", async () => {
    const repo = new Repo({ storage: createStorage() });
    const handle = repo.create<Mission>(generateBlankMission({ id: 1 }));
    await repo.flush();
    const find = vi.spyOn(repo, "find");
    const evict = vi.spyOn(repo, "removeFromCache");
    const flush = vi.spyOn(repo, "flush").mockRejectedValueOnce(new Error("storage unavailable"));
    try {
      await expect(
        migrateDocuments(
          repo,
          [
            { missionId: 1, automergeUrl: handle.url },
            { missionId: 2, automergeUrl: handle.url },
          ],
          [],
          null as MikroORM
        )
      ).rejects.toThrow("storage unavailable");
      expect(find).toHaveBeenCalledTimes(1);
      expect(evict).not.toHaveBeenCalled();
      expect(serverLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          logValue: expect.stringContaining("FAILED during save"),
        })
      );
    } finally {
      flush.mockRestore();
      await repo.shutdown();
    }
  });

  it("rejects invalid migrated data before explicit persistence or loading the next mission", async () => {
    const repo = new Repo({ storage: createStorage() });
    const handle = repo.create<Mission>(generateBlankMission({ id: 1 }));
    await repo.flush();
    const find = vi.spyOn(repo, "find");
    const flush = vi.spyOn(repo, "flush");
    const evict = vi.spyOn(repo, "removeFromCache");
    try {
      await expect(
        migrateDocuments(
          repo,
          [
            { missionId: 1, automergeUrl: handle.url },
            { missionId: 2, automergeUrl: handle.url },
          ],
          [
            {
              version: 1,
              name: "invalid",
              migrate: async (docHandle) => {
                docHandle.change((mission) => {
                  delete (mission as Partial<Mission>).name;
                });
              },
            },
          ],
          null as MikroORM
        )
      ).rejects.toThrow("Invalid mission");
      expect(find).toHaveBeenCalledTimes(1);
      expect(flush).not.toHaveBeenCalled();
      expect(evict).not.toHaveBeenCalled();
      expect(serverLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          logValue: expect.stringContaining("FAILED during validation"),
        })
      );
    } finally {
      await repo.shutdown();
    }
  });
});
