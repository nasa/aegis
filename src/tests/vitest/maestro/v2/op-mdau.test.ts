import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { opUpdateMdau } from "server/maestro/v2/operations/op-mdau";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import type { MDAU } from "server/maestro/v2/types/mdau";

// ── Helpers ────────────────────────────────────────────────────────────────

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
    egressLocationUuid: "lander",
    ingressLocationUuid: "lander",
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
    expect(() => opUpdateMdau(handle, {})).not.toThrow();
  });

  it("updates a station's name and duration by refUuid (as-planned)", () => {
    const station = generateBlankStation({ name: "Vitest Alpha", duration: 10 });
    const eva = generateBlankEVA({
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.evas[eva.uuid] = eva;
    });

    const now = Date.now();
    opUpdateMdau(handle, {
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
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.evas[eva.uuid] = eva;
    });
    const before = handle.doc().stations[station.uuid].updatedAt;

    opUpdateMdau(handle, {
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

    opUpdateMdau(handle, {
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
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.actions[actionA.uuid] = actionA;
      m.actions[actionB.uuid] = actionB;
      m.evas[eva.uuid] = eva;
    });

    opUpdateMdau(handle, {
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
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.actions[actionA.uuid] = actionA;
      m.evas[eva.uuid] = eva;
    });

    opUpdateMdau(handle, {
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
});

// ── opUpdateMdau: traverses ──────────────────────────────────────────────────

describe("opUpdateMdau() — traverses", () => {
  it("updates a traverse's duration by refUuid", () => {
    const traverse = generateBlankTraverse({ name: "Vitest Path", duration: 5 });
    const eva = generateBlankEVA({
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      sequence: [{ type: "traverse", uuid: traverse.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.traverses[traverse.uuid] = traverse;
      m.evas[eva.uuid] = eva;
    });

    const now = Date.now();
    opUpdateMdau(handle, {
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
  it("updates an as-planned EVA's name and ingress/egress durations", () => {
    const eva = generateBlankEVA({
      name: "Vitest EVA",
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      ingressDuration: 100,
      egressDuration: 100,
      sequence: [],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.evas[eva.uuid] = eva;
    });

    const now = Date.now();
    opUpdateMdau(handle, {
      aegisEva: {
        [eva.refUuid]: {
          refUuid: eva.refUuid,
          name: "Vitest EVA Renamed",
          maestroEventId: "evt-1",
          maestroEventUrl: "https://maestro.example/1",
          sequenceRefUuids: [],
          ingressDuration: 250,
          egressDuration: 300,
          updatedAt: now,
        },
      },
    });

    const updated = handle.doc().evas[eva.uuid];
    expect(updated.name).toBe("Vitest EVA Renamed");
    expect(updated.ingressDuration).toBe(250);
    expect(updated.egressDuration).toBe(300);
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
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.actions[action.uuid] = action;
      m.evas[eva.uuid] = eva;
    });

    const now = Date.now();
    opUpdateMdau(handle, {
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
    const eva = generateBlankEVA({
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      sequence: [
        { type: "station", uuid: station.uuid },
        { type: "traverse", uuid: traverse.uuid },
      ],
    });
    const rex = generateBlankRex({ evaUuid: eva.uuid, isRunning: false, posEntries: [] });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.traverses[traverse.uuid] = traverse;
      m.actions[action.uuid] = action;
      m.evas[eva.uuid] = eva;
      m.rexes[rex.uuid] = rex;
    });
    return { handle, station, traverse, action, eva, rex };
  };

  it("writes rex scalar fields and resolves entry maps to uuids", () => {
    const { handle, station, traverse, action, rex } = buildRexMission();

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
      xgressEntries: { "xgress-1": { rexStatus: "complete" } },
      stationEntriesByRefUuid: {
        [station.refUuid]: {
          rexStatus: "in-progress",
          maestroPercentCompleteEv1: 50,
          maestroPercentCompleteEv2: 25,
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

    opUpdateMdau(handle, { aegisRexes: { [rex.uuid]: mdauRex } });

    const updated = handle.doc().rexes[rex.uuid];
    expect(updated.petRunning).toBe(true);
    expect(updated.isRunning).toBe(true);
    expect(updated.maestroControlled).toBe(true);
    expect(updated.petStartStopTimestamp).toBe("2025-01-21T17:06:59.000Z");

    // Entry maps resolved to uuids
    expect(updated.stationEntries?.[station.uuid]?.rexStatus).toBe("in-progress");
    expect(updated.traverseEntries?.[traverse.uuid]?.rexStatus).toBe("pending");
    expect(updated.actionEntries?.[action.uuid]?.markerId).toBe("M-001");
    expect(updated.xgressEntries?.["xgress-1"]?.rexStatus).toBe("complete");

    // maestroActivityProperties resolved to uuid keys
    expect(updated.maestroActivityPropertiesByRefUuid?.[station.uuid]?.color).toBe("#ff0000");
  });

  it("stops other running rexes when a rex starts", () => {
    const { handle, rex } = buildRexMission();

    // Add a second, already-running rex to a second EVA.
    const otherEva = generateBlankEVA({
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      sequence: [],
    });
    const otherRex = generateBlankRex({ evaUuid: otherEva.uuid, isRunning: true });
    handle.change((m) => {
      m.evas[otherEva.uuid] = otherEva;
      m.rexes[otherRex.uuid] = otherRex;
    });

    opUpdateMdau(handle, {
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
          xgressEntries: {},
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

  it("generates initial posEntries from the egress lander location when starting", () => {
    const { handle, rex } = buildRexMission();
    handle.change((m) => {
      m.landerLocation = { lat: 1, lng: 2 };
    });

    opUpdateMdau(handle, {
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
          xgressEntries: {},
          stationEntriesByRefUuid: {},
          traverseEntriesByRefUuid: {},
          actionEntriesByRefUuid: {},
        },
      },
    });

    const updated = handle.doc().rexes[rex.uuid];
    expect(updated.posEntries?.length).toBe(rex.posSources.length);
  });
});
