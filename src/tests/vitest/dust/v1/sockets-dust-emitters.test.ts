import { globalValues } from "server/express/global";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex } from "store/storeUtils/rex";
import type * as SocketsDustEmitters from "server/dust/v1/sockets-dust-emitters";

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockGetAutomergeDocListing } = vi.hoisted(() => ({
  mockGetAutomergeDocListing: vi.fn(),
}));

vi.mock("server/express/routes/docListing", () => ({
  getAutomergeDocListing: mockGetAutomergeDocListing,
}));

import {
  setDustSnapshot,
  clearDustSnapshot,
  onDustChangeListener,
  addDustDocListenerForMission,
  cleanupDust,
} from "server/dust/v1/sockets-dust-emitters";
import { getDustSocketRoomName } from "server/dust/v1/sockets-dust";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MISSION_ID = 9999;

const createMockDustNamespace = () => {
  const rooms = new Map<string, Set<string>>();
  const emitFn = vi.fn();
  return {
    adapter: { rooms },
    to: vi.fn(() => ({ emit: emitFn })),
    _emit: emitFn,
    _rooms: rooms,
    sockets: new Map(),
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
const buildMockMission = (overrides: { evas?: Eva[]; rexes?: Rex[] }): Mission =>
  ({
    id: MISSION_ID,
    name: "Vitest Dust Test Mission",
    evas: toRecord(overrides.evas),
    rexes: toRecord(overrides.rexes),
  }) as unknown as Mission;

// ── Test data builders ───────────────────────────────────────────────────────

const asPlannedEva = generateBlankEVA({
  name: "Vitest As-Planned EVA",
  missionId: MISSION_ID,
});
// REX EVA copy — shares refUuid with the as-planned EVA but, like real REX EVAs, has no name.
const rexEva = generateBlankEVA({
  name: "",
  refUuid: asPlannedEva.refUuid,
  missionId: MISSION_ID,
});

const posType1 = { uuid: "pos-type-1", abbr: "1", name: "EV1", icon: "icon1", pathColor: "#fff" };
const posSourceCrew = { uuid: "pos-source-crew", name: "Crew", abbr: "C" };

const buildPosEntry = (overrides?: Partial<PosEntry>): PosEntry => ({
  uuid: "pos-entry-1",
  location: { lat: 10, lng: 20 },
  elevation: null,
  petSeconds: 60,
  posTypeUuids: [posType1.uuid],
  posSourceUuid: posSourceCrew.uuid,
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

const runningRexWithPosEntries = (posEntries: PosEntry[] | null): Rex =>
  generateBlankRex({
    name: "Vitest Running Rex",
    evaUuid: rexEva.uuid,
    missionId: MISSION_ID,
    isRunning: true,
    posTypes: [posType1],
    posSources: [posSourceCrew],
    posEntries,
  });

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  globalValues.dustV1.socketio = null;
  globalValues.dustV1.docListeners = new Map();
  globalValues.dustV1.docHandles = new Map();
  globalValues.dustV1.visitorData = {};
});

// ─── setDustSnapshot / clearDustSnapshot ──────────────────────────────────────

describe("setDustSnapshot / clearDustSnapshot", () => {
  it("captures each rex's posEntries reference and makes the next onDustChangeListener call a no-op when unchanged", () => {
    const ns = createMockDustNamespace();
    const roomName = getDustSocketRoomName(MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

    const posEntries = [buildPosEntry()];
    const rex = runningRexWithPosEntries(posEntries);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });

    setDustSnapshot(MISSION_ID, mission);

    const docHandle = { doc: vi.fn().mockReturnValue(mission) };
    onDustChangeListener(MISSION_ID, docHandle as never);

    // Snapshot already matches the mission's posEntries reference, so nothing is emitted.
    expect(ns._emit).not.toHaveBeenCalled();
  });

  it("clears the stored snapshot so the next change is treated as new", () => {
    const ns = createMockDustNamespace();
    const roomName = getDustSocketRoomName(MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

    const posEntries = [buildPosEntry()];
    const rex = runningRexWithPosEntries(posEntries);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });

    setDustSnapshot(MISSION_ID, mission);
    clearDustSnapshot(MISSION_ID);

    const docHandle = { doc: vi.fn().mockReturnValue(mission) };
    onDustChangeListener(MISSION_ID, docHandle as never);

    // No previous snapshot (cleared) — posEntries is treated as new and emits.
    expect(ns._emit).toHaveBeenCalledWith("posEntriesUpdate", expect.any(Object));
  });
});

// ─── onDustChangeListener ─────────────────────────────────────────────────────

describe("onDustChangeListener", () => {
  it("does not throw and does not emit when the dust namespace is null (no DUST servers connected)", () => {
    globalValues.dustV1.socketio = null;

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    expect(() => onDustChangeListener(MISSION_ID, docHandle as never)).not.toThrow();
  });

  it("bypasses all checks and does not emit when no DUST sockets are connected at all", () => {
    const ns = createMockDustNamespace();
    // No sockets connected to the namespace at all (not even to other missions' rooms)
    const roomName = getDustSocketRoomName(MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"])); // room looks occupied, but...
    globalValues.dustV1.socketio = ns as never; // ns.sockets.size === 0

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    onDustChangeListener(MISSION_ID, docHandle as never);

    expect(ns._emit).not.toHaveBeenCalled();
  });

  it("does not emit when the mission's dust room is empty", () => {
    const ns = createMockDustNamespace();
    ns.sockets.set("socket1", {}); // a DUST server is connected, but not to this mission's room
    globalValues.dustV1.socketio = ns as never;

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    onDustChangeListener(MISSION_ID, docHandle as never);

    expect(ns._emit).not.toHaveBeenCalled();
  });

  it("does not emit when the rex is not running", () => {
    const ns = createMockDustNamespace();
    const roomName = getDustSocketRoomName(MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

    const notRunningRex = generateBlankRex({
      name: "Vitest Not Running Rex",
      evaUuid: rexEva.uuid,
      missionId: MISSION_ID,
      isRunning: false,
      posTypes: [posType1],
      posSources: [posSourceCrew],
      posEntries: [buildPosEntry()],
    });
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [notRunningRex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    onDustChangeListener(MISSION_ID, docHandle as never);

    expect(ns._emit).not.toHaveBeenCalled();
  });

  it("emits posEntriesUpdate to the mission's dust room when a running rex's posEntries change", () => {
    const ns = createMockDustNamespace();
    const roomName = getDustSocketRoomName(MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    // No prior snapshot set — treated as a change.
    onDustChangeListener(MISSION_ID, docHandle as never);

    expect(ns.to).toHaveBeenCalledWith(roomName);
    expect(ns._emit).toHaveBeenCalledWith("posEntriesUpdate", expect.any(Object));
  });

  it("includes the full current posEntries list, not just the changed entry", () => {
    const ns = createMockDustNamespace();
    const roomName = getDustSocketRoomName(MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

    const entry1 = buildPosEntry({ uuid: "entry-1" });
    const entry2 = buildPosEntry({ uuid: "entry-2" });
    const rex = runningRexWithPosEntries([entry1, entry2]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    onDustChangeListener(MISSION_ID, docHandle as never);

    const payload = ns._emit.mock.calls[0][1];
    expect(payload.posEntries).toHaveLength(2);
    expect(payload.posEntries.map((e: { uuid: string }) => e.uuid)).toEqual(["entry-1", "entry-2"]);
  });

  it("resolves posType and posSource uuids to plain-text names", () => {
    const ns = createMockDustNamespace();
    const roomName = getDustSocketRoomName(MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    onDustChangeListener(MISSION_ID, docHandle as never);

    const payload = ns._emit.mock.calls[0][1];
    expect(payload.posEntries[0].posTypes).toEqual(["EV1"]);
    expect(payload.posEntries[0].posSource).toBe("Crew");
  });

  it("includes mission, rex, and eva identifying info in the payload, resolving evaName from the as-planned EVA", () => {
    const ns = createMockDustNamespace();
    const roomName = getDustSocketRoomName(MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    onDustChangeListener(MISSION_ID, docHandle as never);

    const payload = ns._emit.mock.calls[0][1];
    expect(payload.missionId).toBe(MISSION_ID);
    expect(payload.missionName).toBe("Vitest Dust Test Mission");
    expect(payload.rexUuid).toBe(rex.uuid);
    expect(payload.rexName).toBe("Vitest Running Rex");
    // The rex's own EVA (rexEva) has no name — evaName must come from the as-planned EVA.
    expect(payload.evaUuid).toBe(rexEva.uuid);
    expect(payload.evaName).toBe("Vitest As-Planned EVA");
  });

  it("falls back to an empty evaName when no as-planned EVA can be resolved", () => {
    const ns = createMockDustNamespace();
    const roomName = getDustSocketRoomName(MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    // Only the rex's own (unnamed) EVA exists — no as-planned EVA with a matching refUuid.
    const mission = buildMockMission({ evas: [rexEva], rexes: [rex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    onDustChangeListener(MISSION_ID, docHandle as never);

    const payload = ns._emit.mock.calls[0][1];
    expect(payload.evaName).toBe("");
  });

  it("handles multiple running rexes independently, emitting once per changed rex", () => {
    const ns = createMockDustNamespace();
    const roomName = getDustSocketRoomName(MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

    const otherRexEva = generateBlankEVA({ name: "", missionId: MISSION_ID });
    const rex1 = runningRexWithPosEntries([buildPosEntry({ uuid: "rex1-entry" })]);
    const rex2 = generateBlankRex({
      name: "Vitest Other Running Rex",
      evaUuid: otherRexEva.uuid,
      missionId: MISSION_ID,
      isRunning: true,
      posTypes: [posType1],
      posSources: [posSourceCrew],
      posEntries: [buildPosEntry({ uuid: "rex2-entry" })],
    });
    const mission = buildMockMission({
      evas: [asPlannedEva, rexEva, otherRexEva],
      rexes: [rex1, rex2],
    });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    onDustChangeListener(MISSION_ID, docHandle as never);

    expect(ns._emit).toHaveBeenCalledTimes(2);
  });

  it("does not throw and logs when the handler encounters an error", async () => {
    const { serverLogger } = await import("utils/logging/serverLogger");
    const errorSpy = vi.spyOn(serverLogger, "error").mockImplementation(() => {});

    const ns = createMockDustNamespace();
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

    const docHandle = {
      doc: vi.fn(() => {
        throw new Error("boom");
      }),
    };

    expect(() => onDustChangeListener(MISSION_ID, docHandle as never)).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });
});

// ─── addDustDocListenerForMission ─────────────────────────────────────────────

describe("addDustDocListenerForMission", () => {
  let mockDocHandle: {
    whenReady: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    doc: ReturnType<typeof vi.fn>;
  };

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
    globalValues.dustV1.docListeners.set(MISSION_ID, vi.fn());

    await addDustDocListenerForMission(MISSION_ID);

    expect(mockGetAutomergeDocListing).not.toHaveBeenCalled();
  });

  it("attaches change listener and stores cleanup function for a new mission", async () => {
    await addDustDocListenerForMission(MISSION_ID);

    expect(mockGetAutomergeDocListing).toHaveBeenCalledWith([MISSION_ID]);
    expect(mockDocHandle.on).toHaveBeenCalledWith("change", expect.any(Function));
    expect(globalValues.dustV1.docListeners.has(MISSION_ID)).toBe(true);
  });

  it("stores the DocHandle in globalValues.dustV1.docHandles keyed by missionId", async () => {
    expect(globalValues.dustV1.docHandles.has(MISSION_ID)).toBe(false);
    await addDustDocListenerForMission(MISSION_ID);
    expect(globalValues.dustV1.docHandles.get(MISSION_ID)).toBe(mockDocHandle);
  });

  it("does not overwrite an existing docHandle when the mission already has a listener", async () => {
    const existingHandle = { doc: vi.fn(), on: vi.fn(), off: vi.fn(), whenReady: vi.fn() };
    globalValues.dustV1.docListeners.set(MISSION_ID, vi.fn());
    globalValues.dustV1.docHandles.set(MISSION_ID, existingHandle as never);

    await addDustDocListenerForMission(MISSION_ID);

    expect(globalValues.dustV1.docHandles.get(MISSION_ID)).toBe(existingHandle);
  });

  it("throttled change listener does nothing when the dust namespace is null", async () => {
    await addDustDocListenerForMission(MISSION_ID);

    const changeListener = mockDocHandle.on.mock.calls[0][1];
    globalValues.dustV1.socketio = null;
    mockDocHandle.doc.mockReturnValue(buildMockMission({}));

    expect(() => changeListener()).not.toThrow();
  });

  it("throttled change listener emits posEntriesUpdate when a running rex's posEntries change", async () => {
    const LISTENER_MISSION_ID = 7777;
    const ns = createMockDustNamespace();
    const roomName = getDustSocketRoomName(LISTENER_MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

    // doc() returns undefined during setup so no initial snapshot is stored,
    // ensuring the first change sees the rex's posEntries as new and triggers an emit.
    await addDustDocListenerForMission(LISTENER_MISSION_ID);

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    mockDocHandle.doc.mockReturnValue(mission);

    const changeListener = mockDocHandle.on.mock.calls[0][1];
    changeListener();

    await vi.waitFor(() => {
      expect(ns._emit).toHaveBeenCalledWith("posEntriesUpdate", expect.any(Object));
    });
  });

  it("cleanup function removes the change listener", async () => {
    await addDustDocListenerForMission(MISSION_ID);

    expect(globalValues.dustV1.docListeners.has(MISSION_ID)).toBe(true);
    const cleanupFn = globalValues.dustV1.docListeners.get(MISSION_ID)!;
    cleanupFn();

    expect(mockDocHandle.off).toHaveBeenCalledWith("change", expect.any(Function));
  });
});

// ─── cleanupDust ───────────────────────────────────────────────────────────────

describe("cleanupDust", () => {
  it("does not throw when no listener is registered for the mission, and still cleans up remaining state", () => {
    const nonExistentMissionId = 99999;

    // Pre-populate docHandle for this mission but no docListener
    globalValues.dustV1.docHandles.set(nonExistentMissionId, { doc: vi.fn() } as never);

    expect(() => cleanupDust(nonExistentMissionId)).not.toThrow();

    expect(globalValues.dustV1.docListeners.has(nonExistentMissionId)).toBe(false);
    expect(globalValues.dustV1.docHandles.has(nonExistentMissionId)).toBe(false);
  });

  it("calls and removes the listener when one is registered", () => {
    const removeListenerFn = vi.fn();
    globalValues.dustV1.docListeners.set(MISSION_ID, removeListenerFn);
    globalValues.dustV1.docHandles.set(MISSION_ID, { doc: vi.fn() } as never);

    cleanupDust(MISSION_ID);

    expect(removeListenerFn).toHaveBeenCalled();
    expect(globalValues.dustV1.docListeners.has(MISSION_ID)).toBe(false);
  });

  it("removes the docHandle from globalValues.dustV1.docHandles", () => {
    globalValues.dustV1.docListeners.set(MISSION_ID, vi.fn());
    globalValues.dustV1.docHandles.set(MISSION_ID, { doc: vi.fn() } as never);

    cleanupDust(MISSION_ID);

    expect(globalValues.dustV1.docHandles.has(MISSION_ID)).toBe(false);
  });

  it("clears the snapshot so the next change listener sees posEntries as new", async () => {
    const SNAPSHOT_MISSION_ID = 8888;
    const ns = createMockDustNamespace();
    const roomName = getDustSocketRoomName(SNAPSHOT_MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

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

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });

    // First: set up a listener. doc() returns undefined so no initial snapshot is stored.
    mockDocHandle.doc.mockReturnValue(undefined);
    const actual = await vi.importActual<typeof SocketsDustEmitters>(
      "server/dust/v1/sockets-dust-emitters"
    );
    await actual.addDustDocListenerForMission(SNAPSHOT_MISSION_ID);

    // Fire the change listener with data → snapshot is now set to mission's posEntries
    mockDocHandle.doc.mockReturnValue(mission);
    const firstChangeListener = mockDocHandle.on.mock.calls.at(-1)[1];
    firstChangeListener();

    await vi.waitFor(() => {
      expect(ns._emit).toHaveBeenCalledWith("posEntriesUpdate", expect.any(Object));
    });

    ns._emit.mockClear();
    ns.to.mockClear();

    // Fire the same data again — snapshot now matches, so no emit should occur
    firstChangeListener();
    await vi.waitFor(() => {
      expect(ns.to).not.toHaveBeenCalled();
    });

    // Cleanup — this deletes the snapshot
    cleanupDust(SNAPSHOT_MISSION_ID);

    // Re-add listener — doc() still returns undefined, so no initial snapshot again
    mockDocHandle.doc.mockReturnValue(undefined);
    await actual.addDustDocListenerForMission(SNAPSHOT_MISSION_ID);

    // Fire the change listener with data — no previous snapshot → posEntries change is new → emit fires
    mockDocHandle.doc.mockReturnValue(mission);
    const secondChangeListener = mockDocHandle.on.mock.calls.at(-1)[1];
    secondChangeListener();

    await vi.waitFor(() => {
      expect(ns._emit).toHaveBeenCalledWith("posEntriesUpdate", expect.any(Object));
    });
  });
});
