import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { opUpdateStationName } from "operations/op-station";
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

// ── opUpdateStationName ────────────────────────────────────────────────────

describe("opUpdateStationName()", () => {
  it("updates the station name in the doc", () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const traverseBefore = generateBlankTraverse({ name: "Vitest Lander to Alpha" });
    const traverseAfter = generateBlankTraverse({ name: "Vitest Alpha to Lander" });
    const eva = buildEvaWithStation(station, traverseBefore, traverseAfter);

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.traverses[traverseBefore.uuid] = traverseBefore;
      m.traverses[traverseAfter.uuid] = traverseAfter;
      m.evas[eva.uuid] = eva;
    });

    opUpdateStationName(handle, station.uuid, "Vitest Bravo");

    expect(handle.doc().stations[station.uuid].name).toBe("Vitest Bravo");
  });

  it("cascades the rename into adjacent traverses that embed the old station name", () => {
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

    opUpdateStationName(handle, station.uuid, "Bravo");

    const doc = handle.doc();
    // The traverse before should now end with the new station name
    expect(doc.traverses[traverseBefore.uuid].name).toContain("Bravo");
    // The traverse after should now start with the new station name
    expect(doc.traverses[traverseAfter.uuid].name).toContain("Bravo");
  });

  it("does nothing when missionDocHandle is falsy", () => {
    // Should not throw
    expect(() =>
      opUpdateStationName(null as unknown as DocHandle<Mission>, "uuid", "X")
    ).not.toThrow();
  });

  it("does nothing when stationUuid is empty", () => {
    const handle = getMissionDocHandle();
    expect(() => opUpdateStationName(handle, "", "Bravo")).not.toThrow();
  });

  it("does nothing when newName is empty", () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
    });
    opUpdateStationName(handle, station.uuid, "");
    // Name should remain unchanged
    expect(handle.doc().stations[station.uuid].name).toBe("Vitest Alpha");
  });

  it("does nothing when the station uuid does not exist in the doc", () => {
    const handle = getMissionDocHandle();
    // Should not throw even though no station exists
    expect(() => opUpdateStationName(handle, uuidv4(), "Bravo")).not.toThrow();
  });

  it("does not rename traverses when the name is unchanged", () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const traverseBefore = generateBlankTraverse({ name: "Vitest Lander to Alpha" });
    const traverseAfter = generateBlankTraverse({ name: "Vitest Alpha to Lander" });
    const eva = buildEvaWithStation(station, traverseBefore, traverseAfter);

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.traverses[traverseBefore.uuid] = traverseBefore;
      m.traverses[traverseAfter.uuid] = traverseAfter;
      m.evas[eva.uuid] = eva;
    });

    opUpdateStationName(handle, station.uuid, "Vitest Alpha");

    // Traverse names should be unchanged since the station name did not change
    expect(handle.doc().traverses[traverseBefore.uuid].name).toBe("Vitest Lander to Alpha");
    expect(handle.doc().traverses[traverseAfter.uuid].name).toBe("Vitest Alpha to Lander");
  });
});
