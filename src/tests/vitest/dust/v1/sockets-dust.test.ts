import { globalValues } from "server/express/global";
import { v4 as uuidv4 } from "uuid";

// ── Mocks ────────────────────────────────────────────────────────────────────

// vi.hoisted ensures these are available when vi.mock factories run (hoisted to top)
const {
  mockAddDustDocListenerForMission,
  mockBuildDustEverything,
  mockGetAutomergeDocListing,
  mockGetRexEvasForDust,
  mockGetPosEntriesForDust,
} = vi.hoisted(() => ({
  mockAddDustDocListenerForMission: vi.fn().mockResolvedValue(undefined),
  mockBuildDustEverything: vi.fn().mockResolvedValue([]),
  mockGetAutomergeDocListing: vi.fn(),
  mockGetRexEvasForDust: vi.fn(),
  mockGetPosEntriesForDust: vi.fn(),
}));

// Mock addDustDocListenerForMission to avoid DB calls from automerge doc listing
vi.mock("server/dust/v1/sockets-dust-emitters", async () => {
  const actual = await vi.importActual("server/dust/v1/sockets-dust-emitters");
  return {
    ...actual,
    addDustDocListenerForMission: mockAddDustDocListenerForMission,
    getEverythingForDust: mockBuildDustEverything,
    getRexEvasForDust: mockGetRexEvasForDust,
    getPosEntriesForDust: mockGetPosEntriesForDust,
  };
});

// getEverything wraps its work in RequestContext.create(globalValues.orm.em, ...),
// mocked here as a pass-through so only a stub em is required.
vi.mock("@mikro-orm/postgresql", () => ({
  RequestContext: { create: (_em: unknown, fn: () => unknown) => fn() },
}));

vi.mock("utils/permissions", () => ({
  dustTokenIsValid: vi.fn().mockReturnValue(true),
  emssTokenIsValid: vi.fn().mockReturnValue(false),
}));

vi.mock("server/express/routes/docListing", () => ({
  getAutomergeDocListing: mockGetAutomergeDocListing,
}));

import {
  getDustSocketRoomName,
  getMissionIdFromDustSocketRoomName,
  hasDustVisitorsForMission,
  removeDustVisitor,
  removeDustVisitorFromMission,
} from "server/dust/v1/sockets-dust";
import { dustTokenIsValid, emssTokenIsValid } from "utils/permissions";
import type { DustPosEntriesUpdate, DustVisitor } from "server/dust/v1/types/socketioDust";

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

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply mock implementations after clearAllMocks so module-level mocks still resolve
  mockAddDustDocListenerForMission.mockResolvedValue(undefined);
  mockBuildDustEverything.mockResolvedValue([]);
  globalValues.orm = { em: { fork: vi.fn() } } as never;
  vi.mocked(dustTokenIsValid).mockReturnValue(true);
  vi.mocked(emssTokenIsValid).mockReturnValue(false);
  // Provide automerge infrastructure mocks globally so the real addDustDocListenerForMission
  // won't throw if it is called (circular dep between sockets-dust and sockets-dust-emitters
  // can cause the vi.mock factory not to intercept it in sockets-dust.ts).
  const defaultDocHandle = {
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    doc: vi.fn().mockReturnValue(undefined),
  };
  globalValues.automergeRepo = { find: vi.fn().mockResolvedValue(defaultDocHandle) } as never;
  mockGetAutomergeDocListing.mockResolvedValue([{ automergeUrl: "automerge://default-url" }]);
  globalValues.dustV1.socketio = null;
  globalValues.dustV1.docListeners = new Map();
  globalValues.dustV1.docHandles = new Map();
  globalValues.dustV1.visitorData = {};
});

// ─── getDustSocketRoomName / getMissionIdFromDustSocketRoomName ──────────────

describe("getDustSocketRoomName", () => {
  it("builds the room name from the missionId", () => {
    expect(getDustSocketRoomName(MISSION_ID)).toBe(`dust${MISSION_ID}`);
  });
});

describe("getMissionIdFromDustSocketRoomName", () => {
  it("parses the missionId from a valid room name", () => {
    expect(getMissionIdFromDustSocketRoomName(`dust${MISSION_ID}`)).toBe(MISSION_ID);
  });

  it("returns null for a non-matching room name", () => {
    expect(getMissionIdFromDustSocketRoomName("inspector")).toBeNull();
  });
});

const trackVisitor = (socketId: string, missionIds: number[]) => {
  globalValues.dustV1.visitorData[socketId] = {
    socketId,
    name: `Vitest Dust ${socketId}`,
    connectedAt: Date.now(),
    missionIds,
  };
};

describe("removeDustVisitor", () => {
  it("does nothing when the socket is not tracked", () => {
    expect(() => removeDustVisitor("socket-unknown")).not.toThrow();
  });

  it("stops tracking the visitor and cleans up missions no one else joined", () => {
    const removeListenerFn = vi.fn();
    globalValues.dustV1.docListeners.set(MISSION_ID, removeListenerFn);
    trackVisitor("socket-a", [MISSION_ID]);

    removeDustVisitor("socket-a");

    expect(globalValues.dustV1.visitorData["socket-a"]).toBeUndefined();
    expect(removeListenerFn).toHaveBeenCalled();
  });

  it("keeps the listener when another visitor has joined the mission", () => {
    const removeListenerFn = vi.fn();
    globalValues.dustV1.docListeners.set(MISSION_ID, removeListenerFn);
    trackVisitor("socket-a", [MISSION_ID]);
    trackVisitor("socket-b", [MISSION_ID]);

    removeDustVisitor("socket-a");

    expect(Object.keys(globalValues.dustV1.visitorData)).toEqual(["socket-b"]);
    expect(removeListenerFn).not.toHaveBeenCalled();
  });
});

describe("removeDustVisitorFromMission", () => {
  it("leaves the visitor tracked and cleans up when it was the last one in the mission", () => {
    const removeListenerFn = vi.fn();
    globalValues.dustV1.docListeners.set(MISSION_ID, removeListenerFn);
    trackVisitor("socket-a", [MISSION_ID, 1234]);

    removeDustVisitorFromMission("socket-a", MISSION_ID);

    expect(globalValues.dustV1.visitorData["socket-a"].missionIds).toEqual([1234]);
    expect(removeListenerFn).toHaveBeenCalled();
  });

  it("does not clean up a mission the visitor had not joined", () => {
    const removeListenerFn = vi.fn();
    globalValues.dustV1.docListeners.set(MISSION_ID, removeListenerFn);
    trackVisitor("socket-a", []);

    removeDustVisitorFromMission("socket-a", MISSION_ID);

    expect(removeListenerFn).not.toHaveBeenCalled();
  });
});

describe("hasDustVisitorsForMission", () => {
  it("is true only when a tracked visitor has joined the mission", () => {
    trackVisitor("socket-a", []);
    expect(hasDustVisitorsForMission(MISSION_ID)).toBe(false);

    trackVisitor("socket-b", [MISSION_ID]);
    expect(hasDustVisitorsForMission(MISSION_ID)).toBe(true);
  });
});
// ─── setupDustNamespace socket handlers ──────────────────────────────────────

describe("dust namespace socket handlers", () => {
  let mockSocket: {
    join: ReturnType<typeof vi.fn>;
    leave: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
    id: string;
    handshake: { auth: { token: string } };
    on: ReturnType<typeof vi.fn>;
    _handlers: Record<string, (...args: unknown[]) => void>;
  };
  let mockDustNamespace: ReturnType<typeof createMockDustNamespace>;
  let connectionHandler: (socket: typeof mockSocket) => void;

  beforeEach(async () => {
    // Reset globals
    globalValues.dustV1.socketio = null;
    globalValues.dustV1.docListeners = new Map();
    globalValues.dustV1.visitorData = {};

    mockSocket = {
      join: vi.fn(),
      leave: vi.fn(),
      emit: vi.fn(),
      id: `socket-${uuidv4()}`,
      handshake: { auth: { token: "validToken" } },
      on: vi.fn(),
      _handlers: {},
    };
    // Capture handlers registered via socket.on
    mockSocket.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      mockSocket._handlers[event] = handler;
    });

    mockDustNamespace = createMockDustNamespace();

    // Capture connection handler
    mockDustNamespace.on.mockImplementation(
      (event: string, handler: (socket: typeof mockSocket) => void) => {
        if (event === "connection") {
          connectionHandler = handler;
        }
      }
    );

    // Mock the main io.of() to return our mock namespace
    const mockIo = {
      of: vi.fn(() => mockDustNamespace),
      sockets: { adapter: { rooms: new Map() } },
      to: vi.fn(() => ({ emit: vi.fn() })),
    };
    globalValues.socketio = mockIo as never;

    // Import setupDustNamespace fresh
    const { setupDustNamespace } = await import("server/dust/v1/sockets-dust");
    setupDustNamespace(mockIo as never);

    // Invoke connection handler with our mock socket
    connectionHandler(mockSocket);
  });

  describe("connection", () => {
    it("tracks the visitor as soon as it connects, before any missionJoin", () => {
      expect(globalValues.dustV1.visitorData[mockSocket.id]).toEqual({
        socketId: mockSocket.id,
        name: "unknown",
        connectedAt: expect.any(Number),
        missionIds: [],
      });
    });
  });

  describe("missionJoin", () => {
    it("joins the correct room and records the mission and name on the visitor", () => {
      const connectedAt = globalValues.dustV1.visitorData[mockSocket.id].connectedAt;
      const visitor: DustVisitor = {
        socketId: "client-supplied-id",
        name: "Vitest TestDust",
        connectedAt: 0,
      };

      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      expect(mockSocket.join).toHaveBeenCalledWith(getDustSocketRoomName(MISSION_ID));
      expect(globalValues.dustV1.visitorData[mockSocket.id]).toEqual({
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt,
        missionIds: [MISSION_ID],
      });
    });

    it("does not duplicate the mission on rejoin and updates the name", () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };

      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);
      mockSocket._handlers["missionJoin"](MISSION_ID, {
        ...visitor,
        name: "Vitest TestDust Updated",
      });

      const tracked = globalValues.dustV1.visitorData[mockSocket.id];
      expect(tracked.missionIds).toEqual([MISSION_ID]);
      expect(tracked.name).toBe("Vitest TestDust Updated");
    });

    it("records several joined missions on one visitor", () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };

      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);
      mockSocket._handlers["missionJoin"](MISSION_ID + 1, visitor);

      expect(globalValues.dustV1.visitorData[mockSocket.id].missionIds).toEqual([
        MISSION_ID,
        MISSION_ID + 1,
      ]);
    });

    it("does nothing when missionId is invalid", () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };

      mockSocket._handlers["missionJoin"](null, visitor);

      expect(mockSocket.join).not.toHaveBeenCalledWith(getDustSocketRoomName(null));
    });

    it("calls the callback with a success response when the join succeeds", async () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };
      const callback = vi.fn();

      await mockSocket._handlers["missionJoin"](MISSION_ID, visitor, callback);

      expect(callback).toHaveBeenCalledWith({
        status: "success",
        message: expect.any(String),
      });
    });

    it("calls the callback with an error response when missionId is invalid", () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };
      const callback = vi.fn();

      mockSocket._handlers["missionJoin"](null, visitor, callback);

      expect(callback).toHaveBeenCalledWith({
        status: "error",
        message: expect.any(String),
      });
    });

    it("does not throw when no callback is provided", () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };

      expect(() => mockSocket._handlers["missionJoin"](MISSION_ID, visitor)).not.toThrow();
    });

    it("attaches the automerge doc listener for the mission", async () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };

      await mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      expect(mockAddDustDocListenerForMission).toHaveBeenCalledWith(MISSION_ID);
    });

    it("calls back with an error and undoes the join when listener setup fails", async () => {
      const { serverLogger } = await import("utils/logging/serverLogger");
      vi.spyOn(serverLogger, "error").mockImplementation(() => {});
      mockAddDustDocListenerForMission.mockRejectedValueOnce(new Error("db down"));

      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };
      const callback = vi.fn();

      await mockSocket._handlers["missionJoin"](MISSION_ID, visitor, callback);

      expect(callback).toHaveBeenCalledWith({
        status: "error",
        message: expect.any(String),
      });
      expect(mockSocket.leave).toHaveBeenCalledWith(getDustSocketRoomName(MISSION_ID));
      // The visitor stays tracked as connected, without the failed mission
      expect(globalValues.dustV1.visitorData[mockSocket.id].missionIds).toEqual([]);
    });

    it("succeeds on a retry after a failed setup attempt", async () => {
      const { serverLogger } = await import("utils/logging/serverLogger");
      vi.spyOn(serverLogger, "error").mockImplementation(() => {});
      mockAddDustDocListenerForMission.mockRejectedValueOnce(new Error("transient"));

      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };

      const firstCallback = vi.fn();
      await mockSocket._handlers["missionJoin"](MISSION_ID, visitor, firstCallback);
      expect(firstCallback).toHaveBeenCalledWith({ status: "error", message: expect.any(String) });

      const secondCallback = vi.fn();
      await mockSocket._handlers["missionJoin"](MISSION_ID, visitor, secondCallback);

      expect(secondCallback).toHaveBeenCalledWith({
        status: "success",
        message: expect.any(String),
      });
      expect(globalValues.dustV1.visitorData[mockSocket.id].missionIds).toEqual([MISSION_ID]);
    });

    it("emits inspectorUpdate after the visitor joins", async () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };
      const emitFn = vi.fn();
      (globalValues.socketio as never as { to: ReturnType<typeof vi.fn> }).to = vi.fn(() => ({
        emit: emitFn,
      }));

      await mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      expect(globalValues.socketio.to).toHaveBeenCalledWith("inspector");
      expect(emitFn).toHaveBeenCalledWith("inspectorUpdate", globalValues.serverSocketStatus);
    });
  });

  describe("disconnect", () => {
    it("removes the socket from dust visitors", () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      mockSocket._handlers["disconnect"]();

      expect(globalValues.dustV1.visitorData[mockSocket.id]).toBeUndefined();
    });

    it("removes a visitor that never joined a mission", () => {
      mockSocket._handlers["disconnect"]();

      expect(globalValues.dustV1.visitorData[mockSocket.id]).toBeUndefined();
    });

    it("calls cleanupDust when the room becomes empty on disconnect", () => {
      // Simulate a doc listener exists for this mission
      const removeListenerFn = vi.fn();
      globalValues.dustV1.docListeners.set(MISSION_ID, removeListenerFn);
      globalValues.dustV1.docHandles.set(MISSION_ID, { doc: vi.fn() } as never);

      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      // Disconnect — room becomes empty
      mockSocket._handlers["disconnect"]();

      expect(removeListenerFn).toHaveBeenCalled();
      expect(globalValues.dustV1.docListeners.has(MISSION_ID)).toBe(false);
    });

    it("does NOT call cleanupDust when other visitors remain in the room", () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      // Add a second visitor manually so the mission still has a visitor after disconnect
      trackVisitor("other-socket-id", [MISSION_ID]);

      // Simulate a doc listener
      const removeListenerFn = vi.fn();
      globalValues.dustV1.docListeners.set(MISSION_ID, removeListenerFn);

      // Disconnect — room still has otherVisitor
      mockSocket._handlers["disconnect"]();

      expect(removeListenerFn).not.toHaveBeenCalled();
      expect(Object.keys(globalValues.dustV1.visitorData)).toEqual(["other-socket-id"]);
    });

    it("emits inspectorUpdate after disconnect", () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      const emitFn = vi.fn();
      (globalValues.socketio as never as { to: ReturnType<typeof vi.fn> }).to = vi.fn(() => ({
        emit: emitFn,
      }));

      mockSocket._handlers["disconnect"]();

      expect(globalValues.socketio.to).toHaveBeenCalledWith("inspector");
      expect(emitFn).toHaveBeenCalledWith("inspectorUpdate", globalValues.serverSocketStatus);
    });
  });

  // ─── Auth middleware ───────────────────────────────────────────────────────

  describe("auth middleware", () => {
    it("allows connection when the dust token is valid", () => {
      const middleware = mockDustNamespace.use.mock.calls[0][0];
      const socket = { handshake: { auth: { token: "validDustToken" } } };
      const next = vi.fn();
      vi.mocked(dustTokenIsValid).mockReturnValue(true);
      vi.mocked(emssTokenIsValid).mockReturnValue(false);
      middleware(socket, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("allows connection when the emss master token is valid, even if the dust token is not", () => {
      const middleware = mockDustNamespace.use.mock.calls[0][0];
      const socket = { handshake: { auth: { token: "validEmssToken" } } };
      const next = vi.fn();
      vi.mocked(dustTokenIsValid).mockReturnValue(false);
      vi.mocked(emssTokenIsValid).mockReturnValue(true);
      middleware(socket, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("rejects connection when neither token is valid", () => {
      const middleware = mockDustNamespace.use.mock.calls[0][0];
      const socket = { handshake: { auth: { token: "badToken" } } };
      const next = vi.fn();
      vi.mocked(dustTokenIsValid).mockReturnValue(false);
      vi.mocked(emssTokenIsValid).mockReturnValue(false);
      middleware(socket, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ─── getEverything ─────────────────────────────────────────────────────────

  describe("getEverything", () => {
    it("calls back with every rex payload for the mission", async () => {
      const data: DustPosEntriesUpdate[] = [
        {
          missionId: MISSION_ID,
          missionName: "Vitest Mission",
          rexUuid: "rex-1",
          rexName: "Vitest Rex",
          evaUuid: "eva-1",
          evaName: "Vitest EVA",
          posEntries: [],
        },
      ];
      mockBuildDustEverything.mockResolvedValue(data);
      const callback = vi.fn();

      await mockSocket._handlers["getEverything"](MISSION_ID, callback);

      expect(mockBuildDustEverything).toHaveBeenCalledWith(MISSION_ID);
      expect(callback).toHaveBeenCalledWith({
        status: "success",
        message: "Everything retrieved",
        data,
      });
    });

    it("calls back with success and an empty list when the mission has no rexes", async () => {
      mockBuildDustEverything.mockResolvedValue([]);
      const callback = vi.fn();

      await mockSocket._handlers["getEverything"](MISSION_ID, callback);

      expect(callback).toHaveBeenCalledWith({
        status: "success",
        message: "Everything retrieved",
        data: [],
      });
    });

    it("returns an error for a null missionId without building anything", async () => {
      const callback = vi.fn();

      await mockSocket._handlers["getEverything"](null, callback);

      expect(callback).toHaveBeenCalledWith({ status: "error", message: expect.any(String) });
      expect(mockBuildDustEverything).not.toHaveBeenCalled();
    });

    it("returns an error for a NaN missionId", async () => {
      const callback = vi.fn();

      await mockSocket._handlers["getEverything"](NaN, callback);

      expect(callback).toHaveBeenCalledWith({ status: "error", message: expect.any(String) });
      expect(mockBuildDustEverything).not.toHaveBeenCalled();
    });

    it("returns an error when building the payload fails", async () => {
      const { serverLogger } = await import("utils/logging/serverLogger");
      vi.spyOn(serverLogger, "error").mockImplementation(() => {});
      mockBuildDustEverything.mockRejectedValue(new Error("doc unavailable"));
      const callback = vi.fn();

      await mockSocket._handlers["getEverything"](MISSION_ID, callback);

      expect(callback).toHaveBeenCalledWith({
        status: "error",
        message: expect.stringContaining("doc unavailable"),
      });
    });

    it("does not require the caller to have joined the mission first", async () => {
      mockBuildDustEverything.mockResolvedValue([]);
      const callback = vi.fn();

      await mockSocket._handlers["getEverything"](MISSION_ID, callback);

      expect(globalValues.dustV1.visitorData[mockSocket.id].missionIds).toEqual([]);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
    });
  });

  // ─── getRexEvas / getPosEntries ────────────────────────────────────────────

  describe("getRexEvas", () => {
    it("calls back with every rex EVA on the mission", async () => {
      const data = [
        { evaName: "Vitest EVA", evaUuid: "eva-1", rexName: "Vitest Rex", rexUuid: "rex-1" },
      ];
      mockGetRexEvasForDust.mockResolvedValue(data);
      const callback = vi.fn();

      await mockSocket._handlers["getRexEvas"](MISSION_ID, callback);

      expect(mockGetRexEvasForDust).toHaveBeenCalledWith(MISSION_ID);
      expect(callback).toHaveBeenCalledWith({
        status: "success",
        message: "Rex EVAs retrieved",
        data,
      });
    });

    it("returns an error for an invalid missionId", async () => {
      const callback = vi.fn();

      await mockSocket._handlers["getRexEvas"](NaN, callback);

      expect(callback).toHaveBeenCalledWith({ status: "error", message: expect.any(String) });
      expect(mockGetRexEvasForDust).not.toHaveBeenCalled();
    });

    it("returns an error when the mission cannot be loaded", async () => {
      const { serverLogger } = await import("utils/logging/serverLogger");
      vi.spyOn(serverLogger, "error").mockImplementation(() => {});
      mockGetRexEvasForDust.mockRejectedValue(new Error("Mission 9999 not found"));
      const callback = vi.fn();

      await mockSocket._handlers["getRexEvas"](MISSION_ID, callback);

      expect(callback).toHaveBeenCalledWith({
        status: "error",
        message: expect.stringContaining("not found"),
      });
    });
  });

  describe("getPosEntries", () => {
    it("calls back with the payload for the requested rex", async () => {
      const data: DustPosEntriesUpdate = {
        missionId: MISSION_ID,
        missionName: "Vitest Mission",
        rexUuid: "rex-1",
        rexName: "Vitest Rex",
        evaUuid: "eva-1",
        evaName: "Vitest EVA",
        posEntries: [],
      };
      mockGetPosEntriesForDust.mockResolvedValue(data);
      const callback = vi.fn();

      await mockSocket._handlers["getPosEntries"](MISSION_ID, "rex-1", callback);

      expect(mockGetPosEntriesForDust).toHaveBeenCalledWith(MISSION_ID, "rex-1");
      expect(callback).toHaveBeenCalledWith({
        status: "success",
        message: "Pos entries retrieved",
        data,
      });
    });

    it("returns an error when the rex is not on the mission", async () => {
      mockGetPosEntriesForDust.mockResolvedValue(null);
      const callback = vi.fn();

      await mockSocket._handlers["getPosEntries"](MISSION_ID, "missing-rex", callback);

      expect(callback).toHaveBeenCalledWith({
        status: "error",
        message: expect.stringContaining("not found"),
      });
    });

    it.each([
      [NaN, "rex-1"],
      [MISSION_ID, ""],
      [MISSION_ID, undefined],
    ])("returns an error for missionId %s and rexUuid %s", async (missionId, rexUuid) => {
      const callback = vi.fn();

      await mockSocket._handlers["getPosEntries"](missionId, rexUuid, callback);

      expect(callback).toHaveBeenCalledWith({ status: "error", message: expect.any(String) });
      expect(mockGetPosEntriesForDust).not.toHaveBeenCalled();
    });
  });

  // ─── getDebugInfo ──────────────────────────────────────────────────────────

  describe("getDebugInfo", () => {
    it("calls back with the visitor and doc listener summary", () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);
      globalValues.dustV1.docListeners.set(MISSION_ID, vi.fn());

      const callback = vi.fn();
      mockSocket._handlers["getDebugInfo"](callback);

      expect(callback).toHaveBeenCalledWith({
        visitors: [
          {
            socketId: mockSocket.id,
            name: "Vitest TestDust",
            connectedAt: globalValues.dustV1.visitorData[mockSocket.id].connectedAt,
            missionIds: [MISSION_ID],
          },
        ],
        docListenerMissionIds: [MISSION_ID],
      });
    });

    it("lists a connected visitor that has not joined a mission", () => {
      const callback = vi.fn();
      mockSocket._handlers["getDebugInfo"](callback);

      expect(callback).toHaveBeenCalledWith({
        visitors: [
          {
            socketId: mockSocket.id,
            name: "unknown",
            connectedAt: expect.any(Number),
            missionIds: [],
          },
        ],
        docListenerMissionIds: [],
      });
    });
  });
});
