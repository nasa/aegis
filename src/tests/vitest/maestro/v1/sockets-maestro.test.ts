import { globalValues } from "server/express/global";
import { generateBlankRex } from "store/storeUtils/rex";
import { v4 as uuidv4 } from "uuid";

// ── Mocks ────────────────────────────────────────────────────────────────────

// vi.hoisted ensures these are available when vi.mock factories run (hoisted to top)
const {
  mockAddMaestroDocListenerForMission,
  mockBuildAegisSliceForMaestro,
  mockOverwriteRex,
  mockValidateRexOverwrite,
  mockGetAutomergeDocListing,
  mockGetAutomergeMissions,
} = vi.hoisted(() => ({
  mockAddMaestroDocListenerForMission: vi.fn().mockResolvedValue(undefined),
  mockBuildAegisSliceForMaestro: vi.fn(),
  mockOverwriteRex: vi.fn(),
  mockValidateRexOverwrite: vi.fn().mockReturnValue(null),
  mockGetAutomergeDocListing: vi.fn(),
  mockGetAutomergeMissions: vi.fn(),
}));

// Mock socket emits
vi.mock("server/express/sockets", async () => {
  const actual = await vi.importActual("server/express/sockets");
  return { ...actual, emitStoreUpsert: vi.fn(), emitStoreDelete: vi.fn() };
});

// Mock addMaestroDocListenerForMission to avoid DB calls from automerge doc listing
vi.mock("server/maestro/v1/sockets-maestro-emitters", async () => {
  const actual = await vi.importActual("server/maestro/v1/sockets-maestro-emitters");
  return {
    ...actual,
    addMaestroDocListenerForMission: mockAddMaestroDocListenerForMission,
  };
});

// Mock buildAegisSliceForMaestro from its actual source module (utils/maestro),
// since sockets-maestro.ts imports it directly from there
vi.mock("server/maestro/v1/maestro", async () => {
  const actual = await vi.importActual("server/maestro/v1/maestro");
  return { ...actual, buildAegisSliceForMaestro: mockBuildAegisSliceForMaestro };
});

vi.mock("server/maestro/v1/rexOverwrite", async () => {
  const actual = await vi.importActual("server/maestro/v1/rexOverwrite");
  return { ...actual, overwriteRex: mockOverwriteRex };
});

vi.mock("server/maestro/v1/rexOverwriteValidator", () => ({
  validateRexOverwrite: mockValidateRexOverwrite,
}));

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

import { getMaestroSocketRoomName } from "server/maestro/v1/sockets-maestro";
import { emssTokenIsValid } from "utils/permissions";
import type { AegisSlice } from "server/maestro/v1/types/aegisSlice";

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
  mockValidateRexOverwrite.mockReturnValue(null);
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
  // When rexUuid is null, getEvaUuid finds evas by refUuid then checks for rexes.
  // We make find() return [{uuid: refUuid}] for Eva_db and [] for Rex_db so
  // the as-planned eva is always found and its uuid equals the refUuid passed in.
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
  globalValues.maestroV1.evaSubscriptions = new Map();
  globalValues.maestroV1.socketio = null;
  globalValues.maestroV1.docListeners = new Map();
  globalValues.maestroV1.visitorData = {};
  // Configure getAutomergeMissions to return a mission whose evas registry is
  // built from a shared mutable object that tests can populate before calling handlers.
  // The evaRegistry is replaced each beforeEach so tests start with a clean slate.
  evaRegistry = {};
  mockGetAutomergeMissions.mockImplementation(() =>
    Promise.resolve([{ evas: evaRegistry, rexes: {} }])
  );
});

// ─── setupMaestroNamespace socket handlers ───────────────────────────────────

describe("maestro namespace socket handlers", () => {
  // We test the handler logic by importing setupMaestroNamespace and
  // providing a mock io server, then extracting the registered handlers.

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
    globalValues.maestroV1.evaSubscriptions = new Map();
    globalValues.maestroV1.socketio = null;
    globalValues.maestroV1.docListeners = new Map();
    globalValues.maestroV1.visitorData = {};

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

    // We need to mock the dependencies that setupMaestroNamespace calls
    // Use a fresh mock io server
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
    const { setupMaestroNamespace } = await import("server/maestro/v1/sockets-maestro");
    setupMaestroNamespace(mockIo as never);

    // Invoke connection handler with our mock socket
    connectionHandler(mockSocket);
  });

  describe("missionJoin", () => {
    it("joins the correct room and tracks the visitor", () => {
      const visitor: MaestroVisitorV1 = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };

      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      expect(mockSocket.join).toHaveBeenCalledWith(getMaestroSocketRoomName(MISSION_ID));
      const visitors = globalValues.maestroV1.visitorData[MISSION_ID];
      expect(visitors).toHaveLength(1);
      expect(visitors[0].socketId).toBe(mockSocket.id);
    });

    it("replaces existing visitor with same socketId on rejoin", () => {
      const visitor: MaestroVisitorV1 = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };

      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);
      mockSocket._handlers["missionJoin"](MISSION_ID, {
        ...visitor,
        name: "Vitest TestMaestro Updated",
      });

      const visitors = globalValues.maestroV1.visitorData[MISSION_ID];
      expect(visitors).toHaveLength(1);
      expect(visitors[0].name).toBe("Vitest TestMaestro Updated");
    });
  });

  describe("subscribeToEva", () => {
    it("adds EVA refUuid to evaSubscriptions for the mission", async () => {
      const evaRefUuid = uuidv4();
      evaRegistry[evaRefUuid] = { uuid: evaRefUuid, refUuid: evaRefUuid };
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid, null);

      const subs = globalValues.maestroV1.evaSubscriptions.get(MISSION_ID);
      expect(subs).toContain(evaRefUuid);
    });

    it("does not duplicate EVA refUuid on repeated subscribe", async () => {
      const evaRefUuid = uuidv4();
      evaRegistry[evaRefUuid] = { uuid: evaRefUuid, refUuid: evaRefUuid };
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid, null);
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid, null);

      const subs = globalValues.maestroV1.evaSubscriptions.get(MISSION_ID);
      expect(subs.filter((u: string) => u === evaRefUuid)).toHaveLength(1);
    });

    it("supports multiple EVA subscriptions for the same mission", async () => {
      const evaRefUuid1 = uuidv4();
      const evaRefUuid2 = uuidv4();
      evaRegistry[evaRefUuid1] = { uuid: evaRefUuid1, refUuid: evaRefUuid1 };
      evaRegistry[evaRefUuid2] = { uuid: evaRefUuid2, refUuid: evaRefUuid2 };
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid1, null);
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid2, null);

      const subs = globalValues.maestroV1.evaSubscriptions.get(MISSION_ID);
      expect(subs).toHaveLength(2);
      expect(subs).toContain(evaRefUuid1);
      expect(subs).toContain(evaRefUuid2);
    });
  });

  describe("unsubscribeToEva", () => {
    it("removes the EVA refUuid from subscriptions", async () => {
      const evaRefUuid = uuidv4();
      // evaSubscriptions stores the resolved evaUuid; via our mock, that equals evaRefUuid
      evaRegistry[evaRefUuid] = { uuid: evaRefUuid, refUuid: evaRefUuid };
      globalValues.maestroV1.evaSubscriptions.set(MISSION_ID, [evaRefUuid]);

      await mockSocket._handlers["unsubscribeToEva"](MISSION_ID, evaRefUuid, null);

      const subs = globalValues.maestroV1.evaSubscriptions.get(MISSION_ID);
      expect(subs).toBeUndefined();
    });

    it("deletes the mission entry when last subscription is removed", async () => {
      const evaRefUuid = uuidv4();
      evaRegistry[evaRefUuid] = { uuid: evaRefUuid, refUuid: evaRefUuid };
      globalValues.maestroV1.evaSubscriptions.set(MISSION_ID, [evaRefUuid]);

      await mockSocket._handlers["unsubscribeToEva"](MISSION_ID, evaRefUuid, null);

      expect(globalValues.maestroV1.evaSubscriptions.has(MISSION_ID)).toBe(false);
    });

    it("only removes the specified EVA when multiple are subscribed", async () => {
      const evaRefUuid1 = uuidv4();
      const evaRefUuid2 = uuidv4();
      evaRegistry[evaRefUuid1] = { uuid: evaRefUuid1, refUuid: evaRefUuid1 };
      evaRegistry[evaRefUuid2] = { uuid: evaRefUuid2, refUuid: evaRefUuid2 };
      globalValues.maestroV1.evaSubscriptions.set(MISSION_ID, [evaRefUuid1, evaRefUuid2]);

      await mockSocket._handlers["unsubscribeToEva"](MISSION_ID, evaRefUuid1, null);

      const subs = globalValues.maestroV1.evaSubscriptions.get(MISSION_ID);
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
      const visitor: MaestroVisitorV1 = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      mockSocket._handlers["missionLeave"](MISSION_ID);

      expect(mockSocket.leave).toHaveBeenCalledWith(getMaestroSocketRoomName(MISSION_ID));
    });

    it("removes the visitor from maestroVisitors", () => {
      const visitor: MaestroVisitorV1 = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      mockSocket._handlers["missionLeave"](MISSION_ID);

      // Entry is deleted (not left as empty array) so subsequent disconnects
      // don't re-trigger cleanupMaestro on a stale empty entry.
      expect(globalValues.maestroV1.visitorData[MISSION_ID]).toBeUndefined();
    });

    it("calls removeMaestroDocListener when room becomes empty on missionLeave", () => {
      const removeListenerFn = vi.fn();
      globalValues.maestroV1.docListeners.set(MISSION_ID, removeListenerFn);

      const visitor: MaestroVisitorV1 = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      mockSocket._handlers["missionLeave"](MISSION_ID);

      expect(removeListenerFn).toHaveBeenCalled();
      expect(globalValues.maestroV1.docListeners.has(MISSION_ID)).toBe(false);
    });

    it("does NOT call removeMaestroDocListener when other visitors remain in the room", () => {
      const visitor: MaestroVisitorV1 = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      // Add a second visitor manually so the room is not empty after leave
      const otherVisitor: MaestroVisitorV1 = {
        socketId: "other-socket-id",
        name: "Vitest OtherMaestro",
        connectedAt: Date.now(),
      };
      globalValues.maestroV1.visitorData[MISSION_ID].push(otherVisitor);

      const removeListenerFn = vi.fn();
      globalValues.maestroV1.docListeners.set(MISSION_ID, removeListenerFn);

      mockSocket._handlers["missionLeave"](MISSION_ID);

      expect(removeListenerFn).not.toHaveBeenCalled();
      expect(globalValues.maestroV1.visitorData[MISSION_ID]).toHaveLength(1);
      expect(globalValues.maestroV1.visitorData[MISSION_ID][0].socketId).toBe("other-socket-id");
    });

    it("emits inspectorUpdate after the visitor leaves", () => {
      const visitor: MaestroVisitorV1 = {
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
      const visitor: MaestroVisitorV1 = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      // Verify visitor is tracked
      expect(globalValues.maestroV1.visitorData[MISSION_ID]).toHaveLength(1);

      // Disconnect
      mockSocket._handlers["disconnect"]();

      // Entry is deleted (not left as empty array) so subsequent disconnects
      // don't re-trigger cleanupMaestro on a stale empty entry.
      expect(globalValues.maestroV1.visitorData[MISSION_ID]).toBeUndefined();
    });

    it("calls removeMaestroDocListener when room becomes empty on disconnect", () => {
      // Simulate a doc listener exists for this mission
      const removeListenerFn = vi.fn();
      globalValues.maestroV1.docListeners.set(MISSION_ID, removeListenerFn);

      const visitor: MaestroVisitorV1 = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      // Disconnect — room becomes empty
      mockSocket._handlers["disconnect"]();

      expect(removeListenerFn).toHaveBeenCalled();
      expect(globalValues.maestroV1.docListeners.has(MISSION_ID)).toBe(false);
    });

    it("does NOT call removeMaestroDocListener when other visitors remain in the room", () => {
      const visitor: MaestroVisitorV1 = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](MISSION_ID, visitor);

      // Add a second visitor manually so the room is not empty after disconnect
      const otherVisitor: MaestroVisitorV1 = {
        socketId: "other-socket-id",
        name: "Vitest OtherMaestro",
        connectedAt: Date.now(),
      };
      globalValues.maestroV1.visitorData[MISSION_ID].push(otherVisitor);

      // Simulate a doc listener
      const removeListenerFn = vi.fn();
      globalValues.maestroV1.docListeners.set(MISSION_ID, removeListenerFn);

      // Disconnect — room still has otherVisitor
      mockSocket._handlers["disconnect"]();

      expect(removeListenerFn).not.toHaveBeenCalled();
      expect(globalValues.maestroV1.visitorData[MISSION_ID]).toHaveLength(1);
      expect(globalValues.maestroV1.visitorData[MISSION_ID][0].socketId).toBe("other-socket-id");
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

  // ─── rexOverwrite ─────────────────────────────────────────────────────────

  describe("rexOverwrite", () => {
    const rexOverwriteBody: RexOverwrite = {
      uuid: "test-rex-uuid",
      petStartStopTimestamp: null,
      petValueAtStartStop: "+00:00:00",
      petRunning: false,
      isRunning: false,
      xgressEntries: null,
      maestroControlled: true,
      maestroEventId: null,
      maestroEventUrl: null,
      maestroActivityPropertiesByRefUuid: null,
      stationEntriesByRefUuid: null,
      traverseEntriesByRefUuid: null,
      actionEntriesByRefUuid: null,
    };

    it("returns failure when validation fails", async () => {
      mockValidateRexOverwrite.mockReturnValue("Validation error message");
      const callback = vi.fn();
      await mockSocket._handlers["rexOverwrite"](rexOverwriteBody, callback);
      expect(callback).toHaveBeenCalledWith({
        status: "failure",
        message: "Validation error message",
      });
    });

    it("returns error when updatedRexes is empty", async () => {
      mockOverwriteRex.mockResolvedValue([]);
      const callback = vi.fn();
      await mockSocket._handlers["rexOverwrite"](rexOverwriteBody, callback);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
    });

    it("returns error when overwriteRex throws", async () => {
      mockOverwriteRex.mockRejectedValue(new Error("overwrite failed"));
      const callback = vi.fn();
      await mockSocket._handlers["rexOverwrite"](rexOverwriteBody, callback);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "error",
          message: expect.stringContaining("overwrite failed"),
        })
      );
    });

    it("calls callback with success and emits store upsert on success", async () => {
      const updatedRexes = [generateBlankRex({ evaUuid: "test-eva-uuid", missionId: MISSION_ID })];
      mockOverwriteRex.mockResolvedValue(updatedRexes);
      const callback = vi.fn();
      await mockSocket._handlers["rexOverwrite"](rexOverwriteBody, callback);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ status: "success", data: updatedRexes })
      );
    });

    it("returns error when overwriteRex resolves null (no rexes updated)", async () => {
      mockOverwriteRex.mockResolvedValue(null as never);
      const callback = vi.fn();
      await mockSocket._handlers["rexOverwrite"](rexOverwriteBody, callback);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "error",
        })
      );
    });
  });

  // ─── subscribeToEva unresolved uuid ─────────────────────────────────────────

  describe("subscribeToEva / unsubscribeToEva - unresolvable EVA", () => {
    it("subscribeToEva does not add to subscriptions when EVA cannot be resolved", async () => {
      // evaRegistry is empty and mockGetAutomergeMissions returns a mission with no evas.
      // getAsPlannedEvaFromRefUuid will return undefined → evaUuid is undefined.
      const unknownRefUuid = uuidv4();
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, unknownRefUuid, null);

      expect(globalValues.maestroV1.evaSubscriptions.has(MISSION_ID)).toBe(false);
    });

    it("unsubscribeToEva does not throw when EVA cannot be resolved", async () => {
      const unknownRefUuid = uuidv4();
      await expect(
        mockSocket._handlers["unsubscribeToEva"](MISSION_ID, unknownRefUuid, null)
      ).resolves.not.toThrow();
    });

    it("subscribeToEva resolves via rexUuid when rex exists and refUuid matches", async () => {
      const evaUuid = uuidv4();
      const evaRefUuid = uuidv4();
      const rexUuid = uuidv4();
      // Return a mission that contains a rex mapping rexUuid → evaUuid, and an EVA whose refUuid matches.
      mockGetAutomergeMissions.mockResolvedValueOnce([
        {
          evas: { [evaUuid]: { uuid: evaUuid, refUuid: evaRefUuid } },
          rexes: { [rexUuid]: { evaUuid } },
        },
      ]);

      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid, rexUuid);

      const subs = globalValues.maestroV1.evaSubscriptions.get(MISSION_ID);
      expect(subs).toContain(evaUuid);
    });

    it("subscribeToEva does not subscribe when rex exists but refUuid mismatches", async () => {
      const evaUuid = uuidv4();
      const rexUuid = uuidv4();
      mockGetAutomergeMissions.mockResolvedValueOnce([
        {
          evas: { [evaUuid]: { uuid: evaUuid, refUuid: "different-ref-uuid" } },
          rexes: { [rexUuid]: { evaUuid } },
        },
      ]);

      await mockSocket._handlers["subscribeToEva"](MISSION_ID, "expected-ref-uuid", rexUuid);

      expect(globalValues.maestroV1.evaSubscriptions.has(MISSION_ID)).toBe(false);
    });

    it("subscribeToEva does not subscribe when rexUuid is provided but rex does not exist", async () => {
      mockGetAutomergeMissions.mockResolvedValueOnce([{ evas: {}, rexes: {} }]);
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, uuidv4(), "unknown-rex-uuid");
      expect(globalValues.maestroV1.evaSubscriptions.has(MISSION_ID)).toBe(false);
    });

    it("subscribeToEva uses cached docHandle when available (skips getAutomergeMissions)", async () => {
      const evaUuid = uuidv4();
      const evaRefUuid = uuidv4();
      const missionFromDoc = {
        evas: { [evaUuid]: { uuid: evaUuid, refUuid: evaRefUuid } },
        rexes: {},
      };
      // Pre-populate the docHandles cache so getEvaUuid takes the docHandle path
      globalValues.maestroV1.docHandles.set(MISSION_ID, {
        doc: vi.fn().mockReturnValue(missionFromDoc),
      } as never);

      mockGetAutomergeMissions.mockClear();
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, evaRefUuid, null);

      // docHandle short-circuits the getAutomergeMissions call
      expect(mockGetAutomergeMissions).not.toHaveBeenCalled();
      expect(globalValues.maestroV1.evaSubscriptions.get(MISSION_ID)).toContain(evaUuid);
    });

    it("subscribeToEva does nothing when getAutomergeMissions returns no mission", async () => {
      mockGetAutomergeMissions.mockResolvedValueOnce([undefined]);
      await mockSocket._handlers["subscribeToEva"](MISSION_ID, uuidv4(), null);
      expect(globalValues.maestroV1.evaSubscriptions.has(MISSION_ID)).toBe(false);
    });
  });

  // ─── missionJoin invalid inputs ─────────────────────────────────────────────

  describe("missionJoin invalid inputs", () => {
    it("does nothing when missionId is 0 (falsy)", () => {
      const visitor: MaestroVisitorV1 = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](0, visitor);
      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(globalValues.maestroV1.visitorData[0]).toBeUndefined();
    });

    it("does nothing when missionId is NaN", () => {
      const visitor: MaestroVisitorV1 = {
        socketId: mockSocket.id,
        name: "Vitest TestMaestro",
        connectedAt: Date.now(),
      };
      mockSocket._handlers["missionJoin"](NaN, visitor);
      expect(mockSocket.join).not.toHaveBeenCalled();
    });
  });

  // ─── getDebugInfo socket handler ────────────────────────────────────────────

  describe("getDebugInfo", () => {
    it("invokes the callback with the current debug info structure", () => {
      globalValues.maestroV1.docListeners.set(MISSION_ID, vi.fn());
      globalValues.maestroV1.evaSubscriptions.set(MISSION_ID, ["eva-uuid-1"]);
      globalValues.maestroV1.visitorData[MISSION_ID] = [
        { socketId: "s1", name: "M-1", connectedAt: 111 },
      ];

      const callback = vi.fn();
      mockSocket._handlers["getDebugInfo"](callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const info = callback.mock.calls[0][0];
      expect(info.docListenerMissionIds).toContain(MISSION_ID);
      expect(info.evaSubscriptions[MISSION_ID]).toEqual(["eva-uuid-1"]);
      expect(info.visitors[String(MISSION_ID)]).toEqual([
        { socketId: "s1", name: "M-1", connectedAt: 111 },
      ]);
    });
  });
});

// ─── getMissionIdFromSocketRoomName ─────────────────────────────────────────

describe("getMissionIdFromSocketRoomName", () => {
  it("parses a valid maestro{N} room name", async () => {
    const { getMissionIdFromSocketRoomName } = await import("server/maestro/v1/sockets-maestro");
    expect(getMissionIdFromSocketRoomName("maestro42")).toBe(42);
  });

  it("returns null for a non-matching room name", async () => {
    const { getMissionIdFromSocketRoomName } = await import("server/maestro/v1/sockets-maestro");
    expect(getMissionIdFromSocketRoomName("something-else")).toBeNull();
  });

  it("returns null for an empty string", async () => {
    const { getMissionIdFromSocketRoomName } = await import("server/maestro/v1/sockets-maestro");
    expect(getMissionIdFromSocketRoomName("")).toBeNull();
  });

  it("returns null when the mission number segment is missing", async () => {
    const { getMissionIdFromSocketRoomName } = await import("server/maestro/v1/sockets-maestro");
    expect(getMissionIdFromSocketRoomName("maestro")).toBeNull();
  });
});
