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
  onDustChangeListener,
  addDustDocListenerForMission,
  getEverythingForDust,
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
 * Wires up a namespace with one socket present in the mission's room, plus the
 * matching visitorData entry the listener setup checks for.
 */
const connectDustVisitor = (missionId = MISSION_ID) => {
  const ns = createMockDustNamespace();
  ns._rooms.set(getDustSocketRoomName(missionId), new Set(["socket1"]));
  ns.sockets.set("socket1", {});
  globalValues.dustV1.socketio = ns as never;
  globalValues.dustV1.visitorData[missionId] = [
    { socketId: "socket1", name: "Vitest Dust", connectedAt: Date.now() },
  ];
  return ns;
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
const buildMockMission = (overrides: { evas?: Eva[]; rexes?: Rex[]; name?: string }): Mission =>
  ({
    id: MISSION_ID,
    name: overrides.name ?? "Vitest Dust Test Mission",
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
const posSourceCrew = { uuid: "pos-source-crew", name: "Crew", abbr: "C", pathColor: "#ff0000" };

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

  it("does not write a snapshot when the mission's dust room is empty", () => {
    const ns = createMockDustNamespace();
    ns.sockets.set("socket1", {});
    globalValues.dustV1.socketio = ns as never;

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    // A trailing throttled call arriving after cleanup must not recreate the snapshot.
    onDustChangeListener(MISSION_ID, docHandle as never);

    // Proven by the fact that a later call with a populated room still emits.
    connectDustVisitor();
    const ns2 = globalValues.dustV1.socketio as never as ReturnType<typeof createMockDustNamespace>;
    onDustChangeListener(MISSION_ID, docHandle as never);
    expect(ns2._emit).toHaveBeenCalledWith("posEntriesUpdate", expect.any(Object));
  });

  it("does not emit when the rex is not running", () => {
    const ns = connectDustVisitor();

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
    const ns = connectDustVisitor();
    const roomName = getDustSocketRoomName(MISSION_ID);

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    // No prior snapshot set — treated as a change.
    onDustChangeListener(MISSION_ID, docHandle as never);

    expect(ns.to).toHaveBeenCalledWith(roomName);
    expect(ns._emit).toHaveBeenCalledWith("posEntriesUpdate", expect.any(Object));
  });

  it("includes the full current posEntries list, not just the changed entry", () => {
    const ns = connectDustVisitor();

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
    const ns = connectDustVisitor();

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    onDustChangeListener(MISSION_ID, docHandle as never);

    const payload = ns._emit.mock.calls[0][1];
    expect(payload.posEntries[0].posTypes).toEqual(["EV1"]);
    expect(payload.posEntries[0].posSource).toBe("Crew");
  });

  it("includes mission, rex, and eva identifying info in the payload, resolving evaName from the as-planned EVA", () => {
    const ns = connectDustVisitor();

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
    const ns = connectDustVisitor();

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    // Only the rex's own (unnamed) EVA exists — no as-planned EVA with a matching refUuid.
    const mission = buildMockMission({ evas: [rexEva], rexes: [rex] });
    const docHandle = { doc: vi.fn().mockReturnValue(mission) };

    onDustChangeListener(MISSION_ID, docHandle as never);

    const payload = ns._emit.mock.calls[0][1];
    expect(payload.evaName).toBe("");
  });

  it("handles multiple running rexes independently, emitting once per changed rex", () => {
    const ns = connectDustVisitor();

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

    connectDustVisitor();

    const docHandle = {
      doc: vi.fn(() => {
        throw new Error("boom");
      }),
    };

    expect(() => onDustChangeListener(MISSION_ID, docHandle as never)).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });

  // ── Derived payload values ────────────────────────────────────────────────

  it("emits when a posType is renamed even though posEntries is unchanged", () => {
    const ns = connectDustVisitor();

    const posEntries = [buildPosEntry()];
    const rex = runningRexWithPosEntries(posEntries);
    const docHandle = {
      doc: vi
        .fn()
        .mockReturnValue(buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] })),
    };
    onDustChangeListener(MISSION_ID, docHandle as never);
    ns._emit.mockClear();

    // Same posEntries array reference, renamed pos type.
    const renamedRex = {
      ...rex,
      posTypes: [{ ...posType1, name: "EV1-Renamed" }],
      posEntries,
    } as Rex;
    docHandle.doc.mockReturnValue(
      buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [renamedRex] })
    );
    onDustChangeListener(MISSION_ID, docHandle as never);

    expect(ns._emit).toHaveBeenCalledTimes(1);
    expect(ns._emit.mock.calls[0][1].posEntries[0].posTypes).toEqual(["EV1-Renamed"]);
  });

  it("emits when a posSource is renamed even though posEntries is unchanged", () => {
    const ns = connectDustVisitor();

    const posEntries = [buildPosEntry()];
    const rex = runningRexWithPosEntries(posEntries);
    const docHandle = {
      doc: vi
        .fn()
        .mockReturnValue(buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] })),
    };
    onDustChangeListener(MISSION_ID, docHandle as never);
    ns._emit.mockClear();

    const renamedRex = {
      ...rex,
      posSources: [{ ...posSourceCrew, name: "Crew-Renamed" }],
      posEntries,
    } as Rex;
    docHandle.doc.mockReturnValue(
      buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [renamedRex] })
    );
    onDustChangeListener(MISSION_ID, docHandle as never);

    expect(ns._emit).toHaveBeenCalledTimes(1);
    expect(ns._emit.mock.calls[0][1].posEntries[0].posSource).toBe("Crew-Renamed");
  });

  it("emits when the mission is renamed even though posEntries is unchanged", () => {
    const ns = connectDustVisitor();

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const docHandle = {
      doc: vi
        .fn()
        .mockReturnValue(buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] })),
    };
    onDustChangeListener(MISSION_ID, docHandle as never);
    ns._emit.mockClear();

    docHandle.doc.mockReturnValue(
      buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex], name: "Renamed Mission" })
    );
    onDustChangeListener(MISSION_ID, docHandle as never);

    expect(ns._emit).toHaveBeenCalledTimes(1);
    expect(ns._emit.mock.calls[0][1].missionName).toBe("Renamed Mission");
  });

  it("emits when the as-planned EVA is renamed even though posEntries is unchanged", () => {
    const ns = connectDustVisitor();

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const docHandle = {
      doc: vi
        .fn()
        .mockReturnValue(buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] })),
    };
    onDustChangeListener(MISSION_ID, docHandle as never);
    ns._emit.mockClear();

    const renamedEva = { ...asPlannedEva, name: "Renamed EVA" } as Eva;
    docHandle.doc.mockReturnValue(buildMockMission({ evas: [renamedEva, rexEva], rexes: [rex] }));
    onDustChangeListener(MISSION_ID, docHandle as never);

    expect(ns._emit).toHaveBeenCalledTimes(1);
    expect(ns._emit.mock.calls[0][1].evaName).toBe("Renamed EVA");
  });
});

// ─── getEverythingForDust ──────────────────────────────────────────────────────

describe("getEverythingForDust", () => {
  const stoppedRex = generateBlankRex({
    name: "Vitest Stopped Rex",
    evaUuid: rexEva.uuid,
    missionId: MISSION_ID,
    isRunning: false,
    posTypes: [posType1],
    posSources: [posSourceCrew],
    posEntries: [buildPosEntry({ uuid: "stopped-entry" })],
  });

  it("returns every rex on the mission, running or not", async () => {
    const runningRex = runningRexWithPosEntries([buildPosEntry()]);
    globalValues.dustV1.docHandles.set(MISSION_ID, {
      doc: vi.fn().mockReturnValue(
        buildMockMission({
          evas: [asPlannedEva, rexEva],
          rexes: [runningRex, stoppedRex],
        })
      ),
    } as never);

    const data = await getEverythingForDust(MISSION_ID);

    expect(data).toHaveLength(2);
    expect(data.map((d) => d.rexUuid).sort()).toEqual([runningRex.uuid, stoppedRex.uuid].sort());
  });

  it("returns payloads in the same shape as posEntriesUpdate, with names resolved", async () => {
    const runningRex = runningRexWithPosEntries([buildPosEntry()]);
    globalValues.dustV1.docHandles.set(MISSION_ID, {
      doc: vi
        .fn()
        .mockReturnValue(buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [runningRex] })),
    } as never);

    const [payload] = await getEverythingForDust(MISSION_ID);

    expect(payload).toEqual({
      missionId: MISSION_ID,
      missionName: "Vitest Dust Test Mission",
      rexUuid: runningRex.uuid,
      rexName: "Vitest Running Rex",
      evaUuid: rexEva.uuid,
      evaName: "Vitest As-Planned EVA",
      posEntries: [
        expect.objectContaining({ posTypes: ["EV1"], posSource: "Crew", uuid: "pos-entry-1" }),
      ],
    });
  });

  it("returns an empty array when the mission has no rexes", async () => {
    globalValues.dustV1.docHandles.set(MISSION_ID, {
      doc: vi.fn().mockReturnValue(buildMockMission({ evas: [asPlannedEva] })),
    } as never);

    await expect(getEverythingForDust(MISSION_ID)).resolves.toEqual([]);
  });

  it("uses the cached doc handle without a doc listing lookup when one exists", async () => {
    globalValues.dustV1.docHandles.set(MISSION_ID, {
      doc: vi.fn().mockReturnValue(buildMockMission({ evas: [asPlannedEva] })),
    } as never);

    await getEverythingForDust(MISSION_ID);

    expect(mockGetAutomergeDocListing).not.toHaveBeenCalled();
  });

  it("rejects when the automerge document is unavailable", async () => {
    globalValues.dustV1.docHandles.set(MISSION_ID, {
      doc: vi.fn().mockReturnValue(undefined),
    } as never);

    await expect(getEverythingForDust(MISSION_ID)).rejects.toThrow("is unavailable");
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
    // A visitor must be present or setup intentionally abandons itself.
    globalValues.dustV1.visitorData[MISSION_ID] = [
      { socketId: "socket1", name: "Vitest Dust", connectedAt: Date.now() },
    ];
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
    const ns = connectDustVisitor(LISTENER_MISSION_ID);

    // doc() returns undefined during setup so no initial snapshot is stored,
    // ensuring the first change sees the rex as new and triggers an emit.
    await addDustDocListenerForMission(LISTENER_MISSION_ID);

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    mockDocHandle.doc.mockReturnValue(mission);

    const changeListener = mockDocHandle.on.mock.calls[0][1];
    changeListener();

    await vi.waitFor(() => {
      expect(ns._emit).toHaveBeenCalledWith("posEntriesUpdate", expect.any(Object));
    });

    cleanupDust(LISTENER_MISSION_ID);
  });

  it("cleanup function removes the change listener", async () => {
    await addDustDocListenerForMission(MISSION_ID);

    expect(globalValues.dustV1.docListeners.has(MISSION_ID)).toBe(true);
    const cleanupFn = globalValues.dustV1.docListeners.get(MISSION_ID)!;
    cleanupFn();

    expect(mockDocHandle.off).toHaveBeenCalledWith("change", expect.any(Function));
  });

  // ── Failure handling ──────────────────────────────────────────────────────

  it("rejects and removes all provisional state when the doc listing lookup fails", async () => {
    const { serverLogger } = await import("utils/logging/serverLogger");
    vi.spyOn(serverLogger, "error").mockImplementation(() => {});
    mockGetAutomergeDocListing.mockRejectedValue(new Error("db down"));

    await expect(addDustDocListenerForMission(MISSION_ID)).rejects.toThrow("db down");

    expect(globalValues.dustV1.docListeners.has(MISSION_ID)).toBe(false);
    expect(globalValues.dustV1.docHandles.has(MISSION_ID)).toBe(false);
  });

  it("rejects when the mission has no automerge doc listing", async () => {
    const { serverLogger } = await import("utils/logging/serverLogger");
    vi.spyOn(serverLogger, "error").mockImplementation(() => {});
    mockGetAutomergeDocListing.mockResolvedValue([]);

    await expect(addDustDocListenerForMission(MISSION_ID)).rejects.toThrow();

    expect(globalValues.dustV1.docListeners.has(MISSION_ID)).toBe(false);
  });

  it("rejects when the automerge repo cannot find the document", async () => {
    const { serverLogger } = await import("utils/logging/serverLogger");
    vi.spyOn(serverLogger, "error").mockImplementation(() => {});
    globalValues.automergeRepo = {
      find: vi.fn().mockRejectedValue(new Error("doc not found")),
    } as never;

    await expect(addDustDocListenerForMission(MISSION_ID)).rejects.toThrow("doc not found");

    expect(globalValues.dustV1.docListeners.has(MISSION_ID)).toBe(false);
  });

  it("succeeds on a retry after a failed setup attempt", async () => {
    const { serverLogger } = await import("utils/logging/serverLogger");
    vi.spyOn(serverLogger, "error").mockImplementation(() => {});
    mockGetAutomergeDocListing.mockRejectedValueOnce(new Error("transient"));

    await expect(addDustDocListenerForMission(MISSION_ID)).rejects.toThrow("transient");

    mockGetAutomergeDocListing.mockResolvedValue([{ automergeUrl: "automerge://test-url" }]);
    await addDustDocListenerForMission(MISSION_ID);

    expect(globalValues.dustV1.docListeners.has(MISSION_ID)).toBe(true);
    expect(mockDocHandle.on).toHaveBeenCalledWith("change", expect.any(Function));
  });

  // ── Disconnect during setup ───────────────────────────────────────────────

  it("does not install the listener when the last visitor disconnects mid-setup", async () => {
    let resolveFind: (value: unknown) => void = () => {};
    const find = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFind = resolve;
        })
    );
    globalValues.automergeRepo = { find } as never;

    const setupPromise = addDustDocListenerForMission(MISSION_ID);
    // Let the doc listing await settle so setup is parked inside find().
    await vi.waitFor(() => expect(find).toHaveBeenCalled());

    // Simulate the disconnect handler running while setup is awaiting.
    delete globalValues.dustV1.visitorData[MISSION_ID];
    cleanupDust(MISSION_ID);

    resolveFind(mockDocHandle);
    await setupPromise;

    expect(mockDocHandle.on).not.toHaveBeenCalled();
    expect(globalValues.dustV1.docListeners.has(MISSION_ID)).toBe(false);
    expect(globalValues.dustV1.docHandles.has(MISSION_ID)).toBe(false);
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

  it("cancels a pending trailing throttled invocation so it cannot run after cleanup", async () => {
    vi.useFakeTimers();
    const THROTTLE_MISSION_ID = 6666;
    const ns = connectDustVisitor(THROTTLE_MISSION_ID);

    const rex = runningRexWithPosEntries([buildPosEntry()]);
    const mission = buildMockMission({ evas: [asPlannedEva, rexEva], rexes: [rex] });
    const mockDocHandle = {
      whenReady: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
      doc: vi.fn().mockReturnValue(mission),
    };
    globalValues.automergeRepo = {
      find: vi.fn().mockResolvedValue(mockDocHandle),
    } as never;
    mockGetAutomergeDocListing.mockResolvedValue([{ automergeUrl: "automerge://throttle-url" }]);

    const actual = await vi.importActual<typeof SocketsDustEmitters>(
      "server/dust/v1/sockets-dust-emitters"
    );
    await actual.addDustDocListenerForMission(THROTTLE_MISSION_ID);

    const changeListener = mockDocHandle.on.mock.calls.at(-1)![1];
    changeListener(); // leading call runs immediately
    changeListener(); // queues a trailing call
    ns._emit.mockClear();

    cleanupDust(THROTTLE_MISSION_ID);
    vi.advanceTimersByTime(1000);

    expect(ns._emit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("clears the snapshot so the next change listener sees the rex as new", async () => {
    const SNAPSHOT_MISSION_ID = 8888;
    const ns = connectDustVisitor(SNAPSHOT_MISSION_ID);

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

    // Fire the change listener with data → snapshot is now set to the mission's payloads
    mockDocHandle.doc.mockReturnValue(mission);
    const firstChangeListener = mockDocHandle.on.mock.calls.at(-1)![1];
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

    // Fire the change listener with data — no previous snapshot → treated as new → emit fires
    mockDocHandle.doc.mockReturnValue(mission);
    const secondChangeListener = mockDocHandle.on.mock.calls.at(-1)![1];
    secondChangeListener();

    await vi.waitFor(() => {
      expect(ns._emit).toHaveBeenCalledWith("posEntriesUpdate", expect.any(Object));
    });

    cleanupDust(SNAPSHOT_MISSION_ID);
  });
});
