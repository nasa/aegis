import { globalValues } from "server/express/global";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankRex } from "store/storeUtils/rex";
import type * as SocketsMaestroEmitters from "server/express/sockets-maestro-emitters";

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockGetAutomergeMissions, mockGetAutomergeDocListing } = vi.hoisted(() => ({
  mockGetAutomergeMissions: vi.fn(),
  mockGetAutomergeDocListing: vi.fn(),
}));

vi.mock("server/express/routes/missionAutomerge", async () => {
  const actual = await vi.importActual("server/express/routes/missionAutomerge");
  return { ...actual, getAutomergeMissions: mockGetAutomergeMissions };
});

vi.mock("server/express/routes/docListing", () => ({
  getAutomergeDocListing: mockGetAutomergeDocListing,
}));

import {
  isDiffRelevantToSubscribedEvas,
  cleanupMaestro,
} from "server/express/sockets-maestro-emitters";
import { getMaestroSocketRoomName } from "server/express/sockets-maestro";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MISSION_ID = 9999;

const createMockMaestroNamespace = () => {
  const rooms = new Map<string, Set<string>>();
  const emitFn = vi.fn();
  return {
    adapter: { rooms },
    to: vi.fn(() => ({ emit: emitFn })),
    _emit: emitFn,
    _rooms: rooms,
    use: vi.fn(),
    on: vi.fn(),
  };
};

type MaestroDiff = Parameters<typeof isDiffRelevantToSubscribedEvas>[2];
type CollectionDiff<T> = { upserted: T[]; deletedUuids: string[] };

/** Build an empty MaestroDiff-shaped object. */
const emptyDiff = (): MaestroDiff => ({
  evas: { upserted: [], deletedUuids: [] },
  stations: { upserted: [], deletedUuids: [] },
  traverses: { upserted: [], deletedUuids: [] },
  actions: { upserted: [], deletedUuids: [] },
  rexes: { upserted: [], deletedUuids: [] },
  changedMissionFields: [],
  hasAnyChange: false,
});

/** Typed helper for building a single collection diff entry. */
const collDiff = <T>(upserted: T[], deletedUuids: string[] = []): CollectionDiff<T> => ({
  upserted,
  deletedUuids,
});

/**
 * Build a minimal Mission-shaped object with the provided entities.
 * Entity collections live directly on `mission` as Records keyed by uuid
 * (matching the Automerge mission doc shape).
 */
const toRecord = <T extends { uuid: string }>(items: T[] = []): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const item of items) out[item.uuid] = item;
  return out;
};
const buildMockCoreData = (overrides: {
  evas?: Eva[];
  stations?: Station[];
  traverses?: Traverse[];
  actions?: Action[];
  rexes?: Rex[];
  pois?: POI[];
}): Mission =>
  ({
    id: MISSION_ID,
    name: "Vitest Test Mission",
    description: "desc",
    actionSystemVersion: 2,
    traverseRate: 5,
    walkbackRate: 3,
    planetRadius: 1737400,
    usingLGRSCoordinates: false,
    landerElevationMeters: 0,
    actionDefinitions: {},
    equipmentItems: {},
    geographicUnits: {},
    createdAt: new Date().getTime(),
    updatedAt: new Date().getTime(),
    evas: toRecord(overrides.evas),
    stations: toRecord(overrides.stations),
    traverses: toRecord(overrides.traverses),
    actions: toRecord(overrides.actions),
    rexes: toRecord(overrides.rexes),
    pois: toRecord(overrides.pois),
  }) as unknown as Mission;

// ── Test data builders ───────────────────────────────────────────────────────

const stationA = generateBlankStation({ name: "Vitest Station A", missionId: MISSION_ID });
const stationB = generateBlankStation({ name: "Vitest Station B", missionId: MISSION_ID });
const traverseA = generateBlankTraverse({ name: "Vitest Traverse A", missionId: MISSION_ID });
const traverseB = generateBlankTraverse({ name: "Vitest Traverse B", missionId: MISSION_ID });

const evaSubscribed = generateBlankEVA({
  name: "Vitest EVA Subscribed",
  missionId: MISSION_ID,
  sequence: [
    { type: "station", uuid: stationA.uuid },
    { type: "traverse", uuid: traverseA.uuid },
  ],
});
const evaNotSubscribed = generateBlankEVA({
  name: "Vitest EVA Not Subscribed",
  missionId: MISSION_ID,
  sequence: [
    { type: "station", uuid: stationB.uuid },
    { type: "traverse", uuid: traverseB.uuid },
  ],
});

const actionInSubscribed = generateBlankAction({
  name: "Vitest Action In Subscribed",
  missionId: MISSION_ID,
  stationUuid: stationA.uuid,
});
const actionNotInSubscribed = generateBlankAction({
  name: "Vitest Action Not In Subscribed",
  missionId: MISSION_ID,
  stationUuid: stationB.uuid,
});

const rexForSubscribed = generateBlankRex({
  name: "Vitest Rex Subscribed",
  evaUuid: evaSubscribed.uuid,
  missionId: MISSION_ID,
});
const rexForNotSubscribed = generateBlankRex({
  name: "Vitest Rex Not Subscribed",
  evaUuid: evaNotSubscribed.uuid,
  missionId: MISSION_ID,
});

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Provide automerge infrastructure mocks globally so the real addMaestroDocListenerForMission
  // won't throw if it is called (circular dep between sockets-maestro and sockets-maestro-emitters
  // can cause the vi.mock factory not to intercept it in sockets-maestro.ts).
  const defaultDocHandle = {
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
  };
  globalValues.automergeRepo = {
    find: vi
      .fn()
      .mockResolvedValue({ ...defaultDocHandle, doc: vi.fn().mockReturnValue(undefined) }),
  } as never;
  mockGetAutomergeDocListing.mockResolvedValue([{ automergeUrl: "automerge://default-url" }]);
  globalValues.maestro.evaSubscriptions = new Map();
  globalValues.maestro.socketio = null;
  globalValues.maestro.docListeners = new Map();
  globalValues.maestro.docHandles = new Map();
  globalValues.serverSocketStatus.maestroMissionVisitors = {};
});

// ─── isDiffRelevantToSubscribedEvas ──────────────────────────────────────────

describe("isDiffRelevantToSubscribedEvas", () => {
  describe("no subscriptions", () => {
    it("returns false for any diff when there are no evaSubscriptions", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), evas: collDiff([evaSubscribed]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(false);
    });
  });

  describe("changedMissionFields", () => {
    it("returns true when changedMissionFields is non-empty, regardless of subscriptions", () => {
      // No subscriptions set
      const mission = buildMockCoreData({});
      const diff: MaestroDiff = { ...emptyDiff(), changedMissionFields: ["name"] };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });

    it("returns true even when changedMissionFields has a value and there are subscriptions", () => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
      const mission = buildMockCoreData({ evas: [evaSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), changedMissionFields: ["description"] };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });
  });

  describe("eva upserts", () => {
    beforeEach(() => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
    });

    it("returns true when an upserted EVA uuid is subscribed", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), evas: collDiff([evaSubscribed]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });

    it("returns false when the upserted EVA uuid is not subscribed", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), evas: collDiff([evaNotSubscribed]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(false);
    });

    it("returns false when there are no subscriptions and an EVA is upserted", () => {
      globalValues.maestro.evaSubscriptions = new Map(); // clear
      const mission = buildMockCoreData({ evas: [evaSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), evas: collDiff([evaSubscribed]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(false);
    });
  });

  describe("eva deletedUuids", () => {
    it("returns true when a deleted EVA uuid is subscribed", () => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
      const mission = buildMockCoreData({ evas: [] });
      const diff: MaestroDiff = { ...emptyDiff(), evas: collDiff([], [evaSubscribed.uuid]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });

    it("returns false when the deleted EVA uuid is not subscribed", () => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
      const mission = buildMockCoreData({ evas: [evaSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), evas: collDiff([], [evaNotSubscribed.uuid]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(false);
    });
  });

  describe("station upserts", () => {
    beforeEach(() => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
    });

    it("returns true when an upserted station uuid is in the subscribed EVA's sequence", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), stations: collDiff([stationA]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });

    it("returns false when an upserted station uuid is NOT in the subscribed EVA's sequence", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), stations: collDiff([stationB]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(false);
    });
  });

  describe("station deletedUuids", () => {
    beforeEach(() => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
    });

    it("returns true when a deleted station uuid is in the subscribed EVA's sequence", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), stations: collDiff([], [stationA.uuid]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });

    it("returns false when a deleted station uuid is NOT in the subscribed EVA's sequence", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), stations: collDiff([], [stationB.uuid]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(false);
    });
  });

  describe("traverse upserts and deletes", () => {
    beforeEach(() => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
    });

    it("returns true when an upserted traverse uuid is in the subscribed EVA's sequence", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), traverses: collDiff([traverseA]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });

    it("returns false when an upserted traverse uuid is NOT in the subscribed EVA's sequence", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), traverses: collDiff([traverseB]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(false);
    });

    it("returns true when a deleted traverse uuid is in the subscribed EVA's sequence", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), traverses: collDiff([], [traverseA.uuid]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });

    it("returns false when a deleted traverse uuid is NOT in the subscribed EVA's sequence", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), traverses: collDiff([], [traverseB.uuid]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(false);
    });
  });

  describe("action upserts", () => {
    beforeEach(() => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
    });

    it("returns true when action.stationUuid is in the subscribed EVA's sequence", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), actions: collDiff([actionInSubscribed]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });

    it("returns true when action.traverseUuid is in the subscribed EVA's sequence", () => {
      const actionOnTraverse = generateBlankAction({
        name: "Vitest Action On Traverse A",
        missionId: MISSION_ID,
        traverseUuid: traverseA.uuid,
      });
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), actions: collDiff([actionOnTraverse]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });

    it("returns false when action parent uuid is NOT in the subscribed EVA's sequence", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), actions: collDiff([actionNotInSubscribed]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(false);
    });
  });

  describe("rex upserts", () => {
    beforeEach(() => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
    });

    it("returns true when rex.evaUuid matches a subscribed EVA", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), rexes: collDiff([rexForSubscribed]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });

    it("returns false when rex.evaUuid does not match any subscribed EVA", () => {
      const mission = buildMockCoreData({ evas: [evaSubscribed, evaNotSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), rexes: collDiff([rexForNotSubscribed]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(false);
    });
  });

  describe("rex deletedUuids", () => {
    it("always returns true (conservative) when any rex is deleted", () => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
      const mission = buildMockCoreData({ evas: [evaSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), rexes: collDiff([], [rexForNotSubscribed.uuid]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });
  });

  describe("empty diff", () => {
    it("returns false when all arrays are empty and no changed mission fields", () => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
      const mission = buildMockCoreData({ evas: [evaSubscribed] });
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, emptyDiff())).toBe(false);
    });
  });
});

// ─── cleanupSocketRoom ────────────────────────────────────────────────────────

describe("cleanupSocketRoom", () => {
  it("does not throw when no listener is registered for the mission, and still cleans up remaining state", () => {
    const nonExistentMissionId = 99999;

    // Pre-populate docHandle for this mission but no docListener
    globalValues.maestro.docHandles.set(nonExistentMissionId, { doc: vi.fn() } as never);

    expect(() => cleanupMaestro(nonExistentMissionId)).not.toThrow();

    // No listener was registered — docListeners should still not have an entry
    expect(globalValues.maestro.docListeners.has(nonExistentMissionId)).toBe(false);

    // The docHandle should still be cleaned up (cleanup continues past the missing-listener branch)
    expect(globalValues.maestro.docHandles.has(nonExistentMissionId)).toBe(false);
  });

  it("calls and removes the listener when one is registered", () => {
    const removeListenerFn = vi.fn();
    globalValues.maestro.docListeners.set(MISSION_ID, removeListenerFn);
    globalValues.maestro.docHandles.set(MISSION_ID, { doc: vi.fn() } as never);
    cleanupMaestro(MISSION_ID);
    expect(removeListenerFn).toHaveBeenCalled();
    expect(globalValues.maestro.docListeners.has(MISSION_ID)).toBe(false);
  });

  it("removes the docHandle from globalValues.maestro.docHandles", () => {
    globalValues.maestro.docListeners.set(MISSION_ID, vi.fn());
    globalValues.maestro.docHandles.set(MISSION_ID, { doc: vi.fn() } as never);
    cleanupMaestro(MISSION_ID);
    expect(globalValues.maestro.docHandles.has(MISSION_ID)).toBe(false);
  });

  it("cleanupSocketRoom does not throw when called after state is set up", () => {
    globalValues.maestro.docListeners.set(MISSION_ID, vi.fn());
    globalValues.maestro.docHandles.set(MISSION_ID, { doc: vi.fn() } as never);
    expect(() => cleanupMaestro(MISSION_ID)).not.toThrow();
    expect(globalValues.maestro.docListeners.has(MISSION_ID)).toBe(false);
    expect(globalValues.maestro.docHandles.has(MISSION_ID)).toBe(false);
  });

  it("clears the snapshot so the next change listener sees all entities as new", async () => {
    const SNAPSHOT_MISSION_ID = 8888;
    const { addMaestroDocListenerForMission: actualAddListener } = await vi.importActual<
      typeof SocketsMaestroEmitters
    >("server/express/sockets-maestro-emitters");

    const ns = createMockMaestroNamespace();
    const roomName = getMaestroSocketRoomName(SNAPSHOT_MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    globalValues.maestro.socketio = ns as never;
    globalValues.maestro.evaSubscriptions.set(SNAPSHOT_MISSION_ID, [evaSubscribed.uuid]);

    const mockDocHandle = {
      whenReady: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
      doc: vi.fn(),
    };
    globalValues.automergeRepo = {
      find: vi.fn().mockResolvedValue(mockDocHandle),
    } as never;
    mockGetAutomergeDocListing.mockResolvedValue([{ automergeUrl: "automerge://snapshot-url" }]);

    const mockCoreData = buildMockCoreData({ evas: [evaSubscribed], stations: [stationA] });

    // First: set up a listener. doc() returns undefined so no initial snapshot is stored.
    mockDocHandle.doc.mockReturnValue(undefined);
    await actualAddListener(SNAPSHOT_MISSION_ID);

    // Fire the change listener with data → snapshot is now set to mockCoreData
    mockDocHandle.doc.mockReturnValue(mockCoreData);
    mockGetAutomergeMissions.mockResolvedValue([mockCoreData]);
    const firstChangeListener = mockDocHandle.on.mock.calls.at(-1)[1];
    firstChangeListener();

    // Wait for the emit to confirm the snapshot was captured (diff saw everything as new)
    await vi.waitFor(() => {
      expect(ns._emit).toHaveBeenCalledWith("dataAll", expect.any(Object));
    });

    ns._emit.mockClear();
    ns.to.mockClear();

    // Fire the same data again — snapshot now matches, so no emit should occur
    firstChangeListener();
    await vi.waitFor(() => {
      expect(ns.to).not.toHaveBeenCalled();
    });

    // Cleanup — this deletes the snapshot
    cleanupMaestro(SNAPSHOT_MISSION_ID);

    // Re-add listener — doc() still returns undefined, so no initial snapshot again
    mockDocHandle.doc.mockReturnValue(undefined);
    await actualAddListener(SNAPSHOT_MISSION_ID);

    // Fire the change listener with data — no previous snapshot → all entities are upserted → emit fires
    mockDocHandle.doc.mockReturnValue(mockCoreData);
    mockGetAutomergeMissions.mockResolvedValue([mockCoreData]);
    const secondChangeListener = mockDocHandle.on.mock.calls.at(-1)[1];
    secondChangeListener();

    await vi.waitFor(() => {
      expect(ns._emit).toHaveBeenCalledWith("dataAll", expect.any(Object));
    });
  });
});

// ─── addMaestroDocListenerForMission ──────────────────────────────────────────

describe("addMaestroDocListenerForMission", () => {
  // Use the actual implementation (the module-level mock replaces it, so we bypass via importActual)
  let actualAddMaestroDocListenerForMission: (missionId: number) => Promise<void>;
  let mockDocHandle: {
    whenReady: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    doc: ReturnType<typeof vi.fn>;
  };

  beforeAll(async () => {
    const actual = await vi.importActual<typeof SocketsMaestroEmitters>(
      "server/express/sockets-maestro-emitters"
    );
    actualAddMaestroDocListenerForMission = actual.addMaestroDocListenerForMission;
  });

  beforeEach(() => {
    mockDocHandle = {
      whenReady: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
      doc: vi.fn().mockReturnValue(undefined),
    };
    globalValues.automergeRepo = {
      find: vi.fn().mockResolvedValue(mockDocHandle),
    } as never;
    mockGetAutomergeDocListing.mockResolvedValue([{ automergeUrl: "automerge://test-url" }]);
  });

  it("returns early when mission already has a listener", async () => {
    globalValues.maestro.docListeners.set(MISSION_ID, vi.fn());

    await actualAddMaestroDocListenerForMission(MISSION_ID);

    expect(mockGetAutomergeDocListing).not.toHaveBeenCalled();
  });

  it("attaches change listener and stores cleanup function for a new mission", async () => {
    await actualAddMaestroDocListenerForMission(MISSION_ID);

    expect(mockGetAutomergeDocListing).toHaveBeenCalledWith([MISSION_ID]);
    expect(mockDocHandle.on).toHaveBeenCalledWith("change", expect.any(Function));
    expect(globalValues.maestro.docListeners.has(MISSION_ID)).toBe(true);
  });

  it("throttled change listener does nothing when maestro namespace is null", async () => {
    await actualAddMaestroDocListenerForMission(MISSION_ID);

    const changeListener = mockDocHandle.on.mock.calls[0][1];
    globalValues.maestro.socketio = null;

    changeListener();

    // With maestroNamespace null, nothing should be emitted — getAutomergeMissions is never called
    expect(mockGetAutomergeMissions).not.toHaveBeenCalled();
  });

  it("throttled change listener does nothing when room is empty", async () => {
    const ns = createMockMaestroNamespace();
    // No sockets in the room
    globalValues.maestro.socketio = ns as never;

    await actualAddMaestroDocListenerForMission(MISSION_ID);
    const changeListener = mockDocHandle.on.mock.calls[0][1];

    changeListener();

    await vi.waitFor(() => {
      expect(ns.to).not.toHaveBeenCalled();
    });
  });

  it("throttled change listener calls emitToMaestroNamespace when room has clients and diff is relevant", async () => {
    const LISTENER_MISSION_ID = 7777;
    const ns = createMockMaestroNamespace();
    const roomName = getMaestroSocketRoomName(LISTENER_MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    globalValues.maestro.socketio = ns as never;
    globalValues.maestro.evaSubscriptions.set(LISTENER_MISSION_ID, [evaSubscribed.uuid]);

    // doc() returns undefined during setup so no initial snapshot is stored,
    // ensuring the first change sees everything as new and triggers an emit.
    await actualAddMaestroDocListenerForMission(LISTENER_MISSION_ID);

    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed],
      stations: [stationA],
      traverses: [traverseA],
    });
    // Return mockCoreData for both the change listener snapshot AND the eventual
    // buildAegisEntityForMaestro call inside emitToMaestroNamespace.
    mockDocHandle.doc.mockReturnValue(mockCoreData);
    // Also set up the getAutomergeMissions fallback in case docHandles lookup fails
    // inside the emitToMaestroNamespace → buildAegisEntityForMaestro chain.
    mockGetAutomergeMissions.mockResolvedValue([mockCoreData]);

    const changeListener = mockDocHandle.on.mock.calls[0][1];
    changeListener();

    // The throttled change listener calls emitToMaestroNamespace which calls
    // buildAegisEntityForMaestro (real) and emits dataAll.
    await vi.waitFor(() => {
      expect(ns._emit).toHaveBeenCalledWith("dataAll", expect.any(Object));
    });
  });

  it("cleanup function removes the change listener", async () => {
    await actualAddMaestroDocListenerForMission(MISSION_ID);

    expect(globalValues.maestro.docListeners.has(MISSION_ID)).toBe(true);
    const cleanupFn = globalValues.maestro.docListeners.get(MISSION_ID)!;
    cleanupFn();

    expect(mockDocHandle.off).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("stores the DocHandle in globalValues.maestro.docHandles keyed by missionId", async () => {
    expect(globalValues.maestro.docHandles.has(MISSION_ID)).toBe(false);
    await actualAddMaestroDocListenerForMission(MISSION_ID);
    expect(globalValues.maestro.docHandles.get(MISSION_ID)).toBe(mockDocHandle);
  });

  it("does not overwrite an existing docHandle when the mission already has a listener", async () => {
    const existingHandle = { doc: vi.fn(), on: vi.fn(), off: vi.fn(), whenReady: vi.fn() };
    globalValues.maestro.docListeners.set(MISSION_ID, vi.fn());
    globalValues.maestro.docHandles.set(MISSION_ID, existingHandle as never);

    await actualAddMaestroDocListenerForMission(MISSION_ID);

    // Early return — handle must be unchanged
    expect(globalValues.maestro.docHandles.get(MISSION_ID)).toBe(existingHandle);
  });
});
