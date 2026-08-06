import { globalValues } from "server/express/global";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankRex } from "store/storeUtils/rex";

import { isDiffRelevantToSubscribedEvas } from "server/maestro/v2/onChangeListener";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MISSION_ID = 9999;

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
  globalValues.maestroV2.evaSubscriptions = new Map();
  globalValues.maestroV2.socketio = null;
  globalValues.maestroV2.docListeners = new Map();
  globalValues.maestroV2.docHandles = new Map();
  globalValues.maestroV2.visitorData = {};
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
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
      const mission = buildMockCoreData({ evas: [evaSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), changedMissionFields: ["description"] };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });
  });

  describe("eva upserts", () => {
    beforeEach(() => {
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
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
      globalValues.maestroV2.evaSubscriptions = new Map(); // clear
      const mission = buildMockCoreData({ evas: [evaSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), evas: collDiff([evaSubscribed]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(false);
    });
  });

  describe("eva deletedUuids", () => {
    it("returns true when a deleted EVA uuid is subscribed", () => {
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
      const mission = buildMockCoreData({ evas: [] });
      const diff: MaestroDiff = { ...emptyDiff(), evas: collDiff([], [evaSubscribed.uuid]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });

    it("returns false when the deleted EVA uuid is not subscribed", () => {
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
      const mission = buildMockCoreData({ evas: [evaSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), evas: collDiff([], [evaNotSubscribed.uuid]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(false);
    });
  });

  describe("station upserts", () => {
    beforeEach(() => {
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
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
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
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
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
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
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
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
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
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
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
      const mission = buildMockCoreData({ evas: [evaSubscribed] });
      const diff: MaestroDiff = { ...emptyDiff(), rexes: collDiff([], [rexForNotSubscribed.uuid]) };
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, diff)).toBe(true);
    });
  });

  describe("empty diff", () => {
    it("returns false when all arrays are empty and no changed mission fields", () => {
      globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [evaSubscribed.uuid]);
      const mission = buildMockCoreData({ evas: [evaSubscribed] });
      expect(isDiffRelevantToSubscribedEvas(MISSION_ID, mission, emptyDiff())).toBe(false);
    });
  });
});
