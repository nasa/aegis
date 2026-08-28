import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { globalValues } from "server/express/global";
import { opUpdateMdau } from "server/maestro/v2/operations/op-mdau";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { serverLogger } from "utils/logging/serverLogger";
import type { DocHandle } from "@automerge/automerge-repo";
import type { MDAU } from "server/maestro/v2/types/mdau";

const MISSION_ID = 9999;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Subscribe Maestro to every EVA currently in the doc, then run opUpdateMdau.
 * Keeps existing tests focused on their behaviour without repeating the
 * subscription setup. Dedicated tests below cover the unsubscribed path.
 */
function runMdau(handle: DocHandle<Mission>, mdau: MDAU.MaestroDataAegisUses): void {
  const evaUuids = Object.keys(handle.doc().evas ?? {});
  globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, evaUuids);
  opUpdateMdau(handle, MISSION_ID, mdau);
}

/**
 * Build a minimal EVA sequence:
 *   traverse1 → station → traverse2
 * with the station at index 1, flanked by two traverses.
 */
function buildEvaWithStation(
  station: Station,
  traverseBefore: Traverse,
  traverseAfter: Traverse,
  overrides: Partial<Eva> = {}
): Eva {
  return generateBlankEVA({
    sequence: [
      { type: "traverse", uuid: traverseBefore.uuid },
      { type: "station", uuid: station.uuid },
      { type: "traverse", uuid: traverseAfter.uuid },
    ],
    ...overrides,
  });
}

// ── Test lifecycle ────────────────────────────────────────────────────────

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  globalValues.maestroV2.evaSubscriptions = new Map();
  getMissionDocHandle().change((m) => {
    m.stations = {};
    m.traverses = {};
    m.evas = {};
    m.actions = {};
    m.rexes = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

// ── opUpdateMdau: stations ───────────────────────────────────────────────────

describe("opUpdateMdau() — stations", () => {
  it("does nothing when the payload is empty", () => {
    const handle = getMissionDocHandle();
    expect(() => opUpdateMdau(handle, MISSION_ID, {})).not.toThrow();
  });

  it("updates a station's name and duration by refUuid (as-planned)", () => {
    const station = generateBlankStation({ name: "Vitest Alpha", duration: 10 });
    const eva = generateBlankEVA({
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.evas[eva.uuid] = eva;
    });

    const now = Date.now();
    runMdau(handle, {
      aegisStations: {
        [station.refUuid]: {
          refUuid: station.refUuid,
          name: "Vitest Bravo",
          duration: 25,
          actionOrderRefUuids: null,
          updatedAt: now,
        },
      },
    });

    const updated = handle.doc().stations[station.uuid];
    expect(updated.name).toBe("Vitest Bravo");
    expect(updated.duration).toBe(25);
    expect(updated.updatedAt).toBe(now);
  });

  it("does not write when nothing changed", () => {
    const station = generateBlankStation({ name: "Vitest Alpha", duration: 10 });
    const eva = generateBlankEVA({
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.evas[eva.uuid] = eva;
    });
    const before = handle.doc().stations[station.uuid].updatedAt;

    runMdau(handle, {
      aegisStations: {
        [station.refUuid]: {
          refUuid: station.refUuid,
          name: "Vitest Alpha",
          duration: 10,
          actionOrderRefUuids: null,
          updatedAt: Date.now() + 5000,
        },
      },
    });

    // updatedAt must be untouched because no field changed.
    expect(handle.doc().stations[station.uuid].updatedAt).toBe(before);
  });

  it("cascades adjacent traverse renames when a station name changes", () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const traverseBefore = generateBlankTraverse({ name: "Lander to Vitest Alpha" });
    const traverseAfter = generateBlankTraverse({ name: "Vitest Alpha to Lander" });
    const eva = buildEvaWithStation(station, traverseBefore, traverseAfter);

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.traverses[traverseBefore.uuid] = traverseBefore;
      m.traverses[traverseAfter.uuid] = traverseAfter;
      m.evas[eva.uuid] = eva;
    });

    runMdau(handle, {
      aegisStations: {
        [station.refUuid]: {
          refUuid: station.refUuid,
          name: "Vitest Charlie",
          duration: station.duration ?? 0,
          actionOrderRefUuids: null,
          updatedAt: Date.now(),
        },
      },
    });

    const doc = handle.doc();
    expect(doc.stations[station.uuid].name).toBe("Vitest Charlie");
    expect(doc.traverses[traverseBefore.uuid].name).toContain("Charlie");
    expect(doc.traverses[traverseAfter.uuid].name).toContain("Charlie");
  });

  it("reorders a station's actions (reorder-only) via actionOrderRefUuids", () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const actionA = generateBlankAction({ stationUuid: station.uuid });
    const actionB = generateBlankAction({ stationUuid: station.uuid });
    station.actionOrderUuids = [actionA.uuid, actionB.uuid];
    const eva = generateBlankEVA({
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.actions[actionA.uuid] = actionA;
      m.actions[actionB.uuid] = actionB;
      m.evas[eva.uuid] = eva;
    });

    runMdau(handle, {
      aegisStations: {
        [station.refUuid]: {
          refUuid: station.refUuid,
          name: station.name,
          duration: station.duration ?? 0,
          // Reverse the order using refUuids.
          actionOrderRefUuids: [actionB.refUuid, actionA.refUuid],
          updatedAt: Date.now(),
        },
      },
    });

    expect(handle.doc().stations[station.uuid].actionOrderUuids).toEqual([
      actionB.uuid,
      actionA.uuid,
    ]);
  });

  it("ignores actionOrderRefUuids when it would add/remove actions", () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const actionA = generateBlankAction({ stationUuid: station.uuid });
    station.actionOrderUuids = [actionA.uuid];
    const eva = generateBlankEVA({
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.actions[actionA.uuid] = actionA;
      m.evas[eva.uuid] = eva;
    });

    runMdau(handle, {
      aegisStations: {
        [station.refUuid]: {
          refUuid: station.refUuid,
          name: station.name,
          duration: station.duration ?? 0,
          // Length mismatch — must be rejected.
          actionOrderRefUuids: [actionA.refUuid, "nonexistent-ref"],
          updatedAt: Date.now(),
        },
      },
    });

    expect(handle.doc().stations[station.uuid].actionOrderUuids).toEqual([actionA.uuid]);
  });

  it("writes updates to a lander xgress station at the egress/ingress ends", () => {
    // Lander xgress stations are ordinary sequence members at index 0 and the
    // last index, so an MDAU update must reach them like any other station.
    const landerLocation: AEGISPoint = { lat: 1, lng: 2 };
    const egressStation = generateBlankStation({
      name: "Lander Egress",
      isLanderXgress: true,
      duration: 20,
      location: { ...landerLocation },
    });
    const ingressStation = generateBlankStation({
      name: "Lander Ingress",
      isLanderXgress: true,
      duration: 20,
      location: { ...landerLocation },
    });
    const middleStation = generateBlankStation({ name: "Vitest Alpha" });
    const traverseOut = generateBlankTraverse({ name: "Lander Egress to Vitest Alpha" });
    const traverseBack = generateBlankTraverse({ name: "Vitest Alpha to Lander Ingress" });
    const eva = generateBlankEVA({
      sequence: [
        { type: "station", uuid: egressStation.uuid },
        { type: "traverse", uuid: traverseOut.uuid },
        { type: "station", uuid: middleStation.uuid },
        { type: "traverse", uuid: traverseBack.uuid },
        { type: "station", uuid: ingressStation.uuid },
      ],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[egressStation.uuid] = egressStation;
      m.stations[middleStation.uuid] = middleStation;
      m.stations[ingressStation.uuid] = ingressStation;
      m.traverses[traverseOut.uuid] = traverseOut;
      m.traverses[traverseBack.uuid] = traverseBack;
      m.evas[eva.uuid] = eva;
    });

    const now = Date.now();
    runMdau(handle, {
      aegisStations: {
        [egressStation.refUuid]: {
          refUuid: egressStation.refUuid,
          name: "Renamed Egress",
          duration: 30,
          actionOrderRefUuids: null,
          updatedAt: now,
        },
        [ingressStation.refUuid]: {
          refUuid: ingressStation.refUuid,
          name: "Renamed Ingress",
          duration: 35,
          actionOrderRefUuids: null,
          updatedAt: now,
        },
      },
    });

    const doc = handle.doc();
    expect(doc.stations[egressStation.uuid].name).toBe("Renamed Egress");
    expect(doc.stations[egressStation.uuid].duration).toBe(30);
    expect(doc.stations[egressStation.uuid].updatedAt).toBe(now);
    expect(doc.stations[ingressStation.uuid].name).toBe("Renamed Ingress");
    expect(doc.stations[ingressStation.uuid].duration).toBe(35);
    expect(doc.stations[ingressStation.uuid].updatedAt).toBe(now);

    // Renaming an xgress station cascades to its single adjacent traverse.
    expect(doc.traverses[traverseOut.uuid].name).toContain("Renamed Egress");
    expect(doc.traverses[traverseBack.uuid].name).toContain("Renamed Ingress");
  });
});

// ── opUpdateMdau: traverses ──────────────────────────────────────────────────

describe("opUpdateMdau() — traverses", () => {
  it("updates a traverse's duration by refUuid", () => {
    const traverse = generateBlankTraverse({ name: "Vitest Path", duration: 5 });
    const eva = generateBlankEVA({
      sequence: [{ type: "traverse", uuid: traverse.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.traverses[traverse.uuid] = traverse;
      m.evas[eva.uuid] = eva;
    });

    const now = Date.now();
    runMdau(handle, {
      aegisTraverse: {
        [traverse.refUuid]: {
          refUuid: traverse.refUuid,
          duration: 20,
          actionOrderRefUuids: null,
          updatedAt: now,
        },
      },
    });

    const updated = handle.doc().traverses[traverse.uuid];
    expect(updated.duration).toBe(20);
    expect(updated.updatedAt).toBe(now);
  });
});

// ── opUpdateMdau: evas ───────────────────────────────────────────────────────

describe("opUpdateMdau() — evas", () => {
  it("updates an as-planned EVA's name and datetime", () => {
    const eva = generateBlankEVA({
      name: "Vitest EVA",
      sequence: [],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.evas[eva.uuid] = eva;
    });

    const now = Date.now();
    runMdau(handle, {
      aegisEva: {
        [eva.refUuid]: {
          refUuid: eva.refUuid,
          name: "Vitest EVA Renamed",
          maestroEventId: "evt-1",
          maestroEventUrl: "https://maestro.example/1",
          sequenceRefUuids: [],
          datetime: now,
          updatedAt: now,
        },
      },
    });

    const updated = handle.doc().evas[eva.uuid];
    expect(updated.name).toBe("Vitest EVA Renamed");
    expect(updated.datetime).toBe(now);
    expect(updated.updatedAt).toBe(now);
  });
});

// ── opUpdateMdau: actions ────────────────────────────────────────────────────

describe("opUpdateMdau() — actions", () => {
  it("maps MDAU actors to crewAssigned", () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const action = generateBlankAction({ stationUuid: station.uuid, crewAssigned: ["EV1"] });
    station.actionOrderUuids = [action.uuid];
    const eva = generateBlankEVA({
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.actions[action.uuid] = action;
      m.evas[eva.uuid] = eva;
    });

    const now = Date.now();
    runMdau(handle, {
      aegisAction: {
        [action.refUuid]: {
          refUuid: action.refUuid,
          actors: ["EV1", "EV2"],
          updatedAt: now,
        },
      },
    });

    const updated = handle.doc().actions[action.uuid];
    expect(updated.crewAssigned).toEqual(["EV1", "EV2"]);
    expect(updated.updatedAt).toBe(now);
  });
});

// ── opUpdateMdau: rexes ──────────────────────────────────────────────────────

describe("opUpdateMdau() — rexes", () => {
  const buildRexMission = () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const traverse = generateBlankTraverse({ name: "Vitest Path" });
    const action = generateBlankAction({ stationUuid: station.uuid });
    station.actionOrderUuids = [action.uuid];
    // Egress and ingress are real lander-pinned stations at either end. Their
    // location mirrors the lander's, and posEntries seed from it.
    const landerLocation: AEGISPoint = { lat: 1, lng: 2 };
    const egressStation = generateBlankStation({
      name: "Egress",
      isLanderXgress: true,
      location: { ...landerLocation },
    });
    const ingressStation = generateBlankStation({
      name: "Ingress",
      isLanderXgress: true,
      location: { ...landerLocation },
    });
    const eva = generateBlankEVA({
      sequence: [
        { type: "station", uuid: egressStation.uuid },
        { type: "station", uuid: station.uuid },
        { type: "traverse", uuid: traverse.uuid },
        { type: "station", uuid: ingressStation.uuid },
      ],
    });
    const rex = generateBlankRex({ evaUuid: eva.uuid, isRunning: false, posEntries: [] });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.stations[egressStation.uuid] = egressStation;
      m.stations[ingressStation.uuid] = ingressStation;
      m.traverses[traverse.uuid] = traverse;
      m.actions[action.uuid] = action;
      m.evas[eva.uuid] = eva;
      m.rexes[rex.uuid] = rex;
    });
    return { handle, station, egressStation, ingressStation, traverse, action, eva, rex };
  };

  it("writes rex scalar fields and resolves entry maps to uuids", () => {
    const { handle, station, egressStation, traverse, action, rex } = buildRexMission();

    const mdauRex: MDAU.MdauRex = {
      uuid: rex.uuid,
      petStartStopTimestamp: "2025-01-21T17:06:59.000Z",
      petValueAtStartStop: "+00:00:00",
      petRunning: true,
      isRunning: true,
      maestroControlled: true,
      updatedAt: Date.now(),
      maestroActivityPropertiesByRefUuid: {
        [station.refUuid]: { color: "#ff0000", number: "1" },
      },
      stationEntriesByRefUuid: {
        [station.refUuid]: {
          rexStatus: "in-progress",
          maestroPercentCompleteEv1: 50,
          maestroPercentCompleteEv2: 25,
        },
        // Egress/ingress arrive as ordinary stations, keyed by their refUuid.
        [egressStation.refUuid]: {
          rexStatus: "complete",
          maestroPercentCompleteEv1: 100,
          maestroPercentCompleteEv2: 100,
        },
      },
      traverseEntriesByRefUuid: {
        [traverse.refUuid]: {
          rexStatus: "pending",
          maestroPercentCompleteEv1: 0,
          maestroPercentCompleteEv2: 0,
        },
      },
      actionEntriesByRefUuid: {
        [action.refUuid]: {
          rexStatus: "complete",
          markerId: "M-001",
          containerId: "C-001",
          secondaryContainerId: "C-002",
        },
      },
    };

    runMdau(handle, { aegisRexes: { [rex.uuid]: mdauRex } });

    const updated = handle.doc().rexes[rex.uuid];
    expect(updated.petRunning).toBe(true);
    expect(updated.isRunning).toBe(true);
    expect(updated.maestroControlled).toBe(true);
    expect(updated.petStartStopTimestamp).toBe("2025-01-21T17:06:59.000Z");

    // Entry maps resolved to uuids
    expect(updated.stationEntries?.[station.uuid]?.rexStatus).toBe("in-progress");
    expect(updated.traverseEntries?.[traverse.uuid]?.rexStatus).toBe("pending");
    expect(updated.actionEntries?.[action.uuid]?.markerId).toBe("M-001");
    // The egress station resolves like any other station.
    expect(updated.stationEntries?.[egressStation.uuid]?.rexStatus).toBe("complete");

    // maestroActivityProperties resolved to uuid keys
    expect(updated.maestroActivityPropertiesByRefUuid?.[station.uuid]?.color).toBe("#ff0000");
  });

  it("stops other running rexes when a rex starts", () => {
    const { handle, rex } = buildRexMission();

    // Add a second, already-running rex to a second EVA.
    const otherEva = generateBlankEVA({
      sequence: [],
    });
    const otherRex = generateBlankRex({ evaUuid: otherEva.uuid, isRunning: true });
    handle.change((m) => {
      m.evas[otherEva.uuid] = otherEva;
      m.rexes[otherRex.uuid] = otherRex;
    });

    runMdau(handle, {
      aegisRexes: {
        [rex.uuid]: {
          uuid: rex.uuid,
          petStartStopTimestamp: null,
          petValueAtStartStop: "+00:00:00",
          petRunning: true,
          isRunning: true,
          maestroControlled: true,
          updatedAt: Date.now(),
          maestroActivityPropertiesByRefUuid: {},
          stationEntriesByRefUuid: {},
          traverseEntriesByRefUuid: {},
          actionEntriesByRefUuid: {},
        },
      },
    });

    const doc = handle.doc();
    expect(doc.rexes[rex.uuid].isRunning).toBe(true);
    expect(doc.rexes[otherRex.uuid].isRunning).toBe(false);
  });

  it("generates initial posEntries from the egress station's location when starting", () => {
    const { handle, rex, egressStation } = buildRexMission();

    runMdau(handle, {
      aegisRexes: {
        [rex.uuid]: {
          uuid: rex.uuid,
          petStartStopTimestamp: null,
          petValueAtStartStop: "+00:00:00",
          petRunning: true,
          isRunning: true,
          maestroControlled: true,
          updatedAt: Date.now(),
          maestroActivityPropertiesByRefUuid: {},
          stationEntriesByRefUuid: {},
          traverseEntriesByRefUuid: {},
          actionEntriesByRefUuid: {},
        },
      },
    });

    const updated = handle.doc().rexes[rex.uuid];
    expect(updated.posEntries?.length).toBe(rex.posSources.length);
    for (const entry of updated.posEntries) {
      expect(entry.location).toEqual(egressStation.location);
    }
  });
});

// ── opUpdateMdau: subscription gating ────────────────────────────────────────

describe("opUpdateMdau() — subscription gating", () => {
  it("ignores station data for an EVA that Maestro is not subscribed to", () => {
    const station = generateBlankStation({ name: "Vitest Alpha", duration: 10 });
    const eva = generateBlankEVA({
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.evas[eva.uuid] = eva;
    });

    // No subscriptions for this mission.
    globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, []);
    const warnSpy = vi.spyOn(serverLogger, "warning").mockImplementation(() => {});

    opUpdateMdau(handle, MISSION_ID, {
      aegisStations: {
        [station.refUuid]: {
          refUuid: station.refUuid,
          name: "Should Not Apply",
          duration: 99,
          actionOrderRefUuids: null,
          updatedAt: Date.now(),
        },
      },
    });

    const updated = handle.doc().stations[station.uuid];
    expect(updated.name).toBe("Vitest Alpha");
    expect(updated.duration).toBe(10);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("applies station data only for the subscribed EVA and drops the rest", () => {
    const subscribedStation = generateBlankStation({ name: "Subscribed", duration: 10 });
    const unsubscribedStation = generateBlankStation({ name: "Unsubscribed", duration: 10 });
    const subscribedEva = generateBlankEVA({
      sequence: [{ type: "station", uuid: subscribedStation.uuid }],
    });
    const unsubscribedEva = generateBlankEVA({
      sequence: [{ type: "station", uuid: unsubscribedStation.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[subscribedStation.uuid] = subscribedStation;
      m.stations[unsubscribedStation.uuid] = unsubscribedStation;
      m.evas[subscribedEva.uuid] = subscribedEva;
      m.evas[unsubscribedEva.uuid] = unsubscribedEva;
    });

    // Subscribe only to the first EVA.
    globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, [subscribedEva.uuid]);
    const warnSpy = vi.spyOn(serverLogger, "warning").mockImplementation(() => {});

    const now = Date.now();
    opUpdateMdau(handle, MISSION_ID, {
      aegisStations: {
        [subscribedStation.refUuid]: {
          refUuid: subscribedStation.refUuid,
          name: "Subscribed Updated",
          duration: 20,
          actionOrderRefUuids: null,
          updatedAt: now,
        },
        [unsubscribedStation.refUuid]: {
          refUuid: unsubscribedStation.refUuid,
          name: "Unsubscribed Updated",
          duration: 30,
          actionOrderRefUuids: null,
          updatedAt: now,
        },
      },
    });

    const doc = handle.doc();
    expect(doc.stations[subscribedStation.uuid].name).toBe("Subscribed Updated");
    expect(doc.stations[unsubscribedStation.uuid].name).toBe("Unsubscribed");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("ignores action data for an unsubscribed EVA", () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const action = generateBlankAction({ stationUuid: station.uuid, crewAssigned: ["EV1"] });
    station.actionOrderUuids = [action.uuid];
    const eva = generateBlankEVA({
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.actions[action.uuid] = action;
      m.evas[eva.uuid] = eva;
    });

    globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, []);
    const warnSpy = vi.spyOn(serverLogger, "warning").mockImplementation(() => {});

    opUpdateMdau(handle, MISSION_ID, {
      aegisAction: {
        [action.refUuid]: {
          refUuid: action.refUuid,
          actors: ["EV1", "EV2"],
          updatedAt: Date.now(),
        },
      },
    });

    expect(handle.doc().actions[action.uuid].crewAssigned).toEqual(["EV1"]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("ignores rex data for an unsubscribed EVA", () => {
    const eva = generateBlankEVA({
      sequence: [],
    });
    const rex = generateBlankRex({ evaUuid: eva.uuid, isRunning: false, maestroControlled: false });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.evas[eva.uuid] = eva;
      m.rexes[rex.uuid] = rex;
    });

    globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, []);
    const warnSpy = vi.spyOn(serverLogger, "warning").mockImplementation(() => {});

    opUpdateMdau(handle, MISSION_ID, {
      aegisRexes: {
        [rex.uuid]: {
          uuid: rex.uuid,
          petStartStopTimestamp: null,
          petValueAtStartStop: "+00:00:00",
          petRunning: true,
          isRunning: true,
          maestroControlled: true,
          updatedAt: Date.now(),
          maestroActivityPropertiesByRefUuid: {},
          stationEntriesByRefUuid: {},
          traverseEntriesByRefUuid: {},
          actionEntriesByRefUuid: {},
        },
      },
    });

    const updated = handle.doc().rexes[rex.uuid];
    expect(updated.isRunning).toBe(false);
    expect(updated.maestroControlled).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });
});
