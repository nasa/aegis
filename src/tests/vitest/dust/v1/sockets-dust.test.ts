import { globalValues } from "server/express/global";
import { v4 as uuidv4 } from "uuid";

// ── Mocks ────────────────────────────────────────────────────────────────────

// vi.hoisted ensures these are available when vi.mock factories run (hoisted to top)
const { mockAddDustDocListenerForMission, mockGetAutomergeDocListing } = vi.hoisted(() => ({
  mockAddDustDocListenerForMission: vi.fn().mockResolvedValue(undefined),
  mockGetAutomergeDocListing: vi.fn(),
}));

// Mock addDustDocListenerForMission to avoid DB calls from automerge doc listing
vi.mock("server/dust/v1/sockets-dust-emitters", async () => {
  const actual = await vi.importActual("server/dust/v1/sockets-dust-emitters");
  return {
    ...actual,
    addDustDocListenerForMission: mockAddDustDocListenerForMission,
  };
});

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
} from "server/dust/v1/sockets-dust";
import { dustTokenIsValid, emssTokenIsValid } from "utils/permissions";
import type { DustVisitor } from "server/dust/v1/types/socketioDust";

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

// ─── setupDustNamespace socket handlers ──────────────────────────────────────

describe("dust namespace socket handlers", () => {
  let mockSocket: {
    join: ReturnType<typeof vi.fn>;
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

  describe("missionJoin", () => {
    it("joins the correct room and tracks the visitor", () => {
      const visitor: DustVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestDust",
        connectedAt: Date.now(),
      };

      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      expect(mockSocket.join).toHaveBeenCalledWith(getDustSocketRoomName(MISSION_ID));
      const visitors = globalValues.dustV1.visitorData[MISSION_ID];
      expect(visitors).toHaveLength(1);
      expect(visitors[0].socketId).toBe(mockSocket.id);
    });

    it("replaces existing visitor with same socketId on rejoin", () => {
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

      const visitors = globalValues.dustV1.visitorData[MISSION_ID];
      expect(visitors).toHaveLength(1);
      expect(visitors[0].name).toBe("Vitest TestDust Updated");
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

      // Verify visitor is tracked
      expect(globalValues.dustV1.visitorData[MISSION_ID]).toHaveLength(1);

      // Disconnect
      mockSocket._handlers["disconnect"]();

      // Entry is deleted (not left as empty array) so subsequent disconnects
      // don't re-trigger cleanupDust on a stale empty entry.
      expect(globalValues.dustV1.visitorData[MISSION_ID]).toBeUndefined();
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

      // Add a second visitor manually so the room is not empty after disconnect
      const otherVisitor: DustVisitor = {
        socketId: "other-socket-id",
        name: "Vitest OtherDust",
        connectedAt: Date.now(),
      };
      globalValues.dustV1.visitorData[MISSION_ID].push(otherVisitor);

      // Simulate a doc listener
      const removeListenerFn = vi.fn();
      globalValues.dustV1.docListeners.set(MISSION_ID, removeListenerFn);

      // Disconnect — room still has otherVisitor
      mockSocket._handlers["disconnect"]();

      expect(removeListenerFn).not.toHaveBeenCalled();
      expect(globalValues.dustV1.visitorData[MISSION_ID]).toHaveLength(1);
      expect(globalValues.dustV1.visitorData[MISSION_ID][0].socketId).toBe("other-socket-id");
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
        visitors: {
          [MISSION_ID]: [
            {
              socketId: mockSocket.id,
              name: "Vitest TestDust",
              connectedAt: visitor.connectedAt,
            },
          ],
        },
        docListenerMissionIds: [MISSION_ID],
      });
    });

    it("returns empty visitors and docListenerMissionIds when nothing is tracked", () => {
      const callback = vi.fn();
      mockSocket._handlers["getDebugInfo"](callback);

      expect(callback).toHaveBeenCalledWith({
        visitors: {},
        docListenerMissionIds: [],
      });
    });
  });
});
