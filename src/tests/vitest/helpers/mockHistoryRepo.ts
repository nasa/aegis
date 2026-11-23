import type { Mock } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { LocalDocHandle } from "historyStore/LocalDocHandle";
import type { ServerHistoryRepo } from "server/historyStore/ServerHistoryRepo";
import { generateBlankMission } from "store/storeUtils/mission";

/** Spies over the `ServerHistoryRepo` API, backed by `LocalDocHandle`s. */
export type MockHistoryRepo = ServerHistoryRepo & {
  handles: Record<HistoryDocumentId, LocalDocHandle<Mission>>;
  find: Mock<(documentId: HistoryDocumentId) => Promise<LocalDocHandle<Mission>>>;
  create: Mock<(initialState: Mission, documentId?: HistoryDocumentId) => LocalDocHandle<Mission>>;
  flush: Mock<(documentIds?: HistoryDocumentId[]) => Promise<void>>;
  delete: Mock<(documentId: HistoryDocumentId) => Promise<void>>;
  removeFromCache: Mock<(documentId: HistoryDocumentId) => Promise<void>>;
};

/**
 * Mission document id derived from the mission name, e.g. "Vitest Test Mission" →
 * `automerge:VitestTestMission`. Tests use it as the `doc_listing_db.automerge_url`.
 */
export const mockMissionDocumentId = (name: string): HistoryDocumentId =>
  `automerge:${name.replace(/\s+/g, "")}`;

/**
 * An in-memory stand-in for `globalValues.historyRepo`. Each mission gets a real
 * `LocalDocHandle`, so `change()` runs through the same Immer draft and patch normalization as
 * production. Unknown ids resolve to a blank mission, because route code may list missions
 * that exist only in the database.
 */
export const createMockHistoryRepo = (missions: Partial<Mission>[] = []): MockHistoryRepo => {
  const handles: Record<HistoryDocumentId, LocalDocHandle<Mission>> = {};
  // `change` is a spy over the real implementation, so tests can count calls.
  const createHandle = (mission: Mission, documentId: HistoryDocumentId) => {
    const handle = new LocalDocHandle(mission, documentId);
    vi.spyOn(handle, "change");
    return handle;
  };

  for (const missionData of missions) {
    const documentId = mockMissionDocumentId(missionData.name);
    handles[documentId] = createHandle(generateBlankMission({ ...missionData }), documentId);
  }

  const repo = {
    handles,
    peers: [] as string[],
    find: vi.fn(async (documentId: HistoryDocumentId) => {
      handles[documentId] ??= createHandle(generateBlankMission({}), documentId);
      return handles[documentId];
    }),
    create: vi.fn((initialState: Mission, documentId?: HistoryDocumentId) => {
      // "Vitest" lets the global teardown remove the doc listing rows created for it.
      documentId ??= `history:Vitest-${initialState.name?.replace(/\s+/g, "") || "NewMission"}-${uuidv4()}`;
      if (handles[documentId]) throw new Error(`History document ${documentId} already exists`);
      handles[documentId] = createHandle(initialState, documentId);
      return handles[documentId];
    }),
    flush: vi.fn(async () => {}),
    delete: vi.fn(async (documentId: HistoryDocumentId) => {
      const handle = handles[documentId];
      delete handles[documentId];
      handle?.delete();
    }),
    removeFromCache: vi.fn(async (documentId: HistoryDocumentId) => {
      delete handles[documentId];
    }),
    shutdown: vi.fn(async () => {}),
    on: vi.fn(),
    off: vi.fn(),
  };
  return repo as unknown as MockHistoryRepo;
};
