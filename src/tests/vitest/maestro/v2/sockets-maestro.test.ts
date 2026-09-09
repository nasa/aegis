import { globalValues } from "server/express/global";
import { v4 as uuidv4 } from "uuid";

// ── Mocks ────────────────────────────────────────────────────────────────────

// vi.hoisted ensures these are available when vi.mock factories run (hoisted to top)
const {
  mockAddMaestroDocListenerForMission,
  mockBuildAegisSliceForMaestro,
  mockOpUpdateMdau,
  mockGetAutomergeDocListing,
  mockGetAutomergeMissions,
} = vi.hoisted(() => ({
  mockAddMaestroDocListenerForMission: vi.fn().mockResolvedValue(undefined),
  mockBuildAegisSliceForMaestro: vi.fn(),
  mockOpUpdateMdau: vi.fn(),
  mockGetAutomergeDocListing: vi.fn(),
  mockGetAutomergeMissions: vi.fn(),
}));

// Mock socket emits
vi.mock("server/express/sockets", async () => {
  const actual = await vi.importActual("server/express/sockets");
  return { ...actual, emitStoreUpsert: vi.fn(), emitStoreDelete: vi.fn() };
});

// Mock addMaestroDocListenerForMission to avoid DB calls from automerge doc listing
vi.mock("server/maestro/v2/sockets-maestro-emitters", async () => {
  const actual = await vi.importActual("server/maestro/v2/sockets-maestro-emitters");
  return {
    ...actual,
    addMaestroDocListenerForMission: mockAddMaestroDocListenerForMission,
  };
});

// Mock opUpdateMdau from its actual source module,
// since sockets-maestro.ts imports it directly from there
vi.mock("server/maestro/v2/operations/op-mdau", async () => {
  const actual = await vi.importActual("server/maestro/v2/operations/op-mdau");
  return { ...actual, opUpdateMdau: mockOpUpdateMdau };
});

// Mock buildAegisSliceForMaestro from its actual source module,
// since sockets-maestro.ts imports it directly from there
vi.mock("server/maestro/v2/buildAegisSlice", async () => {
  const actual = await vi.importActual("server/maestro/v2/buildAegisSlice");
  return { ...actual, buildAegisSliceForMaestro: mockBuildAegisSliceForMaestro };
});

vi.mock("utils/permissions", () => ({
  emssTokenIsValid: vi.fn().mockReturnValue(true),
}));

vi.mock("server/express/routes/docListing", () => ({
  getAutomergeDocListing: mockGetAutomergeDocListing,
}));

vi.mock("server/express/routes/missionAutomerge", async () => {
  const actual = await vi.importActual("server/express/routes/missionAutomerge");
  return { ...actual, getAutomergeMissions: mockGetAutomergeMissions };
});

// Make RequestContext.create a pass-through so we don't need a real ORM in these unit tests
vi.mock("@mikro-orm/postgresql", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    RequestContext: {
      create: vi.fn().mockImplementation((_em: unknown, fn: () => unknown) => fn()),
    },
  };
});

import { getMaestroSocketRoomName } from "server/maestro/v2/sockets-maestro";
import { emssTokenIsValid } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import type { AegisSlice } from "server/maestro/v2/types/aegisSlice";
import type { MaestroVisitor } from "server/maestro/v2/types/socketioMaestro";
import type { MDAU } from "server/maestro/v2/types/mdau";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MISSION_ID = 9999;

// Shared mutable EVA registry used by the mockGetAutomergeMissions implementation.
// Tests populate this with { [evaUuid]: { uuid, refUuid } } entries before calling handlers.
let evaRegistry: Record<string, { uuid: string; refUuid: string }> = {};

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

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply mock implementations after clearAllMocks so module-level mocks still resolve
  mockAddMaestroDocListenerForMission.mockResolvedValue(undefined);
  mockOpUpdateMdau.mockReturnValue(undefined);
  // Provide automerge infrastructure mocks globally so the real addMaestroDocListenerForMission
  // won't throw if it is called (circular dep between sockets-maestro and sockets-maestro-emitters
  // can cause the vi.mock factory not to intercept it in sockets-maestro.ts).
  const defaultDocHandle = {
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
  };
  globalValues.automergeRepo = { find: vi.fn().mockResolvedValue(defaultDocHandle) } as never;
  mockGetAutomergeDocListing.mockResolvedValue([{ automergeUrl: "automerge://default-url" }]);
  // Mock em.fork() so getEvaUuid resolves evaRefUuid directly as the evaUuid.
  const mockEm = {
    find: vi.fn().mockImplementation((_entity: unknown, where: Record<string, unknown>) => {
      // For Rex_db lookup (evaUuid: { $in: [...] }) return empty — no rexes exist
      if (where?.evaUuid) return Promise.resolve([]);
      // For Eva_db lookup by refUuid, return a fake eva whose uuid === refUuid
      const refUuid = where?.refUuid as string | undefined;
      if (refUuid) return Promise.resolve([{ uuid: refUuid }]);
      return Promise.resolve([]);
    }),
    findOne: vi.fn().mockResolvedValue(null),
  };
  globalValues.orm = { em: { fork: vi.fn().mockReturnValue(mockEm) } } as never;
  globalValues.maestroV2.evaSubscriptions = new Map();
  globalValues.maestroV2.socketio = null;
  globalValues.maestroV2.docListeners = new Map();
  globalValues.maestroV2.visitorData = {};
  globalValues.maestroV2.docHandles = new Map();
  // Configure getAutomergeMissions to return a mission whose evas registry is
  // built from a shared mutable object that tests can populate before calling handlers.
  evaRegistry = {};
  mockGetAutomergeMissions.mockImplementation(() =>
    Promise.resolve([{ evas: evaRegistry, rexes: {} }])
  );
});

// ─── setupMaestroNamespace socket handlers ───────────────────────────────────

describe("maestro namespace socket handlers", () => {
  let mockSocket: {
    join: ReturnType<typeof vi.fn>;
    leave: ReturnType<typeof vi.fn>;
    id: string;
    handshake: { auth: { token: string } };
    on: ReturnType<typeof vi.fn>;
    _handlers: Record<string, (...args: unknown[]) => void>;
  };
  let mockMaestroNamespace: ReturnType<typeof createMockMaestroNamespace>;
  let connectionHandler: (socket: typeof mockSocket) => void;

  beforeEach(async () => {
    // Reset globals
    globalValues.maestroV2.evaSubscriptions = new Map();
    globalValues.maestroV2.socketio = null;
    globalValues.maestroV2.docListeners = new Map();
    globalValues.maestroV2.visitorData = {};

    mockSocket = {
      join: vi.fn(),
      leave: vi.fn(),
      id: `socket-${uuidv4()}`,
      handshake: { auth: { token: "validToken" } },
      on: vi.fn(),
      _handlers: {},
    };
    // Capture handlers registered via socket.on
    mockSocket.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      mockSocket._handlers[event] = handler;
    });

    mockMaestroNamespace = createMockMaestroNamespace();

    // Capture connection handler
    mockMaestroNamespace.on.mockImplementation(
      (event: string, handler: (socket: typeof mockSocket) => void) => {
        if (event === "connection") {
          connectionHandler = handler;
        }
      }
    );

    // Mock the main io.of() to return our mock namespace
    const mockIo = {
      of: vi.fn(() => mockMaestroNamespace),
      sockets: { adapter: { rooms: new Map() } },
      to: vi.fn(() => ({ emit: vi.fn() })),
    };
    globalValues.socketio = mockIo as never;

    // Import setupMaestroNamespace fresh
    const { setupMaestroNamespace } = await import("server/maestro/v2/sockets-maestro");
    setupMaestroNamespace(mockIo as never);

    // Invoke connection handler with our mock socket
    connectionHandler(mockSocket);
  });

  describe("missionJoin", () => {
    it("joins the correct room and tracks the visitor", () => {
      const visitor: MaestroVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };

      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      expect(mockSocket.join).toHaveBeenCalledWith(getMaestroSocketRoomName(MISSION_ID));
      const visitors = globalValues.maestroV2.visitorData[MISSION_ID];
      expect(visitors).toHaveLength(1);
      expect(visitors[0].socketId).toBe(mockSocket.id);
    });

    it("replaces existing visitor with same socketId on rejoin", () => {
      const visitor: MaestroVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };

      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);
      mockSocket._handlers["missionJoin"](MISSION_ID, {
        ...visitor,
        name: "Vitest TestMaestro Updated",
      });

      const visitors = globalValues.maestroV2.visitorData[MISSION_ID];
      expect(visitors).toHaveLength(1);
      expect(visitors[0].name).toBe("Vitest TestMaestro Updated");
    });
  });

  describe("subscribeToEva", () => {
    it("adds EVA refUuid to evaSubscriptions for the mission", async () => {
      const evaRefUuid = uuidv4();
      evaRegistry[evaRefUuid] = { uuid: evaRefUuid, refUuid: evaRefUuid };
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid, null);

      const subs = globalValues.maestroV2.evaSubscriptions.get(MISSION_ID);
      expect(subs).toContain(evaRefUuid);
    });

    it("does not duplicate EVA refUuid on repeated subscribe", async () => {
      const evaRefUuid = uuidv4();
      evaRegistry[evaRefUuid] = { uuid: evaRefUuid, refUuid: evaRefUuid };
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid, null);
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid, null);

      const subs = globalValues.maestroV2.evaSubscriptions.get(MISSION_ID);
      expect(subs.filter((u: string) => u === evaRefUuid)).toHaveLength(1);
    });

    it("supports multiple EVA subscriptions for the same mission", async () => {
      const evaRefUuid1 = uuidv4();
      const evaRefUuid2 = uuidv4();
      evaRegistry[evaRefUuid1] = { uuid: evaRefUuid1, refUuid: evaRefUuid1 };
      evaRegistry[evaRefUuid2] = { uuid: evaRefUuid2, refUuid: evaRefUuid2 };
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid1, null);
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid2, null);

      const subs = globalValues.maestroV2.evaSubscriptions.get(MISSION_ID);
      expect(subs).toHaveLength(2);
      expect(subs).toContain(evaRefUuid1);
      expect(subs).toContain(evaRefUuid2);
    });

    it("calls the callback with a success response when the eva is found", async () => {
      const evaRefUuid = uuidv4();
      evaRegistry[evaRefUuid] = { uuid: evaRefUuid, refUuid: evaRefUuid };
      const callback = vi.fn();

      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid, null, callback);

      expect(callback).toHaveBeenCalledWith({ status: "success" });
    });

    it("calls the callback with an error response when the eva cannot be resolved", async () => {
      const evaRefUuid = uuidv4();
      // Not added to evaRegistry, so getEvaUuid will fail to resolve it
      const callback = vi.fn();

      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid, null, callback);

      expect(callback).toHaveBeenCalledWith({
        status: "error",
        message: expect.any(String),
      });
      const subs = globalValues.maestroV2.evaSubscriptions.get(MISSION_ID);
      expect(subs ?? []).not.toContain(evaRefUuid);
    });

    it("does not throw when no callback is provided", async () => {
      const evaRefUuid = uuidv4();
      evaRegistry[evaRefUuid] = { uuid: evaRefUuid, refUuid: evaRefUuid };

      await expect(
        mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid, null)
      ).resolves.not.toThrow();
    });
  });

  describe("unsubscribeToEva", () => {
    it("removes the EVA refUuid from subscriptions", async () => {
      const evaRefUuid = uuidv4();
      // evaSubscriptions stores the resolved evaUuid; via our mock, that equals evaRefUuid
      evaRegistry[evaRefUuid] = { uuid: evaRefUuid, refUuid: evaRefUuid };
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaRefUuid]);

      await mockSocket._handlers["unsubscribeToEva"](MISSION_ID, evaRefUuid, null);

      const subs = globalValues.maestroV2.evaSubscriptions.get(MISSION_ID);
      expect(subs).toBeUndefined();
    });

    it("deletes the mission entry when last subscription is removed", async () => {
      const evaRefUuid = uuidv4();
      evaRegistry[evaRefUuid] = { uuid: evaRefUuid, refUuid: evaRefUuid };
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaRefUuid]);

      await mockSocket._handlers["unsubscribeToEva"](MISSION_ID, evaRefUuid, null);

      expect(globalValues.maestroV2.evaSubscriptions.has(MISSION_ID)).toBe(false);
    });

    it("only removes the specified EVA when multiple are subscribed", async () => {
      const evaRefUuid1 = uuidv4();
      const evaRefUuid2 = uuidv4();
      evaRegistry[evaRefUuid1] = { uuid: evaRefUuid1, refUuid: evaRefUuid1 };
      evaRegistry[evaRefUuid2] = { uuid: evaRefUuid2, refUuid: evaRefUuid2 };
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaRefUuid1, evaRefUuid2]);

      await mockSocket._handlers["unsubscribeToEva"](MISSION_ID, evaRefUuid1, null);

      const subs = globalValues.maestroV2.evaSubscriptions.get(MISSION_ID);
      expect(subs).not.toContain(evaRefUuid1);
      expect(subs).toContain(evaRefUuid2);
      expect(subs).toHaveLength(1);
    });

    it("does nothing when there are no subscriptions for the mission", async () => {
      await expect(
        mockSocket._handlers["unsubscribeToEva"](MISSION_ID, uuidv4(), null)
      ).resolves.not.toThrow();
    });
  });

  describe("missionLeave", () => {
    it("calls socket.leave with the correct room name", () => {
      const visitor: MaestroVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      mockSocket._handlers["missionLeave"](MISSION_ID);

      expect(mockSocket.leave).toHaveBeenCalledWith(getMaestroSocketRoomName(MISSION_ID));
    });

    it("removes the visitor from maestroVisitors", () => {
      const visitor: MaestroVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      mockSocket._handlers["missionLeave"](MISSION_ID);

      // Entry is deleted (not left as empty array) so subsequent disconnects
      // don't re-trigger cleanupMaestro on a stale empty entry.
      expect(globalValues.maestroV2.visitorData[MISSION_ID]).toBeUndefined();
    });

    it("calls removeMaestroDocListener when room becomes empty on missionLeave", () => {
      const removeListenerFn = vi.fn();
      globalValues.maestroV2.docListeners.set(MISSION_ID, removeListenerFn);

      const visitor: MaestroVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      mockSocket._handlers["missionLeave"](MISSION_ID);

      expect(removeListenerFn).toHaveBeenCalled();
      expect(globalValues.maestroV2.docListeners.has(MISSION_ID)).toBe(false);
    });

    it("does NOT call removeMaestroDocListener when other visitors remain in the room", () => {
      const visitor: MaestroVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      // Add a second visitor manually so the room is not empty after leave
      const otherVisitor: MaestroVisitor = {
        socketId: "other-socket-id",
        name: "Vitest OtherMaestro",
        connectedAt: Date.now(),
      };
      globalValues.maestroV2.visitorData[MISSION_ID].push(otherVisitor);

      const removeListenerFn = vi.fn();
      globalValues.maestroV2.docListeners.set(MISSION_ID, removeListenerFn);

      mockSocket._handlers["missionLeave"](MISSION_ID);

      expect(removeListenerFn).not.toHaveBeenCalled();
      expect(globalValues.maestroV2.visitorData[MISSION_ID]).toHaveLength(1);
      expect(globalValues.maestroV2.visitorData[MISSION_ID][0].socketId).toBe("other-socket-id");
    });

    it("emits inspectorUpdate after the visitor leaves", () => {
      const visitor: MaestroVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      const emitFn = vi.fn();
      (globalValues.socketio as never as { to: ReturnType<typeof vi.fn> }).to = vi.fn(() => ({
        emit: emitFn,
      }));

      mockSocket._handlers["missionLeave"](MISSION_ID);

      expect(globalValues.socketio.to).toHaveBeenCalledWith("inspector");
      expect(emitFn).toHaveBeenCalledWith("inspectorUpdate", globalValues.serverSocketStatus);
    });

    it("does nothing when maestroVisitors has no entry for the room", () => {
      // missionLeave for a mission that was never joined — should not throw
      expect(() => {
        mockSocket._handlers["missionLeave"](MISSION_ID);
      }).not.toThrow();
    });
  });

  describe("disconnect", () => {
    it("removes the socket from maestroVisitors", () => {
      const visitor: MaestroVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      // Verify visitor is tracked
      expect(globalValues.maestroV2.visitorData[MISSION_ID]).toHaveLength(1);

      // Disconnect
      mockSocket._handlers["disconnect"]();

      // Entry is deleted (not left as empty array) so subsequent disconnects
      // don't re-trigger cleanupMaestro on a stale empty entry.
      expect(globalValues.maestroV2.visitorData[MISSION_ID]).toBeUndefined();
    });

    it("calls removeMaestroDocListener when room becomes empty on disconnect", () => {
      // Simulate a doc listener exists for this mission
      const removeListenerFn = vi.fn();
      globalValues.maestroV2.docListeners.set(MISSION_ID, removeListenerFn);

      const visitor: MaestroVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      // Disconnect — room becomes empty
      mockSocket._handlers["disconnect"]();

      expect(removeListenerFn).toHaveBeenCalled();
      expect(globalValues.maestroV2.docListeners.has(MISSION_ID)).toBe(false);
    });

    it("does NOT call removeMaestroDocListener when other visitors remain in the room", () => {
      const visitor: MaestroVisitor = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      // Add a second visitor manually so the room is not empty after disconnect
      const otherVisitor: MaestroVisitor = {
        socketId: "other-socket-id",
        name: "Vitest OtherMaestro",
        connectedAt: Date.now(),
      };
      globalValues.maestroV2.visitorData[MISSION_ID].push(otherVisitor);

      // Simulate a doc listener
      const removeListenerFn = vi.fn();
      globalValues.maestroV2.docListeners.set(MISSION_ID, removeListenerFn);

      // Disconnect — room still has otherVisitor
      mockSocket._handlers["disconnect"]();

      expect(removeListenerFn).not.toHaveBeenCalled();
      expect(globalValues.maestroV2.visitorData[MISSION_ID]).toHaveLength(1);
      expect(globalValues.maestroV2.visitorData[MISSION_ID][0].socketId).toBe("other-socket-id");
    });
  });

  // ─── Auth middleware ───────────────────────────────────────────────────────

  describe("auth middleware", () => {
    it("allows connection when token is valid", () => {
      const middleware = mockMaestroNamespace.use.mock.calls[0][0];
      const socket = { handshake: { auth: { token: "validToken" } } };
      const next = vi.fn();
      vi.mocked(emssTokenIsValid).mockReturnValue(true);
      middleware(socket, next);
      expect(next).toHaveBeenCalledWith();
    });

    it("rejects connection when token is invalid", () => {
      const middleware = mockMaestroNamespace.use.mock.calls[0][0];
      const socket = { handshake: { auth: { token: "badToken" } } };
      const next = vi.fn();
      vi.mocked(emssTokenIsValid).mockReturnValue(false);
      middleware(socket, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ─── getEverything ──────────────────────────────────────────────────────────

  describe("getEverything", () => {
    it("returns failure for null missionId", async () => {
      const callback = vi.fn();
      await mockSocket._handlers["getEverything"](null, callback);
      expect(callback).toHaveBeenCalledWith({ status: "failure", message: "Invalid mission ID" });
    });

    it("returns failure for NaN missionId", async () => {
      const callback = vi.fn();
      await mockSocket._handlers["getEverything"](NaN, callback);
      expect(callback).toHaveBeenCalledWith({ status: "failure", message: "Invalid mission ID" });
    });

    it("calls callback with success when data is retrieved", async () => {
      const aegisSlice = { aegisMissions: {}, aegisEvas: {} } as AegisSlice.AegisSlice;
      mockBuildAegisSliceForMaestro.mockResolvedValue(aegisSlice);
      const callback = vi.fn();
      await mockSocket._handlers["getEverything"](MISSION_ID, callback);
      expect(mockBuildAegisSliceForMaestro).toHaveBeenCalledWith(MISSION_ID);
      expect(callback).toHaveBeenCalledWith({
        status: "success",
        message: "Everything retrieved",
        data: aegisSlice,
      });
    });

    it("calls callback with error when retrieval fails", async () => {
      mockBuildAegisSliceForMaestro.mockRejectedValue(new Error("build error"));
      const callback = vi.fn();
      await mockSocket._handlers["getEverything"](MISSION_ID, callback);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "error",
          message: expect.stringContaining("build error"),
        })
      );
    });
  });

  // ─── sendMDAU ─────────────────────────────────────────────────────────────

  describe("sendMDAU", () => {
    // A minimal doc handle registered for MISSION_ID so the sendMDAU handler
    // can resolve one. Only the sendMDAU tests need this; the subscribe/eva
    // tests intentionally rely on an empty docHandles map.
    const sendMdauDocHandle = { doc: vi.fn().mockReturnValue({}) };
    beforeEach(() => {
      globalValues.maestroV2.docHandles.set(MISSION_ID, sendMdauDocHandle as never);
    });

    it("does nothing when missionId is invalid", () => {
      mockSocket._handlers["sendMDAU"](null, { aegisStations: {} });
      expect(mockOpUpdateMdau).not.toHaveBeenCalled();
    });

    it("does nothing when missionId is NaN", () => {
      mockSocket._handlers["sendMDAU"](NaN, { aegisStations: {} });
      expect(mockOpUpdateMdau).not.toHaveBeenCalled();
    });

    it("does nothing when no doc handle is available for the mission", () => {
      globalValues.maestroV2.docHandles.delete(MISSION_ID);
      mockSocket._handlers["sendMDAU"](MISSION_ID, { aegisStations: {} });
      expect(mockOpUpdateMdau).not.toHaveBeenCalled();
    });

    it("calls opUpdateMdau with the resolved doc handle and the full mdau payload", () => {
      const mdau: MDAU.MaestroDataAegisUses = {
        aegisStations: {
          "ref-uuid-1": {
            refUuid: "ref-uuid-1",
            name: "Vitest Station",
            duration: 30,
            actionOrderRefUuids: null,
            updatedAt: Date.now(),
          },
        },
      };
      mockSocket._handlers["sendMDAU"](MISSION_ID, mdau);
      expect(mockOpUpdateMdau).toHaveBeenCalledWith(sendMdauDocHandle, MISSION_ID, mdau);
    });

    it("processes a fully-populated MDAU payload without logging any errors", async () => {
      // Build a full MDAU sample that exercises every top-level collection and
      // every field of every sub-type defined in MDAU.MaestroDataAegisUses.
      const now = Date.now();
      const stationRefUuid = "station-ref-1";
      const traverseRefUuid = "traverse-ref-1";
      const evaRefUuid = "eva-ref-1";
      const actionRefUuid = "action-ref-1";
      const rexUuid = "rex-uuid-1";

      const fullMdau: MDAU.MaestroDataAegisUses = {
        aegisStations: {
          [stationRefUuid]: {
            refUuid: stationRefUuid,
            name: "Vitest Full Station",
            duration: 42,
            actionOrderRefUuids: [actionRefUuid],
            updatedAt: now,
            rexUuid,
          },
        },
        aegisTraverse: {
          [traverseRefUuid]: {
            refUuid: traverseRefUuid,
            duration: 15,
            actionOrderRefUuids: null,
            updatedAt: now,
            rexUuid,
          },
        },
        aegisEva: {
          [evaRefUuid]: {
            refUuid: evaRefUuid,
            name: "Vitest Full EVA",
            maestroEventId: "maestro-event-1",
            maestroEventUrl: "https://maestro.example/events/1",
            sequenceRefUuids: [
              { type: "station", refUuid: stationRefUuid },
              { type: "traverse", refUuid: traverseRefUuid },
            ],
            datetime: now,
            updatedAt: now,
            rexUuid,
          },
        },
        aegisAction: {
          [actionRefUuid]: {
            refUuid: actionRefUuid,
            actors: ["EV1"],
            updatedAt: now,
            rexUuid,
          },
        },
        aegisRexes: {
          [rexUuid]: {
            uuid: rexUuid,
            petStartStopTimestamp: "2025-01-21T17:06:59.000Z",
            petValueAtStartStop: "+00:00:00",
            petRunning: true,
            isRunning: true,
            maestroControlled: true,
            updatedAt: now,
            maestroActivityPropertiesByRefUuid: {
              [stationRefUuid]: { color: "#ff0000", number: "1" },
              [traverseRefUuid]: { color: "#00ff00", number: "2" },
            },
            stationEntriesByRefUuid: {
              [stationRefUuid]: {
                rexStatus: "in-progress",
                maestroPercentCompleteEv1: 50,
                maestroPercentCompleteEv2: 25,
              },
            },
            traverseEntriesByRefUuid: {
              [traverseRefUuid]: {
                rexStatus: "pending",
                maestroPercentCompleteEv1: 0,
                maestroPercentCompleteEv2: 0,
              },
            },
            actionEntriesByRefUuid: {
              [actionRefUuid]: {
                rexStatus: "complete",
                markerId: "M-001",
                containerId: "C-001",
                secondaryContainerId: "C-002",
              },
            },
          },
        },
      };

      const errorSpy = vi.spyOn(serverLogger, "error").mockImplementation(() => {});

      // Handler is synchronous and delegates the full payload to opUpdateMdau;
      // invoking it must not throw.
      expect(() => mockSocket._handlers["sendMDAU"](MISSION_ID, fullMdau)).not.toThrow();

      expect(mockOpUpdateMdau).toHaveBeenCalledTimes(1);
      expect(mockOpUpdateMdau).toHaveBeenCalledWith(sendMdauDocHandle, MISSION_ID, fullMdau);
      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  // ─── getDebugInfo ──────────────────────────────────────────────────────────

  describe("getDebugInfo", () => {
    it("calls callback with debug info", () => {
      const callback = vi.fn();
      mockSocket._handlers["getDebugInfo"](callback);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          docListenerMissionIds: expect.any(Array),
          evaSubscriptions: expect.any(Object),
          visitors: expect.any(Object),
        })
      );
    });
  });
});
