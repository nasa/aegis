import { globalValues } from "server/express/global";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankRex } from "store/storeUtils/rex";
import type * as SocketsMaestroEmitters from "server/express/sockets-maestro-emitters";

// ── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockGetEVAs,
  mockGetMissionCoreData,
  mockGetAll,
  mockGetActionRefUuids,
  mockGetStationRefUuids,
  mockGetTraverseRefUuids,
  mockGetEVARefUuids,
  mockGetAutomergeDocListing,
} = vi.hoisted(() => ({
  mockGetEVAs: vi.fn().mockResolvedValue([]),
  mockGetMissionCoreData: vi.fn(),
  mockGetAll: vi.fn(),
  mockGetActionRefUuids: vi.fn().mockResolvedValue([]),
  mockGetStationRefUuids: vi.fn().mockResolvedValue([]),
  mockGetTraverseRefUuids: vi.fn().mockResolvedValue([]),
  mockGetEVARefUuids: vi.fn().mockResolvedValue([]),
  mockGetAutomergeDocListing: vi.fn(),
}));

vi.mock("server/express/routes/eva", async () => {
  const actual = await vi.importActual("server/express/routes/eva");
  return { ...actual, getEVAs: mockGetEVAs, getEVARefUuids: mockGetEVARefUuids };
});

vi.mock("server/express/routes/all", async () => {
  const actual = await vi.importActual("server/express/routes/all");
  return { ...actual, getMissionCoreData: mockGetMissionCoreData, getAll: mockGetAll };
});

vi.mock("server/express/routes/action", async () => {
  const actual = await vi.importActual("server/express/routes/action");
  return { ...actual, getActionRefUuids: mockGetActionRefUuids };
});

vi.mock("server/express/routes/station", async () => {
  const actual = await vi.importActual("server/express/routes/station");
  return { ...actual, getStationRefUuids: mockGetStationRefUuids };
});

vi.mock("server/express/routes/traverse", async () => {
  const actual = await vi.importActual("server/express/routes/traverse");
  return { ...actual, getTraverseRefUuids: mockGetTraverseRefUuids };
});

vi.mock("server/express/routes/docListing", () => ({
  getAutomergeDocListing: mockGetAutomergeDocListing,
}));

vi.mock("utils/export", () => ({
  makeExportActions: vi.fn().mockReturnValue([]),
  makeExportStations: vi.fn().mockReturnValue([]),
  makeExportTraverses: vi.fn().mockReturnValue([]),
  makeExportEvas: vi.fn().mockReturnValue([]),
  makeExportRexes: vi.fn().mockReturnValue([]),
  makeEquipmentReadable: vi.fn().mockReturnValue(""),
  makeReadableActionDefinition: vi.fn().mockReturnValue(""),
}));

import {
  isRelevantToSubscribedEvas,
  emitToMaestroNamespace,
  buildAegisEntityForMaestro,
  cleanupSocketRoom,
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

/** Build a minimal MissionCoreData-shaped object with the provided entities */
const buildMockCoreData = (overrides: {
  evas?: Eva[];
  stations?: Station[];
  traverses?: Traverse[];
  actions?: Action[];
  rexes?: Rex[];
}) => ({
  mission: {
    id: MISSION_ID,
    name: "Test Mission",
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  evas: overrides.evas ?? [],
  stations: overrides.stations ?? [],
  traverses: overrides.traverses ?? [],
  actions: overrides.actions ?? [],
  rexes: overrides.rexes ?? [],
  pois: [] as POI[],
  level1s: [] as STMLevel1[],
  level2s: [] as STMLevel2[],
  level3s: [] as STMLevel3[],
});

// ── Test data builders ───────────────────────────────────────────────────────

const stationA = generateBlankStation({ name: "Station A", missionId: MISSION_ID });
const stationB = generateBlankStation({ name: "Station B", missionId: MISSION_ID });
const traverseA = generateBlankTraverse({ name: "Traverse A", missionId: MISSION_ID });
const traverseB = generateBlankTraverse({ name: "Traverse B", missionId: MISSION_ID });

const evaSubscribed = generateBlankEVA({
  name: "EVA Subscribed",
  missionId: MISSION_ID,
  sequence: [
    { type: "station", uuid: stationA.uuid },
    { type: "traverse", uuid: traverseA.uuid },
  ],
});
const evaNotSubscribed = generateBlankEVA({
  name: "EVA Not Subscribed",
  missionId: MISSION_ID,
  sequence: [
    { type: "station", uuid: stationB.uuid },
    { type: "traverse", uuid: traverseB.uuid },
  ],
});

const actionInSubscribed = generateBlankAction({
  name: "Action In Subscribed",
  missionId: MISSION_ID,
  stationUuid: stationA.uuid,
});
const actionNotInSubscribed = generateBlankAction({
  name: "Action Not In Subscribed",
  missionId: MISSION_ID,
  stationUuid: stationB.uuid,
});

const rexForSubscribed = generateBlankRex({
  name: "Rex Subscribed",
  evaUuid: evaSubscribed.uuid,
  missionId: MISSION_ID,
});
const rexForNotSubscribed = generateBlankRex({
  name: "Rex Not Subscribed",
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
  globalValues.automergeRepo = { find: vi.fn().mockResolvedValue(defaultDocHandle) } as never;
  mockGetAutomergeDocListing.mockResolvedValue([{ automergeUrl: "automerge://default-url" }]);
  globalValues.maestro.evaSubscriptions = new Map();
  globalValues.maestro.socketio = null;
  globalValues.maestro.docListeners = new Map();
  globalValues.serverSocketStatus.maestroMissionVisitors = {};
});

// ─── isRelevantToSubscribedEvas ──────────────────────────────────────────────

describe("isRelevantToSubscribedEvas", () => {
  describe("when there are no evaSubscriptions", () => {
    it("returns false for eva payload type", async () => {
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "eva",
        data: [evaSubscribed],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "eva", payload)).toBe(false);
    });
  });

  describe("eva type", () => {
    beforeEach(() => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.refUuid]);
    });

    it("returns true for upsert with subscribed EVA refUuid", async () => {
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "eva",
        data: [evaSubscribed],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "eva", payload)).toBe(true);
      expect(mockGetEVAs).not.toHaveBeenCalled();
    });

    it("returns false for upsert with non-subscribed EVA refUuid", async () => {
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "eva",
        data: [evaNotSubscribed],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "eva", payload)).toBe(false);
    });

    it("conservatively returns true for eva delete (no refUuid in delete payload)", async () => {
      const payload: StoreDelete = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "eva",
        uuids: [evaNotSubscribed.uuid],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "eva", payload)).toBe(true);
    });
  });

  describe("rex type", () => {
    beforeEach(() => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.refUuid]);
      mockGetEVAs.mockResolvedValue([evaSubscribed, evaNotSubscribed]);
    });

    it("returns true for upsert with rex linked to subscribed EVA", async () => {
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "rex",
        data: [rexForSubscribed],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "rex", payload)).toBe(true);
      expect(mockGetEVAs).toHaveBeenCalledWith(MISSION_ID);
    });

    it("returns false for upsert with rex linked to non-subscribed EVA", async () => {
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "rex",
        data: [rexForNotSubscribed],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "rex", payload)).toBe(false);
    });

    it("conservatively returns true for rex delete (no evaUuid available)", async () => {
      const payload: StoreDelete = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "rex",
        uuids: [rexForNotSubscribed.uuid],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "rex", payload)).toBe(true);
    });
  });

  describe("station type", () => {
    beforeEach(() => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.refUuid]);
      mockGetEVAs.mockResolvedValue([evaSubscribed, evaNotSubscribed]);
    });

    it("returns true for upsert with station in subscribed EVA sequence", async () => {
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "station",
        data: [stationA],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "station", payload)).toBe(true);
      expect(mockGetEVAs).toHaveBeenCalledWith(MISSION_ID);
    });

    it("returns false for upsert with station NOT in subscribed EVA sequence", async () => {
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "station",
        data: [stationB],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "station", payload)).toBe(false);
    });

    it("returns true for delete with station uuid in subscribed EVA sequence", async () => {
      const payload: StoreDelete = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "station",
        uuids: [stationA.uuid],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "station", payload)).toBe(true);
    });

    it("returns false for delete with station uuid NOT in subscribed EVA", async () => {
      const payload: StoreDelete = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "station",
        uuids: [stationB.uuid],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "station", payload)).toBe(false);
    });
  });

  describe("traverse type", () => {
    beforeEach(() => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.refUuid]);
      mockGetEVAs.mockResolvedValue([evaSubscribed, evaNotSubscribed]);
    });

    it("returns true for upsert with traverse in subscribed EVA sequence", async () => {
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "traverse",
        data: [traverseA],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "traverse", payload)).toBe(true);
    });

    it("returns false for upsert with traverse NOT in subscribed EVA sequence", async () => {
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "traverse",
        data: [traverseB],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "traverse", payload)).toBe(false);
    });
  });

  describe("action type", () => {
    beforeEach(() => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.refUuid]);
      mockGetEVAs.mockResolvedValue([evaSubscribed, evaNotSubscribed]);
    });

    it("returns true for action whose stationUuid is in subscribed EVA", async () => {
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "action",
        data: [actionInSubscribed],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "action", payload)).toBe(true);
    });

    it("returns false for action whose stationUuid is NOT in subscribed EVA", async () => {
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "action",
        data: [actionNotInSubscribed],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "action", payload)).toBe(false);
    });

    it("returns true for action whose traverseUuid is in subscribed EVA", async () => {
      const actionOnTraverse = generateBlankAction({
        name: "Action On Traverse",
        missionId: MISSION_ID,
        traverseUuid: traverseA.uuid,
      });
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "action",
        data: [actionOnTraverse],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "action", payload)).toBe(true);
    });

    it("returns true for action delete (conservative, no parent uuid available)", async () => {
      const payload: StoreDelete = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "action",
        uuids: [actionInSubscribed.uuid],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "action", payload)).toBe(true);
    });

    it("returns true if at least one action in a batch is relevant", async () => {
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "action",
        data: [actionNotInSubscribed, actionInSubscribed],
        lastEditEvent: null,
      };
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "action", payload)).toBe(true);
    });
  });

  describe("irrelevant types", () => {
    it("returns false for poi type (not in maestro type list)", async () => {
      globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.refUuid]);
      mockGetEVAs.mockResolvedValue([evaSubscribed]);
      const payload: StoreUpsert = {
        socketId: "s1",
        missionId: MISSION_ID,
        type: "poi",
        data: [],
        lastEditEvent: null,
      };
      // poi has no uuids in the subscribed EVA sequences
      expect(await isRelevantToSubscribedEvas(MISSION_ID, "poi", payload)).toBe(false);
    });
  });
});

// ─── emitToMaestroNamespace ──────────────────────────────────────────────────

describe("emitToMaestroNamespace", () => {
  it("does nothing when maestro namespace is null", () => {
    globalValues.maestro.socketio = null;
    expect(() => emitToMaestroNamespace(MISSION_ID)).not.toThrow();
  });

  it("does nothing when maestro room is empty", async () => {
    const ns = createMockMaestroNamespace();
    globalValues.maestro.socketio = ns as never;
    // room doesn't exist → size 0
    emitToMaestroNamespace(MISSION_ID);
    // Give throttled async call time to execute
    await vi.waitFor(() => {
      expect(ns.to).not.toHaveBeenCalled();
    });
  });

  it("emits maestroMissionData when room has clients and data is available", async () => {
    const ns = createMockMaestroNamespace();
    const roomName = getMaestroSocketRoomName(MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    globalValues.maestro.socketio = ns as never;
    globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.refUuid]);

    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed],
      stations: [stationA],
      traverses: [traverseA],
      actions: [],
      rexes: [],
    });
    mockGetMissionCoreData.mockResolvedValueOnce(mockCoreData);

    emitToMaestroNamespace(MISSION_ID);

    await vi.waitFor(() => {
      expect(ns.to).toHaveBeenCalledWith(roomName);
      expect(ns._emit).toHaveBeenCalledWith(
        "dataAll",
        expect.objectContaining({
          aegisMissions: expect.any(Object),
          aegisEvas: expect.any(Object),
          aegisStations: expect.any(Object),
          aegisTraverses: expect.any(Object),
          fetchedAegisActions: expect.any(Object),
        })
      );
    });
  });
});

// ─── buildAegisEntityForMaestro ──────────────────────────────────────────────

describe("buildAegisEntityForMaestro", () => {
  it("returns only subscribed EVAs and their related entities", async () => {
    globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.refUuid]);

    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed, evaNotSubscribed],
      stations: [stationA, stationB],
      traverses: [traverseA, traverseB],
      actions: [actionInSubscribed, actionNotInSubscribed],
      rexes: [rexForSubscribed, rexForNotSubscribed],
    });
    mockGetMissionCoreData.mockResolvedValue(mockCoreData);

    const result = await buildAegisEntityForMaestro(MISSION_ID);

    // Should contain subscribed EVA
    expect(Object.keys(result.aegisEvas)).toHaveLength(1);
    expect(result.aegisEvas[evaSubscribed.refUuid]).toBeDefined();
    expect(result.aegisEvas[evaNotSubscribed.refUuid]).toBeUndefined();

    // Should contain only stationA (in subscribed EVA's sequence)
    expect(Object.keys(result.aegisStations)).toHaveLength(1);
    expect(result.aegisStations[stationA.refUuid]).toBeDefined();
    expect(result.aegisStations[stationB.refUuid]).toBeUndefined();

    // Should contain only traverseA
    expect(Object.keys(result.aegisTraverses)).toHaveLength(1);
    expect(result.aegisTraverses[traverseA.refUuid]).toBeDefined();

    // Should contain only actionInSubscribed (stationed on stationA)
    expect(Object.keys(result.fetchedAegisActions)).toHaveLength(1);
    expect(result.fetchedAegisActions[actionInSubscribed.refUuid]).toBeDefined();
    expect(result.fetchedAegisActions[actionNotInSubscribed.refUuid]).toBeUndefined();

    // Mission should always be included
    expect(result.aegisMissions[MISSION_ID]).toBeDefined();
  });

  it("returns empty collections when no EVAs are subscribed", async () => {
    // No subscriptions set
    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed],
      stations: [stationA],
      traverses: [traverseA],
      actions: [actionInSubscribed],
    });
    mockGetMissionCoreData.mockResolvedValue(mockCoreData);

    const result = await buildAegisEntityForMaestro(MISSION_ID);

    expect(Object.keys(result.aegisEvas)).toHaveLength(0);
    expect(Object.keys(result.aegisStations)).toHaveLength(0);
    expect(Object.keys(result.aegisTraverses)).toHaveLength(0);
    expect(Object.keys(result.fetchedAegisActions)).toHaveLength(0);
    expect(result.aegisMissions[MISSION_ID]).toBeDefined();
  });

  it("includes actions linked via traverseUuid", async () => {
    const actionOnTraverse = generateBlankAction({
      name: "Action On Traverse A",
      missionId: MISSION_ID,
      traverseUuid: traverseA.uuid,
    });
    globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.refUuid]);

    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed],
      stations: [stationA],
      traverses: [traverseA],
      actions: [actionOnTraverse],
    });
    mockGetMissionCoreData.mockResolvedValue(mockCoreData);

    const result = await buildAegisEntityForMaestro(MISSION_ID);

    expect(Object.keys(result.fetchedAegisActions)).toHaveLength(1);
    expect(result.fetchedAegisActions[actionOnTraverse.refUuid]).toBeDefined();
  });

  it("attaches rexUuid to EVA when rex exists for subscribed EVA", async () => {
    globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.refUuid]);

    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed],
      stations: [stationA],
      traverses: [traverseA],
      rexes: [rexForSubscribed],
    });
    mockGetMissionCoreData.mockResolvedValue(mockCoreData);

    const result = await buildAegisEntityForMaestro(MISSION_ID);
    const evaResult = result.aegisEvas[evaSubscribed.refUuid];
    expect(evaResult.rexUuid).toBe(rexForSubscribed.uuid);
  });

  it("maps station actionOrderUuids to action refUuids", async () => {
    const stationWithOrder = generateBlankStation({
      name: "Station With Order",
      missionId: MISSION_ID,
      actionOrderUuids: [actionInSubscribed.uuid],
    });
    const evaWithOrder = generateBlankEVA({
      name: "EVA With Order",
      missionId: MISSION_ID,
      sequence: [{ type: "station", uuid: stationWithOrder.uuid }],
    });
    globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaWithOrder.refUuid]);

    const mockCoreData = buildMockCoreData({
      evas: [evaWithOrder],
      stations: [stationWithOrder],
      traverses: [],
      actions: [actionInSubscribed],
    });
    mockGetMissionCoreData.mockResolvedValue(mockCoreData);

    const result = await buildAegisEntityForMaestro(MISSION_ID);
    const station = result.aegisStations[stationWithOrder.refUuid];
    expect(station.actionOrderRefUuids).toEqual([actionInSubscribed.refUuid]);
  });

  it("maps traverse actionOrderUuids to action refUuids", async () => {
    const traverseWithOrder = generateBlankTraverse({
      name: "Traverse With Order",
      missionId: MISSION_ID,
      actionOrderUuids: [actionInSubscribed.uuid],
    });
    const evaWithTraverseOrder = generateBlankEVA({
      name: "EVA With Traverse Order",
      missionId: MISSION_ID,
      sequence: [{ type: "traverse", uuid: traverseWithOrder.uuid }],
    });
    globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaWithTraverseOrder.refUuid]);

    const mockCoreData = buildMockCoreData({
      evas: [evaWithTraverseOrder],
      stations: [],
      traverses: [traverseWithOrder],
      actions: [actionInSubscribed],
    });
    mockGetMissionCoreData.mockResolvedValue(mockCoreData);

    const result = await buildAegisEntityForMaestro(MISSION_ID);
    const traverse = result.aegisTraverses[traverseWithOrder.refUuid];
    expect(traverse.actionOrderRefUuids).toEqual([actionInSubscribed.refUuid]);
  });
});

// ─── removeMaestroDocListener ─────────────────────────────────────────────────

describe("removeMaestroDocListener", () => {
  it("does nothing when no listener is registered for the room", () => {
    const roomName = "nonExistentRoom";
    expect(() => cleanupSocketRoom(roomName)).not.toThrow();
    expect(globalValues.maestro.docListeners.has(roomName)).toBe(false);
  });

  it("calls and removes the listener when one is registered", () => {
    const roomName = getMaestroSocketRoomName(MISSION_ID);
    const removeListenerFn = vi.fn();
    globalValues.maestro.docListeners.set(roomName, removeListenerFn);
    cleanupSocketRoom(roomName);
    expect(removeListenerFn).toHaveBeenCalled();
    expect(globalValues.maestro.docListeners.has(roomName)).toBe(false);
  });
});

// ─── emitToMaestroNamespace error path ────────────────────────────────────────

describe("emitToMaestroNamespace error path", () => {
  it("swallows errors thrown during data build", async () => {
    const ns = createMockMaestroNamespace();
    const roomName = getMaestroSocketRoomName(MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    globalValues.maestro.socketio = ns as never;

    mockGetMissionCoreData.mockRejectedValue(new Error("data error"));

    emitToMaestroNamespace(MISSION_ID);

    await vi.waitFor(() => {
      // No emit should have happened due to the error being caught
      expect(ns._emit).not.toHaveBeenCalled();
    });
  });
});

// ─── addMaestroDocListenerForMission ──────────────────────────────────────────

describe("addMaestroDocListenerForMission", () => {
  // Use the real implementation (the module-level mock replaces it, so we bypass via importActual)
  let realAddMaestroDocListenerForMission: (missionId: number, roomName: string) => Promise<void>;
  let mockDocHandle: {
    whenReady: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };

  beforeAll(async () => {
    const actual = await vi.importActual<typeof SocketsMaestroEmitters>(
      "server/express/sockets-maestro-emitters"
    );
    realAddMaestroDocListenerForMission = actual.addMaestroDocListenerForMission;
  });

  beforeEach(() => {
    mockDocHandle = {
      whenReady: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
    };
    globalValues.automergeRepo = {
      find: vi.fn().mockResolvedValue(mockDocHandle),
    } as never;
    mockGetAutomergeDocListing.mockResolvedValue([{ automergeUrl: "automerge://test-url" }]);
  });

  it("returns early when room already has a listener", async () => {
    const roomName = getMaestroSocketRoomName(MISSION_ID);
    globalValues.maestro.docListeners.set(roomName, vi.fn());

    await realAddMaestroDocListenerForMission(MISSION_ID, roomName);

    expect(mockGetAutomergeDocListing).not.toHaveBeenCalled();
  });

  it("attaches change listener and stores cleanup function for a new room", async () => {
    const roomName = getMaestroSocketRoomName(MISSION_ID);

    await realAddMaestroDocListenerForMission(MISSION_ID, roomName);

    expect(mockGetAutomergeDocListing).toHaveBeenCalledWith([MISSION_ID]);
    expect(mockDocHandle.on).toHaveBeenCalledWith("change", expect.any(Function));
    expect(globalValues.maestro.docListeners.has(roomName)).toBe(true);
  });

  it("throttled change listener does nothing when maestro namespace is null", async () => {
    const roomName = getMaestroSocketRoomName(MISSION_ID);
    await realAddMaestroDocListenerForMission(MISSION_ID, roomName);

    const changeListener = mockDocHandle.on.mock.calls[0][1];
    globalValues.maestro.socketio = null;

    changeListener();

    // With maestroNamespace null, nothing should be emitted — getMissionCoreData is never called
    expect(mockGetMissionCoreData).not.toHaveBeenCalled();
  });

  it("throttled change listener does nothing when room is empty", async () => {
    const ns = createMockMaestroNamespace();
    const roomName = getMaestroSocketRoomName(MISSION_ID);
    // No sockets in the room
    globalValues.maestro.socketio = ns as never;

    await realAddMaestroDocListenerForMission(MISSION_ID, roomName);
    const changeListener = mockDocHandle.on.mock.calls[0][1];

    changeListener();

    await vi.waitFor(() => {
      expect(ns.to).not.toHaveBeenCalled();
    });
  });

  it("throttled change listener emits dataAll when room has clients", async () => {
    const LISTENER_MISSION_ID = 7777;
    const ns = createMockMaestroNamespace();
    const roomName = getMaestroSocketRoomName(LISTENER_MISSION_ID);
    ns._rooms.set(roomName, new Set(["socket1"]));
    globalValues.maestro.socketio = ns as never;
    globalValues.maestro.evaSubscriptions.set(LISTENER_MISSION_ID, [evaSubscribed.refUuid]);

    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed],
      stations: [stationA],
      traverses: [traverseA],
    });
    mockGetMissionCoreData.mockResolvedValue(mockCoreData);

    await realAddMaestroDocListenerForMission(LISTENER_MISSION_ID, roomName);
    const changeListener = mockDocHandle.on.mock.calls[0][1];

    changeListener();

    await vi.waitFor(() => {
      expect(ns._emit).toHaveBeenCalledWith("dataAll", expect.any(Object));
    });
  });

  it("cleanup function removes the change listener", async () => {
    const roomName = getMaestroSocketRoomName(MISSION_ID);
    await realAddMaestroDocListenerForMission(MISSION_ID, roomName);

    expect(globalValues.maestro.docListeners.has(roomName)).toBe(true);
    const cleanupFn = globalValues.maestro.docListeners.get(roomName)!;
    cleanupFn();

    expect(mockDocHandle.off).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
