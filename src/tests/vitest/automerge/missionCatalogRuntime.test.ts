// @vitest-environment node
import type { DocHandle, DocumentId } from "@automerge/automerge-repo/slim";
import type { LazyMissionRepo } from "server/automerge/lazyMissionRepo";
import type { PostgresStorageAdapter } from "server/automerge/automerge-storage-adapter-postgres";
import { projectMission } from "server/automerge/missionCatalog";
import {
  MISSION_CATALOG_DEBOUNCE_MS,
  startMissionCatalogRuntime,
} from "server/automerge/missionCatalogRuntime";
import { serverLogger } from "utils/logging/serverLogger";

vi.mock("server/automerge/missionCatalog", () => ({
  projectMission: vi.fn().mockResolvedValue(false),
  getRunningMissionListings: vi.fn(),
}));
vi.mock("server/express/global", () => ({
  globalValues: {
    serverSocketStatus: { visitorsData: [] },
    maestroV2: { visitorData: {}, docHandles: new Map() },
    dustV1: { visitorData: {}, docHandles: new Map() },
  },
}));
vi.mock("utils/logging/serverLogger", () => ({ serverLogger: { error: vi.fn() } }));

let repo: LazyMissionRepo;
let storage: PostgresStorageAdapter;
let runtime: ReturnType<typeof startMissionCatalogRuntime>;

function addDocument(id: string) {
  const documentId = id as DocumentId;
  const handle = {
    documentId,
    isReady: () => true,
    doc: () => ({ id: 1, rexes: {} }),
  } as unknown as DocHandle<Mission>;
  repo.handles[documentId] = handle;
  return handle;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(projectMission).mockReset().mockResolvedValue(false);
  vi.mocked(serverLogger.error).mockClear();
  repo = { handles: {}, lastAccess: new Map() } as unknown as LazyMissionRepo;
  storage = {} as PostgresStorageAdapter;
  runtime = startMissionCatalogRuntime(repo, storage);
});

afterEach(async () => {
  await runtime.stop();
  vi.useRealTimers();
});

test("save and load bursts compare once, three seconds after the last notification", async () => {
  const handle = addDocument("first");
  repo.onDocumentLoaded(handle.documentId);
  await vi.advanceTimersByTimeAsync(2_000);
  storage.onDocumentSaved(handle.documentId);
  await vi.advanceTimersByTimeAsync(2_000);
  storage.onDocumentSaved(handle.documentId);
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS - 1);
  expect(projectMission).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(projectMission).toHaveBeenCalledExactlyOnceWith(repo, handle);
});

test("documents have independent debounce periods", async () => {
  const first = addDocument("first");
  const second = addDocument("second");
  storage.onDocumentSaved(first.documentId);
  await vi.advanceTimersByTimeAsync(2_000);
  storage.onDocumentSaved(second.documentId);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(projectMission).toHaveBeenCalledExactlyOnceWith(repo, first);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(projectMission).toHaveBeenNthCalledWith(2, repo, second);
});

test("a save during projection schedules another debounced check", async () => {
  const handle = addDocument("first");
  let finishProjection: () => void;
  vi.mocked(projectMission).mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finishProjection = resolve;
    });
    return true;
  });
  storage.onDocumentSaved(handle.documentId);
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS);
  storage.onDocumentSaved(handle.documentId);
  finishProjection();
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS - 1);
  expect(projectMission).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(projectMission).toHaveBeenCalledTimes(2);
});

test("a new save postpones a check queued behind another projection", async () => {
  const first = addDocument("first");
  const second = addDocument("second");
  let finishProjection: () => void;
  vi.mocked(projectMission).mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finishProjection = resolve;
    });
    return true;
  });
  storage.onDocumentSaved(first.documentId);
  storage.onDocumentSaved(second.documentId);
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS);
  expect(projectMission).toHaveBeenCalledExactlyOnceWith(repo, first);
  storage.onDocumentSaved(second.documentId);
  finishProjection();
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS - 1);
  expect(projectMission).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(projectMission).toHaveBeenNthCalledWith(2, repo, second);
});

test("the housekeeping timer does not shorten the debounce", async () => {
  const handle = addDocument("first");
  await vi.advanceTimersByTimeAsync(59_000);
  storage.onDocumentSaved(handle.documentId);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(projectMission).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(projectMission).toHaveBeenCalledExactlyOnceWith(repo, handle);
});

test("explicit refresh processes pending checks immediately", async () => {
  const handle = addDocument("first");
  storage.onDocumentSaved(handle.documentId);
  await runtime.refresh();
  expect(projectMission).toHaveBeenCalledExactlyOnceWith(repo, handle);
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS);
  expect(projectMission).toHaveBeenCalledTimes(1);
});

test("shutdown drains pending checks and cancels all timers and callbacks", async () => {
  const handle = addDocument("first");
  storage.onDocumentSaved(handle.documentId);
  await runtime.stop();
  expect(projectMission).toHaveBeenCalledExactlyOnceWith(repo, handle);
  expect(storage.onDocumentSaved).toBeUndefined();
  expect(repo.onDocumentLoaded).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

test("failed checks retry after the next debounced save", async () => {
  const handle = addDocument("first");
  vi.mocked(projectMission).mockRejectedValueOnce(new Error("Projection failed"));
  storage.onDocumentSaved(handle.documentId);
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS);
  expect(serverLogger.error).toHaveBeenCalledTimes(1);
  storage.onDocumentSaved(handle.documentId);
  await vi.advanceTimersByTimeAsync(MISSION_CATALOG_DEBOUNCE_MS);
  expect(projectMission).toHaveBeenCalledTimes(2);
});
