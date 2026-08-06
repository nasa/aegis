import { globalValues } from "server/express/global";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import type * as SocketsMaestroEmitters from "server/maestro/v2/sockets-maestro-emitters";

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

import { cleanupMaestro } from "server/maestro/v2/sockets-maestro-emitters";
import { getMaestroSocketRoomName } from "server/maestro/v2/sockets-maestro";

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
const traverseA = generateBlankTraverse({ name: "Vitest Traverse A", missionId: MISSION_ID });

const evaSubscribed = generateBlankEVA({
  name: "Vitest EVA Subscribed",
  missionId: MISSION_ID,
  sequence: [
    { type: "station", uuid: stationA.uuid },
    { type: "traverse", uuid: traverseA.uuid },
  ],
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
  globalValues.maestroV2.evaSubscriptions = new Map();
  globalValues.maestroV2.socketio = null;
  globalValues.maestroV2.docListeners = new Map();
  globalValues.maestroV2.docHandles = new Map();
  globalValues.maestroV2.visitorData = {};
});

// ─── cleanupSocketRoom ────────────────────────────────────────────────────────

describe("cleanupSocketRoom", () => {
  it("does not throw when no listener is registered for the mission, and still cleans up remaining state", () => {
    const nonExistentMissionId = 99999;

    // Pre-populate docHandle for this mission but no docListener
    globalValues.maestroV2.docHandles.set(nonExistentMissionId, { doc: vi.fn() } as never);

    expect(() => cleanupMaestro(nonExistentMissionId)).not.toThrow();

    // No listener was registered — docListeners should still not have an entry
    expect(globalValues.maestroV2.docListeners.has(nonExistentMissionId)).toBe(false);

    // The docHandle should still be cleaned up (cleanup continues past the missing-listener branch)
    expect(globalValues.maestroV2.docHandles.has(nonExistentMissionId)).toBe(false);
  });

  it("calls and removes the listener when one is registered", () => {
    const removeListenerFn = vi.fn();
    globalValues.maestroV2.docListeners.set(MISSION_ID, removeListenerFn);
    globalValues.maestroV2.docHandles.set(MISSION_ID, { doc: vi.fn() } as never);
    cleanupMaestro(MISSION_ID);
    expect(removeListenerFn).toHaveBeenCalled();
    expect(globalValues.maestroV2.docListeners.has(MISSION_ID)).toBe(false);
  });

  it("removes the docHandle from globalValues.maestro.docHandles", () => {
    globalValues.maestroV2.docListeners.set(MISSION_ID, vi.fn());
    globalValues.maestroV2.docHandles.set(MISSION_ID, { doc: vi.fn() } as never);
    cleanupMaestro(MISSION_ID);
    expect(globalValues.maestroV2.docHandles.has(MISSION_ID)).toBe(false);
  });

  it("cleanupSocketRoom does not throw when called after state is set up", () => {
    globalValues.maestroV2.docListeners.set(MISSION_ID, vi.fn());
    globalValues.maestroV2.docHandles.set(MISSION_ID, { doc: vi.fn() } as never);
    expect(() => cleanupMaestro(MISSION_ID)).not.toThrow();
    expect(globalValues.maestroV2.docListeners.has(MISSION_ID)).toBe(false);
    expect(globalValues.maestroV2.docHandles.has(MISSION_ID)).toBe(false);
  });

  it("clears the snapshot so the next change listener sees all entities as new", async () => {
    const SNAPSHOT_MISSION_ID = 8888;
    const { addMaestroDocListenerForMission: actualAddListener } = await vi.importActual<
      typeof SocketsMaestroEmitters
    >("server/maestro/v2/sockets-maestro-emitters");

    const ns = createMockMaestroNamespace();
    const roomName = getMaestroSocketRoomName(SNAPSHOT_MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    globalValues.maestroV2.socketio = ns as never;
    globalValues.maestroV2.evaSubscriptions.set(SNAPSHOT_MISSION_ID, [evaSubscribed.uuid]);

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
      "server/maestro/v2/sockets-maestro-emitters"
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
    globalValues.maestroV2.docListeners.set(MISSION_ID, vi.fn());

    await actualAddMaestroDocListenerForMission(MISSION_ID);

    expect(mockGetAutomergeDocListing).not.toHaveBeenCalled();
  });

  it("attaches change listener and stores cleanup function for a new mission", async () => {
    await actualAddMaestroDocListenerForMission(MISSION_ID);

    expect(mockGetAutomergeDocListing).toHaveBeenCalledWith([MISSION_ID]);
    expect(mockDocHandle.on).toHaveBeenCalledWith("change", expect.any(Function));
    expect(globalValues.maestroV2.docListeners.has(MISSION_ID)).toBe(true);
  });

  it("throttled change listener does nothing when maestro namespace is null", async () => {
    await actualAddMaestroDocListenerForMission(MISSION_ID);

    const changeListener = mockDocHandle.on.mock.calls[0][1];
    globalValues.maestroV2.socketio = null;

    changeListener();

    // With maestroNamespace null, nothing should be emitted — getAutomergeMissions is never called
    expect(mockGetAutomergeMissions).not.toHaveBeenCalled();
  });

  it("throttled change listener does nothing when room is empty", async () => {
    const ns = createMockMaestroNamespace();
    // No sockets in the room
    globalValues.maestroV2.socketio = ns as never;

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
    globalValues.maestroV2.socketio = ns as never;
    globalValues.maestroV2.evaSubscriptions.set(LISTENER_MISSION_ID, [evaSubscribed.uuid]);

    // doc() returns undefined during setup so no initial snapshot is stored,
    // ensuring the first change sees everything as new and triggers an emit.
    await actualAddMaestroDocListenerForMission(LISTENER_MISSION_ID);

    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed],
      stations: [stationA],
      traverses: [traverseA],
    });
    // Return mockCoreData for both the change listener snapshot AND the eventual
    // buildAegisSliceForMaestro call inside emitToMaestroNamespace.
    mockDocHandle.doc.mockReturnValue(mockCoreData);
    // Also set up the getAutomergeMissions fallback in case docHandles lookup fails
    // inside the emitToMaestroNamespace → buildAegisSliceForMaestro chain.
    mockGetAutomergeMissions.mockResolvedValue([mockCoreData]);

    const changeListener = mockDocHandle.on.mock.calls[0][1];
    changeListener();

    // The throttled change listener calls emitToMaestroNamespace which calls
    // buildAegisSliceForMaestro (real) and emits dataAll.
    await vi.waitFor(() => {
      expect(ns._emit).toHaveBeenCalledWith("dataAll", expect.any(Object));
    });
  });

  it("cleanup function removes the change listener", async () => {
    await actualAddMaestroDocListenerForMission(MISSION_ID);

    expect(globalValues.maestroV2.docListeners.has(MISSION_ID)).toBe(true);
    const cleanupFn = globalValues.maestroV2.docListeners.get(MISSION_ID)!;
    cleanupFn();

    expect(mockDocHandle.off).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("stores the DocHandle in globalValues.maestro.docHandles keyed by missionId", async () => {
    expect(globalValues.maestroV2.docHandles.has(MISSION_ID)).toBe(false);
    await actualAddMaestroDocListenerForMission(MISSION_ID);
    expect(globalValues.maestroV2.docHandles.get(MISSION_ID)).toBe(mockDocHandle);
  });

  it("does not overwrite an existing docHandle when the mission already has a listener", async () => {
    const existingHandle = { doc: vi.fn(), on: vi.fn(), off: vi.fn(), whenReady: vi.fn() };
    globalValues.maestroV2.docListeners.set(MISSION_ID, vi.fn());
    globalValues.maestroV2.docHandles.set(MISSION_ID, existingHandle as never);

    await actualAddMaestroDocListenerForMission(MISSION_ID);

    // Early return — handle must be unchanged
    expect(globalValues.maestroV2.docHandles.get(MISSION_ID)).toBe(existingHandle);
  });
});
