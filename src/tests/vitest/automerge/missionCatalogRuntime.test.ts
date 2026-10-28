// @vitest-environment node
import { EventEmitter } from "node:events";
import type {
  DocHandle,
  DocumentId,
  StorageAdapterInterface,
} from "@automerge/automerge-repo/slim";
import { Repo } from "@automerge/automerge-repo/slim";
import type { PostgresStorageAdapter } from "server/automerge/automerge-storage-adapter-postgres";
import { createMissionSummary } from "server/automerge/missionCatalog";
import {
  MISSION_CATALOG_DEBOUNCE_MS,
  MISSION_IDLE_MS,
  retainMissionDocuments,
  startMissionCatalogRuntime,
} from "server/automerge/missionCatalogRuntime";
import { globalValues } from "server/express/global";
import { serverLogger } from "utils/logging/serverLogger";

vi.mock("server/automerge/missionCatalog", () => ({
  createMissionSummary: vi.fn().mockResolvedValue(false),
  getRunningMissionListings: vi.fn(),
}));
vi.mock("server/express/global", () => ({
  globalValues: {
    serverSocketStatus: { visitorsData: [] },
    maestroV2: { visitorData: {}, docHandles: new Map() },
    dustV1: { visitorData: {}, docHandles: new Map() },
  },
}));
vi.mock("utils/logging/serverLogger", () => ({
  serverLogger: { error: vi.fn(), debug: vi.fn() },
}));

let repo: Repo;
let storage: PostgresStorageAdapter;
let runtime: ReturnType<typeof startMissionCatalogRuntime>;

function addDocument(id: string, missionId = 1) {
  const documentId = id as DocumentId;
  const document = { id: missionId, rexes: {} } as Mission;
  const handle = {
    documentId,
    isReady: () => true,
    whenReady: vi.fn().mockResolvedValue(undefined),
    doc: vi.fn(() => document),
  } as unknown as DocHandle<Mission>;
  repo.handles[documentId] = handle;
  return handle;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(createMissionSummary).mockReset().mockResolvedValue(false);
  vi.mocked(serverLogger.error).mockClear();
  vi.mocked(serverLogger.debug).mockClear();
  globalValues.serverSocketStatus.visitorsData = [];
  globalValues.maestroV2.visitorData = {};
  globalValues.dustV1.visitorData = {};
  globalValues.maestroV2.docHandles.clear();
  globalValues.dustV1.docHandles.clear();
  repo = Object.assign(new EventEmitter(), {
    handles: {},
    flush: vi.fn().mockResolvedValue(undefined),
    removeFromCache: vi.fn(async (id: DocumentId) => {
      delete repo.handles[id];
    }),
  }) as unknown as Repo;
  storage = {} as PostgresStorageAdapter;
  runtime = startMissionCatalogRuntime(repo, storage);
});

afterEach(async () => {
  await runtime.stop();
  vi.useRealTimers();
});

test("save and load bursts compare once, three seconds after the last notification", async () => {
  const handle = addDocument("first");
  repo.emit("doc-metrics", {
    type: "doc-loaded",
    documentId: handle.documentId,
    durationMillis: 1,
    numOps: 1,
    numChanges: 1,
  });
  await vi.advanceTimersByTimeAsync(2_000);
  storage.onDocumentSaved(handle.documentId);
  await vi.advanceTimersByTimeAsync(2_000);
  storage.onDocumentSaved(handle.documentId);
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS - 1);
  expect(createMissionSummary).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(createMissionSummary).toHaveBeenCalledExactlyOnceWith(repo, handle);
});

test("documents have independent debounce periods", async () => {
  const first = addDocument("first");
  const second = addDocument("second");
  storage.onDocumentSaved(first.documentId);
  await vi.advanceTimersByTimeAsync(2_000);
  storage.onDocumentSaved(second.documentId);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(createMissionSummary).toHaveBeenCalledExactlyOnceWith(repo, first);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(createMissionSummary).toHaveBeenNthCalledWith(2, repo, second);
});

test("a save during summary creation schedules another debounced check", async () => {
  const handle = addDocument("first");
  let finishSummaryCreation: () => void;
  vi.mocked(createMissionSummary).mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finishSummaryCreation = resolve;
    });
    return true;
  });
  storage.onDocumentSaved(handle.documentId);
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS);
  storage.onDocumentSaved(handle.documentId);
  finishSummaryCreation();
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS - 1);
  expect(createMissionSummary).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(createMissionSummary).toHaveBeenCalledTimes(2);
});

test("a new save postpones a check queued behind another summary creation", async () => {
  const first = addDocument("first");
  const second = addDocument("second");
  let finishSummaryCreation: () => void;
  vi.mocked(createMissionSummary).mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finishSummaryCreation = resolve;
    });
    return true;
  });
  storage.onDocumentSaved(first.documentId);
  storage.onDocumentSaved(second.documentId);
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS);
  expect(createMissionSummary).toHaveBeenCalledExactlyOnceWith(repo, first);
  storage.onDocumentSaved(second.documentId);
  finishSummaryCreation();
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS - 1);
  expect(createMissionSummary).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(createMissionSummary).toHaveBeenNthCalledWith(2, repo, second);
});

test("the housekeeping timer does not shorten the debounce", async () => {
  const handle = addDocument("first");
  await vi.advanceTimersByTimeAsync(59_000);
  storage.onDocumentSaved(handle.documentId);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(createMissionSummary).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(createMissionSummary).toHaveBeenCalledExactlyOnceWith(repo, handle);
});

test("explicit refresh processes pending checks immediately", async () => {
  const handle = addDocument("first");
  storage.onDocumentSaved(handle.documentId);
  await runtime.refresh();
  expect(createMissionSummary).toHaveBeenCalledExactlyOnceWith(repo, handle);
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS);
  expect(createMissionSummary).toHaveBeenCalledTimes(1);
});

test("shutdown drains pending checks and cancels all timers and callbacks", async () => {
  const handle = addDocument("first");
  storage.onDocumentSaved(handle.documentId);
  await runtime.stop();
  expect(createMissionSummary).toHaveBeenCalledExactlyOnceWith(repo, handle);
  expect(storage.onDocumentSaved).toBeUndefined();
  expect(repo.listenerCount("doc-metrics")).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

test("failed checks retry after the next debounced save", async () => {
  const handle = addDocument("first");
  vi.mocked(createMissionSummary).mockRejectedValueOnce(new Error("Summary creation failed"));
  storage.onDocumentSaved(handle.documentId);
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS);
  expect(serverLogger.error).toHaveBeenCalledTimes(1);
  storage.onDocumentSaved(handle.documentId);
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS);
  expect(createMissionSummary).toHaveBeenCalledTimes(2);
});

test("reads, edits and saves do not restart the four-hour grace period", async () => {
  await runtime.stop();
  const realRepo = new Repo();
  repo = realRepo;
  const handle = realRepo.create<Mission>({ id: 1, rexes: {} } as Mission);
  runtime = startMissionCatalogRuntime(repo, storage);
  try {
    vi.setSystemTime(Date.now() + MISSION_IDLE_MS - 1);
    await repo.find(handle.url);
    handle.change((mission) => {
      mission.description = "Recent edit";
    });
    storage.onDocumentSaved(handle.documentId);
    await runtime.refresh();
    expect(repo.handles[handle.documentId]).toBe(handle);

    vi.setSystemTime(Date.now() + 1);
    await runtime.refresh();
    expect(repo.handles[handle.documentId]).toBeUndefined();
  } finally {
    await runtime.stop();
    await realRepo.shutdown();
  }
});

test("loading a persisted mission schedules a catalog check without a save", async () => {
  await runtime.stop();
  const writer = new Repo();
  const source = writer.create<Mission>({ id: 1, rexes: {} } as Mission);
  const data = await writer.export(source.url);
  await writer.shutdown();
  const adapter: StorageAdapterInterface = {
    load: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    loadRange: async (prefix) =>
      prefix[1] === "snapshot" ? [{ key: [...prefix, "test"], data }] : [],
    removeRange: vi.fn().mockResolvedValue(undefined),
  };
  const realRepo = new Repo({ storage: adapter });
  repo = realRepo;
  runtime = startMissionCatalogRuntime(repo, storage);
  try {
    const handle = await repo.find<Mission>(source.url);
    expect(handle.isReady()).toBe(true);
    expect(createMissionSummary).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS);
    expect(createMissionSummary).toHaveBeenCalledExactlyOnceWith(repo, handle);
    expect(repo.listenerCount("doc-metrics")).toBe(1);
    expect(serverLogger.debug).toHaveBeenCalledExactlyOnceWith({
      logId: "mission-load",
      logValue: "Loaded mission document into memory",
      missionId: 1,
      documentId: source.documentId,
      durationMs: expect.any(Number),
    });
    expect(adapter.save).not.toHaveBeenCalledWith(
      expect.arrayContaining([source.documentId]),
      expect.anything()
    );
  } finally {
    await runtime.stop();
    await realRepo.shutdown();
  }
});

test.each(["user", "maestro", "dust", "rex"] as const)(
  "%s keeps only its mission loaded and departure starts a full grace period",
  async (consumer) => {
    const active = addDocument("active");
    const idle = addDocument("idle", 2);
    if (consumer === "user") {
      globalValues.serverSocketStatus.visitorsData = [
        { missionId: 1, socketId: "first" } as VisitorData,
        { missionId: 1, socketId: "second" } as VisitorData,
      ];
    } else if (consumer === "rex") {
      vi.mocked(active.doc).mockReturnValue({
        ...active.doc(),
        rexes: { active: { isRunning: true } as Rex },
      });
    } else {
      const integration = consumer === "maestro" ? globalValues.maestroV2 : globalValues.dustV1;
      integration.docHandles.set(1, active);
    }
    await runtime.refresh();
    vi.setSystemTime(Date.now() + MISSION_IDLE_MS);
    await runtime.refresh();
    expect(repo.handles[active.documentId]).toBe(active);
    expect(repo.handles[idle.documentId]).toBeUndefined();

    if (consumer === "user") {
      globalValues.serverSocketStatus.visitorsData.pop();
      vi.setSystemTime(Date.now() + MISSION_IDLE_MS);
      await runtime.refresh();
      expect(repo.handles[active.documentId]).toBe(active);
    }
    globalValues.serverSocketStatus.visitorsData = [];
    globalValues.maestroV2.docHandles.clear();
    globalValues.dustV1.docHandles.clear();
    if (consumer === "rex") active.doc().rexes.active.isRunning = false;
    await runtime.refresh();
    vi.setSystemTime(Date.now() + MISSION_IDLE_MS - 1);
    await runtime.refresh();
    expect(repo.handles[active.documentId]).toBe(active);
    vi.setSystemTime(Date.now() + 1);
    await runtime.refresh();
    expect(repo.handles[active.documentId]).toBeUndefined();
  }
);

test("reconnecting restarts the grace period after the next departure", async () => {
  const handle = addDocument("first");
  await runtime.refresh();
  vi.setSystemTime(Date.now() + MISSION_IDLE_MS - 1);
  globalValues.serverSocketStatus.visitorsData = [{ missionId: 1 } as VisitorData];
  await runtime.refresh();
  globalValues.serverSocketStatus.visitorsData = [];
  await runtime.refresh();
  vi.setSystemTime(Date.now() + MISSION_IDLE_MS - 1);
  await runtime.refresh();
  expect(repo.handles[handle.documentId]).toBe(handle);
  vi.setSystemTime(Date.now() + 1);
  await runtime.refresh();
  expect(repo.handles[handle.documentId]).toBeUndefined();
});

test.each(["request", "edit"] as const)(
  "a concurrent %s defers eviction without restarting the grace period",
  async (activity) => {
    const handle = addDocument("first");
    await runtime.refresh();
    vi.setSystemTime(Date.now() + MISSION_IDLE_MS);
    let release: (() => void) | undefined;
    vi.mocked(repo.flush).mockImplementationOnce(async () => {
      if (activity === "request") release = retainMissionDocuments();
      else vi.mocked(handle.doc).mockReturnValue({ ...handle.doc(), description: "Recent edit" });
    });
    try {
      await runtime.refresh();
      expect(repo.handles[handle.documentId]).toBe(handle);
      release?.();
      await runtime.refresh();
      expect(repo.handles[handle.documentId]).toBeUndefined();
    } finally {
      release?.();
    }
  }
);

test("a consumer joining during eviction keeps its mission loaded", async () => {
  const handle = addDocument("first");
  await runtime.refresh();
  vi.setSystemTime(Date.now() + MISSION_IDLE_MS);
  vi.mocked(repo.flush).mockImplementationOnce(async () => {
    globalValues.maestroV2.visitorData[1] = [{ socketId: "joining" } as MaestroVisitorV2];
  });
  await runtime.refresh();
  expect(repo.handles[handle.documentId]).toBe(handle);
  globalValues.maestroV2.visitorData = {};
  await runtime.refresh();
  vi.setSystemTime(Date.now() + MISSION_IDLE_MS - 1);
  await runtime.refresh();
  expect(repo.handles[handle.documentId]).toBe(handle);
  vi.setSystemTime(Date.now() + 1);
  await runtime.refresh();
  expect(repo.handles[handle.documentId]).toBeUndefined();
});
