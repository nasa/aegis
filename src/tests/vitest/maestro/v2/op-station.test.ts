import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { opApplyMdauStationUpdatesV2 } from "operations/op-station";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { v4 as uuidv4 } from "uuid";

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
    m.rexes = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

// ── opApplyMdauStationUpdatesV2 ────────────────────────────────────────────

describe("opApplyMdauStationUpdatesV2()", () => {
  it("does nothing when stations array is empty", () => {
    const handle = getMissionDocHandle();
    // Should not throw
    expect(() => opApplyMdauStationUpdatesV2(handle, [])).not.toThrow();
  });

  it("updates a station's name by uuid", () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
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

    opApplyMdauStationUpdatesV2(handle, [{ uuid: station.uuid, name: "Vitest Bravo" }]);

    expect(handle.doc().stations[station.uuid].name).toBe("Vitest Bravo");
  });

  it("updates multiple stations in a single atomic change", () => {
    const stationA = generateBlankStation({ name: "Vitest Alpha" });
    const stationB = generateBlankStation({ name: "Vitest Beta" });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[stationA.uuid] = stationA;
      m.stations[stationB.uuid] = stationB;
    });

    opApplyMdauStationUpdatesV2(handle, [
      { uuid: stationA.uuid, name: "Vitest Alpha Updated" },
      { uuid: stationB.uuid, name: "Vitest Beta Updated" },
    ]);

    const doc = handle.doc();
    expect(doc.stations[stationA.uuid].name).toBe("Vitest Alpha Updated");
    expect(doc.stations[stationB.uuid].name).toBe("Vitest Beta Updated");
  });

  it("cascades traverse renames when a station name changes via MDAU", () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const traverseBefore = generateBlankTraverse({ name: "Vitest Lander to Alpha" });
    const traverseAfter = generateBlankTraverse({ name: "Vitest Alpha to Lander" });
    const eva = buildEvaWithStation(station, traverseBefore, traverseAfter, {
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.traverses[traverseBefore.uuid] = traverseBefore;
      m.traverses[traverseAfter.uuid] = traverseAfter;
      m.evas[eva.uuid] = eva;
    });

    opApplyMdauStationUpdatesV2(handle, [{ uuid: station.uuid, name: "Vitest Charlie" }]);

    const doc = handle.doc();
    expect(doc.traverses[traverseBefore.uuid].name).toContain("Charlie");
    expect(doc.traverses[traverseAfter.uuid].name).toContain("Charlie");
  });

  it("does not overwrite uuid, refUuid, or rexUuid even if different values are provided", () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const originalUuid = station.uuid;
    const originalRefUuid = station.refUuid;

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
    });

    opApplyMdauStationUpdatesV2(handle, [
      {
        uuid: originalUuid,
        refUuid: uuidv4(), // different refUuid — should be ignored
        rexUuid: uuidv4(), // rexUuid — should be ignored
        name: "Vitest Bravo",
      },
    ]);

    const updated = handle.doc().stations[originalUuid];
    expect(updated.uuid).toBe(originalUuid);
    expect(updated.refUuid).toBe(originalRefUuid);
    expect(updated.name).toBe("Vitest Bravo");
  });

  it("does not cascade traverse renames when the incoming station name is unchanged", () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const traverseBefore = generateBlankTraverse({ name: "Vitest Lander to Alpha" });
    const traverseAfter = generateBlankTraverse({ name: "Vitest Alpha to Lander" });
    const eva = buildEvaWithStation(station, traverseBefore, traverseAfter, {
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.traverses[traverseBefore.uuid] = traverseBefore;
      m.traverses[traverseAfter.uuid] = traverseAfter;
      m.evas[eva.uuid] = eva;
    });

    opApplyMdauStationUpdatesV2(handle, [{ uuid: station.uuid, name: "Vitest Alpha" }]);

    // Traverse names must remain untouched since the station name did not change
    const doc = handle.doc();
    expect(doc.traverses[traverseBefore.uuid].name).toBe("Vitest Lander to Alpha");
    expect(doc.traverses[traverseAfter.uuid].name).toBe("Vitest Alpha to Lander");
  });
});
