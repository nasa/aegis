import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildAegisSliceForMaestro } from "utils/maestro";
import { globalValues } from "server/express/global";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankRex } from "store/storeUtils/rex";

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockGetAutomergeMissions } = vi.hoisted(() => ({
  mockGetAutomergeMissions: vi.fn(),
}));

vi.mock("server/express/routes/missionAutomerge", async () => {
  const actual = await vi.importActual("server/express/routes/missionAutomerge");
  return { ...actual, getAutomergeMissions: mockGetAutomergeMissions };
});

vi.mock("utils/export", () => ({
  makeEquipmentReadable: vi.fn().mockReturnValue(""),
  makeReadableActionDefinition: vi.fn().mockReturnValue(""),
}));

vi.mock("store/processing/calculatedFields", () => ({
  getMaestroCalculatedFieldsForStation: vi.fn().mockReturnValue({}),
  getMaestroCalculatedFieldsForTraverse: vi.fn().mockReturnValue({}),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const MISSION_ID = 9999;

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

// ── Test data ─────────────────────────────────────────────────────────────────

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

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  globalValues.maestro.evaSubscriptions = new Map();
  globalValues.maestro.docHandles = new Map();
});

describe("buildAegisSliceForMaestro", () => {
  it("returns only subscribed EVAs and their related entities", async () => {
    globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);

    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed, evaNotSubscribed],
      stations: [stationA, stationB],
      traverses: [traverseA, traverseB],
      actions: [actionInSubscribed, actionNotInSubscribed],
      rexes: [rexForSubscribed, rexForNotSubscribed],
    });
    mockGetAutomergeMissions.mockResolvedValue([mockCoreData]);

    const result = await buildAegisSliceForMaestro(MISSION_ID);

    expect(Object.keys(result.aegisEvas)).toHaveLength(1);
    expect(result.aegisEvas[evaSubscribed.refUuid]).toBeDefined();
    expect(result.aegisEvas[evaNotSubscribed.refUuid]).toBeUndefined();

    expect(result.aegisStations[stationA.refUuid]).toBeDefined();
    expect(result.aegisStations[stationB.refUuid]).toBeUndefined();

    expect(result.aegisTraverses[traverseA.refUuid]).toBeDefined();
    expect(result.aegisTraverses[traverseB.refUuid]).toBeUndefined();

    expect(result.fetchedAegisActions[actionInSubscribed.refUuid]).toBeDefined();
    expect(result.fetchedAegisActions[actionNotInSubscribed.refUuid]).toBeUndefined();

    expect(result.aegisMissions[MISSION_ID]).toBeDefined();
  });

  it("returns empty collections when no EVAs are subscribed", async () => {
    // No subscriptions set — evaSubscriptions remains an empty Map

    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed, evaNotSubscribed],
      stations: [stationA, stationB],
      traverses: [traverseA, traverseB],
      actions: [actionInSubscribed, actionNotInSubscribed],
    });
    mockGetAutomergeMissions.mockResolvedValue([mockCoreData]);

    const result = await buildAegisSliceForMaestro(MISSION_ID);

    expect(Object.keys(result.aegisEvas)).toHaveLength(0);
    expect(Object.keys(result.aegisStations)).toHaveLength(0);
    expect(Object.keys(result.aegisTraverses)).toHaveLength(0);
    expect(Object.keys(result.fetchedAegisActions)).toHaveLength(0);
    expect(result.aegisMissions[MISSION_ID]).toBeDefined();
  });

  it("includes actions linked via traverseUuid", async () => {
    const actionOnTraverse = generateBlankAction({
      name: "Vitest Action On Traverse",
      missionId: MISSION_ID,
      traverseUuid: traverseA.uuid,
    });

    globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);

    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed],
      stations: [stationA],
      traverses: [traverseA],
      actions: [actionOnTraverse],
    });
    mockGetAutomergeMissions.mockResolvedValue([mockCoreData]);

    const result = await buildAegisSliceForMaestro(MISSION_ID);

    expect(Object.keys(result.fetchedAegisActions)).toHaveLength(1);
    expect(result.fetchedAegisActions[actionOnTraverse.refUuid]).toBeDefined();
  });

  it("maps station actionOrderUuids to action refUuids", async () => {
    const stationWithOrder = generateBlankStation({
      name: "Vitest Station With Order",
      missionId: MISSION_ID,
      actionOrderUuids: [actionInSubscribed.uuid],
    });
    const evaWithOrder = generateBlankEVA({
      name: "Vitest EVA With Order",
      missionId: MISSION_ID,
      sequence: [{ type: "station", uuid: stationWithOrder.uuid }],
    });

    globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaWithOrder.uuid]);

    const mockCoreData = buildMockCoreData({
      evas: [evaWithOrder],
      stations: [stationWithOrder],
      traverses: [],
      actions: [actionInSubscribed],
    });
    mockGetAutomergeMissions.mockResolvedValue([mockCoreData]);

    const result = await buildAegisSliceForMaestro(MISSION_ID);

    expect(result.aegisStations[stationWithOrder.refUuid].actionOrderRefUuids).toEqual([
      actionInSubscribed.refUuid,
    ]);
  });

  it("maps traverse actionOrderUuids to action refUuids", async () => {
    const traverseWithOrder = generateBlankTraverse({
      name: "Vitest Traverse With Order",
      missionId: MISSION_ID,
      actionOrderUuids: [actionInSubscribed.uuid],
    });
    const evaWithOrder = generateBlankEVA({
      name: "Vitest EVA With Traverse Order",
      missionId: MISSION_ID,
      sequence: [{ type: "traverse", uuid: traverseWithOrder.uuid }],
    });

    globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaWithOrder.uuid]);

    const mockCoreData = buildMockCoreData({
      evas: [evaWithOrder],
      stations: [],
      traverses: [traverseWithOrder],
      actions: [actionInSubscribed],
    });
    mockGetAutomergeMissions.mockResolvedValue([mockCoreData]);

    const result = await buildAegisSliceForMaestro(MISSION_ID);

    expect(result.aegisTraverses[traverseWithOrder.refUuid].actionOrderRefUuids).toEqual([
      actionInSubscribed.refUuid,
    ]);
  });
});

describe("buildAegisSliceForMaestro — docHandle path", () => {
  it("uses stored docHandle reference instead of getAutomergeMissions", async () => {
    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed],
      stations: [stationA],
      traverses: [traverseA],
    });

    const mockDoc = vi.fn().mockReturnValue(mockCoreData);
    globalValues.maestro.docHandles.set(MISSION_ID, { doc: mockDoc } as never);
    globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);

    const result = await buildAegisSliceForMaestro(MISSION_ID);

    expect(mockGetAutomergeMissions).not.toHaveBeenCalled();
    expect(mockDoc).toHaveBeenCalled();
    expect(result.aegisEvas[evaSubscribed.refUuid]).toBeDefined();
  });

  it("falls back to getAutomergeMissions when no stored handle reference", async () => {
    // No docHandle set — docHandles remains an empty Map

    const mockCoreData = buildMockCoreData({
      evas: [evaSubscribed],
      stations: [stationA],
      traverses: [traverseA],
    });
    mockGetAutomergeMissions.mockResolvedValue([mockCoreData]);

    globalValues.maestro.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);

    await buildAegisSliceForMaestro(MISSION_ID);

    expect(mockGetAutomergeMissions).toHaveBeenCalledWith([MISSION_ID]);
  });
});
