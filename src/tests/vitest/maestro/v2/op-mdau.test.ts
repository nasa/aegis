import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { globalValues } from "server/express/global";
import { opUpdateMdau } from "server/maestro/v2/operations/op-mdau";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStation, generateLanderXgressStation } from "store/storeUtils/station";
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

  it("updates a station's name and duration by uuid", () => {
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
        [station.uuid]: {
          uuid: station.uuid,
          name: "Vitest Bravo",
          duration: 25,
          actionOrderUuids: null,
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
        [station.uuid]: {
          uuid: station.uuid,
          name: "Vitest Alpha",
          duration: 10,
          actionOrderUuids: null,
          updatedAt: before,
        },
      },
    });

    // updatedAt must be untouched because no field changed.
    expect(handle.doc().stations[station.uuid].updatedAt).toBe(before);
  });

  it("writes when only updatedAt changed", () => {
    const station = generateBlankStation({ name: "Vitest Alpha", duration: 10 });
    const eva = generateBlankEVA({
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.evas[eva.uuid] = eva;
    });
    const newUpdatedAt = handle.doc().stations[station.uuid].updatedAt + 5000;

    runMdau(handle, {
      aegisStations: {
        [station.uuid]: {
          uuid: station.uuid,
          name: "Vitest Alpha",
          duration: 10,
          actionOrderUuids: null,
          updatedAt: newUpdatedAt,
        },
      },
    });

    expect(handle.doc().stations[station.uuid].updatedAt).toBe(newUpdatedAt);
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
        [station.uuid]: {
          uuid: station.uuid,
          name: "Vitest Charlie",
          duration: station.duration ?? 0,
          actionOrderUuids: null,
          updatedAt: Date.now(),
        },
      },
    });

    const doc = handle.doc();
    expect(doc.stations[station.uuid].name).toBe("Vitest Charlie");
    expect(doc.traverses[traverseBefore.uuid].name).toContain("Charlie");
    expect(doc.traverses[traverseAfter.uuid].name).toContain("Charlie");
  });

  it("reorders a station's actions (reorder-only) via actionOrderUuids", () => {
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
        [station.uuid]: {
          uuid: station.uuid,
          name: station.name,
          duration: station.duration ?? 0,
          // Reverse the order using uuids.
          actionOrderUuids: [actionB.uuid, actionA.uuid],
          updatedAt: Date.now(),
        },
      },
    });

    expect(handle.doc().stations[station.uuid].actionOrderUuids).toEqual([
      actionB.uuid,
      actionA.uuid,
    ]);
  });

  it("ignores actionOrderUuids when it would add/remove actions", () => {
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
        [station.uuid]: {
          uuid: station.uuid,
          name: station.name,
          duration: station.duration ?? 0,
          // Length mismatch — must be rejected.
          actionOrderUuids: [actionA.uuid, "nonexistent-uuid"],
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
    const egressStation = generateLanderXgressStation({
      xgressType: "egress",
      missionId: 0,
      duration: 20,
      location: { ...landerLocation },
      elevation: null,
    });
    const ingressStation = generateLanderXgressStation({
      xgressType: "ingress",
      missionId: 0,
      duration: 20,
      location: { ...landerLocation },
      elevation: null,
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
        [egressStation.uuid]: {
          uuid: egressStation.uuid,
          name: "Renamed Egress",
          duration: 30,
          actionOrderUuids: null,
          updatedAt: now,
        },
        [ingressStation.uuid]: {
          uuid: ingressStation.uuid,
          name: "Renamed Ingress",
          duration: 35,
          actionOrderUuids: null,
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
  it("updates a traverse's duration by uuid", () => {
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
        [traverse.uuid]: {
          uuid: traverse.uuid,
          duration: 20,
          actionOrderUuids: null,
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
        [eva.uuid]: {
          uuid: eva.uuid,
          name: "Vitest EVA Renamed",
          maestroEventId: "evt-1",
          maestroEventUrl: "https://maestro.example/1",
          sequence: [],
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

  it("writes maestroEventId/maestroEventUrl to the rex whose evaUuid matches the EVA", () => {
    const eva = generateBlankEVA({ name: "Vitest EVA", sequence: [] });
    const rex = generateBlankRex({ evaUuid: eva.uuid });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.evas[eva.uuid] = eva;
      m.rexes[rex.uuid] = rex;
    });

    const now = Date.now();
    runMdau(handle, {
      aegisEva: {
        [eva.uuid]: {
          uuid: eva.uuid,
          name: eva.name,
          maestroEventId: "evt-123",
          maestroEventUrl: "https://maestro.example/events/123",
          sequence: [],
          datetime: null,
          updatedAt: now,
        },
      },
    });

    const updated = handle.doc().rexes[rex.uuid];
    expect(updated.maestroEventId).toBe("evt-123");
    expect(updated.maestroEventUrl).toBe("https://maestro.example/events/123");
    // The EVA itself has no maestroEventId/maestroEventUrl fields.
    expect(handle.doc().evas[eva.uuid]).not.toHaveProperty("maestroEventId");
  });

  it("does not touch a rex belonging to a different EVA", () => {
    const eva = generateBlankEVA({ name: "Vitest EVA", sequence: [] });
    const otherEva = generateBlankEVA({ name: "Other EVA", sequence: [] });
    const rex = generateBlankRex({ evaUuid: eva.uuid });
    const otherRex = generateBlankRex({ evaUuid: otherEva.uuid });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.evas[eva.uuid] = eva;
      m.evas[otherEva.uuid] = otherEva;
      m.rexes[rex.uuid] = rex;
      m.rexes[otherRex.uuid] = otherRex;
    });

    runMdau(handle, {
      aegisEva: {
        [eva.uuid]: {
          uuid: eva.uuid,
          name: eva.name,
          maestroEventId: "evt-123",
          maestroEventUrl: "https://maestro.example/events/123",
          sequence: [],
          datetime: null,
          updatedAt: Date.now(),
        },
      },
    });

    const doc = handle.doc();
    expect(doc.rexes[rex.uuid].maestroEventId).toBe("evt-123");
    expect(doc.rexes[otherRex.uuid].maestroEventId).toBeNull();
    expect(doc.rexes[otherRex.uuid].maestroEventUrl).toBeNull();
  });

  it("does nothing when no rex exists for the EVA (does not throw)", () => {
    const eva = generateBlankEVA({ name: "Vitest EVA", sequence: [] });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.evas[eva.uuid] = eva;
    });

    expect(() =>
      runMdau(handle, {
        aegisEva: {
          [eva.uuid]: {
            uuid: eva.uuid,
            name: eva.name,
            maestroEventId: "evt-123",
            maestroEventUrl: "https://maestro.example/events/123",
            sequence: [],
            datetime: null,
            updatedAt: Date.now(),
          },
        },
      })
    ).not.toThrow();
  });

  it("does not rewrite rex event info when it is unchanged", () => {
    const eva = generateBlankEVA({ name: "Vitest EVA", sequence: [] });
    const rex = generateBlankRex({
      evaUuid: eva.uuid,
      maestroEventId: "evt-123",
      maestroEventUrl: "https://maestro.example/events/123",
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.evas[eva.uuid] = eva;
      m.rexes[rex.uuid] = rex;
    });
    const rexUpdatedAtBefore = handle.doc().rexes[rex.uuid].updatedAt;

    // Nothing else in the payload changes either, so opUpdateMdau should be a
    // complete no-op (verifies the "nothing to apply" early return still
    // accounts for rexEventInfo correctly when it is empty).
    runMdau(handle, {
      aegisEva: {
        [eva.uuid]: {
          uuid: eva.uuid,
          name: eva.name,
          maestroEventId: "evt-123",
          maestroEventUrl: "https://maestro.example/events/123",
          sequence: [],
          datetime: null,
          updatedAt: eva.updatedAt,
        },
      },
    });

    const updated = handle.doc().rexes[rex.uuid];
    expect(updated.maestroEventId).toBe("evt-123");
    expect(updated.maestroEventUrl).toBe("https://maestro.example/events/123");
    expect(updated.updatedAt).toBe(rexUpdatedAtBefore);
  });

  it("ignores rex event info for an EVA that Maestro is not subscribed to", () => {
    const eva = generateBlankEVA({ name: "Vitest EVA", sequence: [] });
    const rex = generateBlankRex({ evaUuid: eva.uuid });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.evas[eva.uuid] = eva;
      m.rexes[rex.uuid] = rex;
    });

    // No subscriptions for this mission — bypass the `runMdau` helper, which
    // auto-subscribes to every EVA in the doc.
    globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, []);
    const warnSpy = vi.spyOn(serverLogger, "warning").mockImplementation(() => {});

    opUpdateMdau(handle, MISSION_ID, {
      aegisEva: {
        [eva.uuid]: {
          uuid: eva.uuid,
          name: eva.name,
          maestroEventId: "evt-123",
          maestroEventUrl: "https://maestro.example/events/123",
          sequence: [],
          datetime: null,
          updatedAt: Date.now(),
        },
      },
    });

    const updated = handle.doc().rexes[rex.uuid];
    expect(updated.maestroEventId).toBeNull();
    expect(updated.maestroEventUrl).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
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
        [action.uuid]: {
          uuid: action.uuid,
          name: action.name,
          descriptionTask: action.descriptionTask,
          duration: action.duration,
          actionDefinition: action.actionDefinition,
          missionPriorityUuid: action.missionPriorityUuid,
          stmAction: action.stmAction,
          actors: ["EV1", "EV2"],
          enabled: action.enabled,
          updatedAt: now,
        },
      },
    });

    const updated = handle.doc().actions[action.uuid];
    expect(updated.crewAssigned).toEqual(["EV1", "EV2"]);
    expect(updated.updatedAt).toBe(now);
  });

  /**
   * Build a mission with one action on one station, plus a set of mission
   * actionDefinitions the incoming actionDefinition can be validated against.
   */
  const buildActionMission = () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const action = generateBlankAction({ stationUuid: station.uuid, crewAssigned: ["EV1"] });
    station.actionOrderUuids = [action.uuid];
    const eva = generateBlankEVA({
      sequence: [{ type: "station", uuid: station.uuid }],
    });

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.actionDefinitions = {
        verbs: { "verb-1": { name: "Collect", abbr: "COL" } },
        nouns: { "noun-1": { name: "Regolith", abbr: "REG" } },
        adjectives: { "adj-1": { name: "Shadowed", abbr: "SHD" } },
      };
      m.missionPriorities = {
        "priority-1": { trace: "SIMD-0005.1", category: "Vitest Category" },
      };
      m.stations[station.uuid] = station;
      m.actions[action.uuid] = action;
      m.evas[eva.uuid] = eva;
    });
    return { handle, action };
  };

  /** A full MdauAction with every field, overridable per-test. */
  const mdauAction = (
    action: Action,
    overrides: Partial<MDAU.MdauAction> = {}
  ): MDAU.MdauAction => ({
    uuid: action.uuid,
    name: action.name,
    descriptionTask: action.descriptionTask,
    duration: action.duration,
    actionDefinition: action.actionDefinition,
    missionPriorityUuid: action.missionPriorityUuid,
    stmAction: action.stmAction,
    actors: action.crewAssigned,
    enabled: action.enabled,
    updatedAt: Date.now(),
    ...overrides,
  });

  it("writes name, descriptionTask, duration and stmAction", () => {
    const { handle, action } = buildActionMission();
    const now = Date.now();

    runMdau(handle, {
      aegisAction: {
        [action.uuid]: mdauAction(action, {
          name: "Renamed Action",
          descriptionTask: "Scoop the sample",
          duration: 17,
          stmAction: true,
          updatedAt: now,
        }),
      },
    });

    const updated = handle.doc().actions[action.uuid];
    expect(updated.name).toBe("Renamed Action");
    expect(updated.descriptionTask).toBe("Scoop the sample");
    expect(updated.duration).toBe(17);
    expect(updated.stmAction).toBe(true);
    expect(updated.updatedAt).toBe(now);
  });

  it("writes an actionDefinition whose uuids all exist in the mission", () => {
    const { handle, action } = buildActionMission();

    runMdau(handle, {
      aegisAction: {
        [action.uuid]: mdauAction(action, {
          actionDefinition: { verbUuid: "verb-1", nounUuid: "noun-1", adjectiveUuid: "adj-1" },
        }),
      },
    });

    expect(handle.doc().actions[action.uuid].actionDefinition).toEqual({
      verbUuid: "verb-1",
      nounUuid: "noun-1",
      adjectiveUuid: "adj-1",
    });
  });

  it("clears the actionDefinition when Maestro sends null", () => {
    const { handle, action } = buildActionMission();
    handle.change((m) => {
      m.actions[action.uuid].actionDefinition = { verbUuid: "verb-1" };
    });

    runMdau(handle, {
      aegisAction: { [action.uuid]: mdauAction(action, { actionDefinition: null }) },
    });

    expect(handle.doc().actions[action.uuid].actionDefinition).toBeNull();
  });

  it("writes a missionPriorityUuid that exists in the mission", () => {
    const { handle, action } = buildActionMission();

    runMdau(handle, {
      aegisAction: {
        [action.uuid]: mdauAction(action, { missionPriorityUuid: "priority-1" }),
      },
    });

    expect(handle.doc().actions[action.uuid].missionPriorityUuid).toBe("priority-1");
  });

  it("clears the missionPriorityUuid when Maestro sends null", () => {
    const { handle, action } = buildActionMission();
    handle.change((m) => {
      m.actions[action.uuid].missionPriorityUuid = "priority-1";
    });

    runMdau(handle, {
      aegisAction: { [action.uuid]: mdauAction(action, { missionPriorityUuid: null }) },
    });

    expect(handle.doc().actions[action.uuid].missionPriorityUuid).toBeNull();
  });

  it("does not stage an action when missionPriorityUuid matches the doc", () => {
    const { handle, action } = buildActionMission();
    handle.change((m) => {
      m.actions[action.uuid].missionPriorityUuid = "priority-1";
    });
    const doc = handle.doc().actions[action.uuid];
    const changeMock = handle.change as unknown as ReturnType<typeof vi.fn>;
    const changesBefore = changeMock.mock.calls.length;

    runMdau(handle, {
      aegisAction: {
        [action.uuid]: mdauAction(action, {
          missionPriorityUuid: "priority-1",
          updatedAt: doc.updatedAt,
        }),
      },
    });

    expect(changeMock.mock.calls.length).toBe(changesBefore);
  });

  it("disables an action when Maestro sends enabled false", () => {
    const { handle, action } = buildActionMission();
    expect(handle.doc().actions[action.uuid].enabled).toBe(true);

    runMdau(handle, {
      aegisAction: { [action.uuid]: mdauAction(action, { enabled: false }) },
    });

    expect(handle.doc().actions[action.uuid].enabled).toBe(false);
  });

  it("re-enables a disabled action when Maestro sends enabled true", () => {
    const { handle, action } = buildActionMission();
    handle.change((m) => {
      m.actions[action.uuid].enabled = false;
    });

    runMdau(handle, {
      aegisAction: { [action.uuid]: mdauAction(action, { enabled: true }) },
    });

    expect(handle.doc().actions[action.uuid].enabled).toBe(true);
  });

  it("does not stage an action when enabled matches the doc", () => {
    const { handle, action } = buildActionMission();
    const doc = handle.doc().actions[action.uuid];
    const changeMock = handle.change as unknown as ReturnType<typeof vi.fn>;
    const changesBefore = changeMock.mock.calls.length;

    runMdau(handle, {
      aegisAction: {
        [action.uuid]: mdauAction(action, {
          enabled: doc.enabled,
          updatedAt: doc.updatedAt,
        }),
      },
    });

    // `enabled` must be diffed against the doc, not the empty stage, otherwise
    // every payload carrying the field would trigger a write.
    expect(changeMock.mock.calls.length).toBe(changesBefore);
  });

  it("does not stage an action when nothing at all differs", () => {
    const { handle, action } = buildActionMission();
    const originalUpdatedAt = handle.doc().actions[action.uuid].updatedAt;

    runMdau(handle, {
      aegisAction: { [action.uuid]: mdauAction(action, { updatedAt: originalUpdatedAt }) },
    });

    expect(handle.doc().actions[action.uuid].updatedAt).toBe(originalUpdatedAt);
  });

  it("stages an action when only updatedAt differs", () => {
    const { handle, action } = buildActionMission();
    const newUpdatedAt = handle.doc().actions[action.uuid].updatedAt + 5000;

    runMdau(handle, {
      aegisAction: { [action.uuid]: mdauAction(action, { updatedAt: newUpdatedAt }) },
    });

    expect(handle.doc().actions[action.uuid].updatedAt).toBe(newUpdatedAt);
  });
});

// ── opUpdateMdau: rexes ──────────────────────────────────────────────────────

describe("opUpdateMdau() — rexes", () => {
  const buildRexMission = () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const traverse = generateBlankTraverse({ name: "Vitest Path" });
    const action = generateBlankAction({ stationUuid: station.uuid });
    station.actionOrderUuids = [action.uuid];
    const landerLocation: AEGISPoint = { lat: 1, lng: 2 };
    const egressStation = generateLanderXgressStation({
      xgressType: "egress",
      name: "Egress",
      missionId: 0,
      location: { ...landerLocation },
      elevation: null,
    });
    const ingressStation = generateLanderXgressStation({
      xgressType: "ingress",
      name: "Ingress",
      missionId: 0,
      location: { ...landerLocation },
      elevation: null,
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
    const rexUpdatedAt = Date.now() + 5000;

    const mdauRex: MDAU.MdauRex = {
      uuid: rex.uuid,
      petStartStopTimestamp: "2025-01-21T17:06:59.000Z",
      petValueAtStartStop: "+00:00:00",
      petRunning: true,
      isRunning: true,
      maestroControlled: true,
      executeEditMode: "unrestricted",
      updatedAt: rexUpdatedAt,
      maestroActivityProperties: {
        [station.uuid]: { color: "#ff0000", number: "1" },
      },
      stationEntries: {
        [station.uuid]: {
          rexStatus: "in-progress",
          maestroPercentCompleteEv1: 50,
          maestroPercentCompleteEv2: 25,
        },
        [egressStation.uuid]: {
          rexStatus: "complete",
          maestroPercentCompleteEv1: 100,
          maestroPercentCompleteEv2: 100,
        },
      },
      traverseEntries: {
        [traverse.uuid]: {
          rexStatus: "pending",
          maestroPercentCompleteEv1: 0,
          maestroPercentCompleteEv2: 0,
        },
      },
      actionEntries: {
        [action.uuid]: {
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
    expect(updated.updatedAt).toBe(rexUpdatedAt);

    // Entry maps resolved to uuids
    expect(updated.stationEntries?.[station.uuid]?.rexStatus).toBe("in-progress");
    expect(updated.traverseEntries?.[traverse.uuid]?.rexStatus).toBe("pending");
    expect(updated.actionEntries?.[action.uuid]?.markerId).toBe("M-001");
    expect(updated.stationEntries?.[egressStation.uuid]?.rexStatus).toBe("complete");

    // maestroActivityProperties resolved to uuid keys
    expect(updated.maestroActivityProperties?.[station.uuid]?.color).toBe("#ff0000");
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
          executeEditMode: "unrestricted",
          updatedAt: Date.now(),
          maestroActivityProperties: {},
          stationEntries: {},
          traverseEntries: {},
          actionEntries: {},
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
          executeEditMode: "unrestricted",
          updatedAt: Date.now(),
          maestroActivityProperties: {},
          stationEntries: {},
          traverseEntries: {},
          actionEntries: {},
        },
      },
    });

    const updated = handle.doc().rexes[rex.uuid];
    expect(updated.posEntries?.length).toBe(rex.posSources.length);
    for (const entry of updated.posEntries) {
      expect(entry.location).toEqual(egressStation.location);
    }
  });

  it("writes executeEditMode before the rex has ever been executed", () => {
    const { handle, rex } = buildRexMission();
    expect(rex.executeEditMode).toBe("unrestricted");

    runMdau(handle, {
      aegisRexes: {
        [rex.uuid]: {
          uuid: rex.uuid,
          petStartStopTimestamp: null,
          petValueAtStartStop: "+00:00:00",
          petRunning: false,
          isRunning: false,
          maestroControlled: true,
          executeEditMode: "limited",
          updatedAt: Date.now(),
          maestroActivityProperties: {},
          stationEntries: {},
          traverseEntries: {},
          actionEntries: {},
        },
      },
    });

    expect(handle.doc().rexes[rex.uuid].executeEditMode).toBe("limited");
  });

  it("applies an incoming executeEditMode before freezing it when the same payload starts the rex", () => {
    const { handle, rex } = buildRexMission();

    runMdau(handle, {
      aegisRexes: {
        [rex.uuid]: {
          uuid: rex.uuid,
          petStartStopTimestamp: null,
          petValueAtStartStop: "+00:00:00",
          petRunning: true,
          isRunning: true,
          maestroControlled: true,
          executeEditMode: "none",
          updatedAt: Date.now(),
          maestroActivityProperties: {},
          stationEntries: {},
          traverseEntries: {},
          actionEntries: {},
        },
      },
    });

    const updated = handle.doc().rexes[rex.uuid];
    expect(updated.executeEditMode).toBe("none");
    expect(updated.executeEditState).not.toBeNull();
  });

  it("ignores executeEditMode once the rex has already been executed", () => {
    const { handle, rex } = buildRexMission();

    // First payload starts and freezes the rex under "limited".
    runMdau(handle, {
      aegisRexes: {
        [rex.uuid]: {
          uuid: rex.uuid,
          petStartStopTimestamp: null,
          petValueAtStartStop: "+00:00:00",
          petRunning: true,
          isRunning: true,
          maestroControlled: true,
          executeEditMode: "limited",
          updatedAt: Date.now(),
          maestroActivityProperties: {},
          stationEntries: {},
          traverseEntries: {},
          actionEntries: {},
        },
      },
    });
    expect(handle.doc().rexes[rex.uuid].executeEditMode).toBe("limited");

    // A later payload trying to switch to "none" must be ignored since the
    // rex is already frozen.
    runMdau(handle, {
      aegisRexes: {
        [rex.uuid]: {
          uuid: rex.uuid,
          petStartStopTimestamp: null,
          petValueAtStartStop: "+00:00:00",
          petRunning: false,
          isRunning: false,
          maestroControlled: true,
          executeEditMode: "none",
          updatedAt: Date.now(),
          maestroActivityProperties: {},
          stationEntries: {},
          traverseEntries: {},
          actionEntries: {},
        },
      },
    });

    expect(handle.doc().rexes[rex.uuid].executeEditMode).toBe("limited");
  });
});

// ── opUpdateMdau: action add / delete ────────────────────────────────────────

describe("opUpdateMdau() — action add/delete", () => {
  /** Build a mission with two actions on one station and one on a traverse. */
  const buildAddDeleteMission = () => {
    const station = generateBlankStation({ name: "Vitest Alpha" });
    const traverse = generateBlankTraverse({ name: "Vitest Path" });
    const actionA = generateBlankAction({ stationUuid: station.uuid, name: "A" });
    const actionB = generateBlankAction({ stationUuid: station.uuid, name: "B" });
    const traverseAction = generateBlankAction({ traverseUuid: traverse.uuid, name: "T" });
    station.actionOrderUuids = [actionA.uuid, actionB.uuid];
    traverse.actionOrderUuids = [traverseAction.uuid];
    const eva = generateBlankEVA({
      sequence: [
        { type: "station", uuid: station.uuid },
        { type: "traverse", uuid: traverse.uuid },
      ],
    });
    const rex = generateBlankRex({ evaUuid: eva.uuid, isRunning: false, posEntries: [] });
    rex.actionEntries = {
      [actionB.uuid]: {
        rexStatus: "pending",
        markerId: "",
        containerId: "",
        secondaryContainerId: "",
      },
    };

    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.stations[station.uuid] = station;
      m.traverses[traverse.uuid] = traverse;
      m.actions[actionA.uuid] = actionA;
      m.actions[actionB.uuid] = actionB;
      m.actions[traverseAction.uuid] = traverseAction;
      m.evas[eva.uuid] = eva;
      m.rexes[rex.uuid] = rex;
    });
    return { handle, station, traverse, actionA, actionB, traverseAction, rex };
  };

  const mdauActionFrom = (
    action: Pick<Action, "uuid" | "name">,
    overrides: Partial<MDAU.MdauAction> = {}
  ): MDAU.MdauAction => ({
    uuid: action.uuid,
    name: action.name,
    descriptionTask: null,
    duration: 6,
    actionDefinition: null,
    missionPriorityUuid: null,
    stmAction: false,
    actors: [],
    enabled: true,
    updatedAt: Date.now(),
    ...overrides,
  });

  const mdauStationFrom = (station: Station, actionOrderUuids: string[]): MDAU.MdauStation => ({
    uuid: station.uuid,
    name: station.name,
    duration: station.duration,
    actionOrderUuids,
    updatedAt: station.updatedAt,
  });

  it("adds a new action listed in its parent station's actionOrderUuids", () => {
    const { handle, station, actionA, actionB, traverseAction } = buildAddDeleteMission();
    const newActionUuid = "vitest-new-action";
    const updatedAt = Date.now() + 1000;

    runMdau(handle, {
      aegisStations: {
        [station.uuid]: mdauStationFrom(station, [actionA.uuid, newActionUuid, actionB.uuid]),
      },
      aegisAction: {
        [actionA.uuid]: mdauActionFrom(actionA),
        [actionB.uuid]: mdauActionFrom(actionB),
        [traverseAction.uuid]: mdauActionFrom(traverseAction),
        [newActionUuid]: mdauActionFrom(
          { uuid: newActionUuid, name: "New" },
          { duration: 15, actors: ["EV2"], descriptionTask: "Collect sample", updatedAt }
        ),
      },
    });

    const doc = handle.doc();
    const created = doc.actions[newActionUuid];
    expect(created).toBeDefined();
    expect(created.stationUuid).toBe(station.uuid);
    expect(created.traverseUuid).toBeNull();
    expect(created.name).toBe("New");
    expect(created.duration).toBe(15);
    expect(created.crewAssigned).toEqual(["EV2"]);
    expect(created.descriptionTask).toBe("Collect sample");
    expect(created.updatedAt).toBe(updatedAt);
    expect(doc.stations[station.uuid].actionOrderUuids).toEqual([
      actionA.uuid,
      newActionUuid,
      actionB.uuid,
    ]);
  });

  it("adds a new action to a traverse", () => {
    const { handle, traverse, actionA, actionB, traverseAction } = buildAddDeleteMission();
    const newActionUuid = "vitest-new-traverse-action";

    runMdau(handle, {
      aegisTraverse: {
        [traverse.uuid]: {
          uuid: traverse.uuid,
          duration: traverse.duration,
          actionOrderUuids: [newActionUuid, traverseAction.uuid],
          updatedAt: traverse.updatedAt,
        },
      },
      aegisAction: {
        [actionA.uuid]: mdauActionFrom(actionA),
        [actionB.uuid]: mdauActionFrom(actionB),
        [traverseAction.uuid]: mdauActionFrom(traverseAction),
        [newActionUuid]: mdauActionFrom({ uuid: newActionUuid, name: "New" }),
      },
    });

    const doc = handle.doc();
    expect(doc.actions[newActionUuid].traverseUuid).toBe(traverse.uuid);
    expect(doc.actions[newActionUuid].stationUuid).toBeNull();
    expect(doc.traverses[traverse.uuid].actionOrderUuids).toEqual([
      newActionUuid,
      traverseAction.uuid,
    ]);
  });

  it("ignores a new action that no parent's actionOrderUuids lists", () => {
    const { handle, actionA, actionB, traverseAction } = buildAddDeleteMission();
    const warnSpy = vi.spyOn(serverLogger, "warning").mockImplementation(() => {});
    const newActionUuid = "vitest-orphan-action";

    runMdau(handle, {
      aegisAction: {
        [actionA.uuid]: mdauActionFrom(actionA),
        [actionB.uuid]: mdauActionFrom(actionB),
        [traverseAction.uuid]: mdauActionFrom(traverseAction),
        [newActionUuid]: mdauActionFrom({ uuid: newActionUuid, name: "Orphan" }),
      },
    });

    expect(handle.doc().actions[newActionUuid]).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("deletes an action missing from aegisAction when its parent station is sent", () => {
    const { handle, station, actionA, actionB, traverseAction, rex } = buildAddDeleteMission();

    runMdau(handle, {
      aegisStations: { [station.uuid]: mdauStationFrom(station, [actionA.uuid]) },
      aegisAction: {
        [actionA.uuid]: mdauActionFrom(actionA),
        [traverseAction.uuid]: mdauActionFrom(traverseAction),
      },
    });

    const doc = handle.doc();
    expect(doc.actions[actionB.uuid]).toBeUndefined();
    expect(doc.actions[actionA.uuid]).toBeDefined();
    expect(doc.stations[station.uuid].actionOrderUuids).toEqual([actionA.uuid]);
    expect(doc.rexes[rex.uuid].actionEntries?.[actionB.uuid]).toBeUndefined();
  });

  it("does not delete a missing action whose parent is not in the payload", () => {
    const { handle, station, actionA, actionB, traverseAction } = buildAddDeleteMission();

    runMdau(handle, {
      aegisStations: { [station.uuid]: mdauStationFrom(station, [actionA.uuid, actionB.uuid]) },
      // traverseAction is missing, but its traverse is not in the payload.
      aegisAction: {
        [actionA.uuid]: mdauActionFrom(actionA),
        [actionB.uuid]: mdauActionFrom(actionB),
      },
    });

    expect(handle.doc().actions[traverseAction.uuid]).toBeDefined();
  });

  it("does not delete anything when aegisAction is absent", () => {
    const { handle, station, actionA, actionB } = buildAddDeleteMission();

    runMdau(handle, {
      aegisStations: { [station.uuid]: mdauStationFrom(station, [actionB.uuid, actionA.uuid]) },
    });

    const doc = handle.doc();
    expect(doc.actions[actionA.uuid]).toBeDefined();
    expect(doc.actions[actionB.uuid]).toBeDefined();
    expect(doc.stations[station.uuid].actionOrderUuids).toEqual([actionB.uuid, actionA.uuid]);
  });

  it("adds and deletes actions on the same station in one payload", () => {
    const { handle, station, actionA, actionB, traverseAction } = buildAddDeleteMission();
    const newActionUuid = "vitest-replacement-action";

    runMdau(handle, {
      aegisStations: { [station.uuid]: mdauStationFrom(station, [newActionUuid, actionB.uuid]) },
      aegisAction: {
        [actionB.uuid]: mdauActionFrom(actionB),
        [traverseAction.uuid]: mdauActionFrom(traverseAction),
        [newActionUuid]: mdauActionFrom({ uuid: newActionUuid, name: "Replacement" }),
      },
    });

    const doc = handle.doc();
    expect(doc.actions[actionA.uuid]).toBeUndefined();
    expect(doc.actions[newActionUuid].stationUuid).toBe(station.uuid);
    expect(doc.stations[station.uuid].actionOrderUuids).toEqual([newActionUuid, actionB.uuid]);
  });

  it("rejects an actionOrderUuids that drops an action still present in aegisAction", () => {
    const { handle, station, actionA, actionB, traverseAction } = buildAddDeleteMission();
    const warnSpy = vi.spyOn(serverLogger, "warning").mockImplementation(() => {});

    runMdau(handle, {
      aegisStations: { [station.uuid]: mdauStationFrom(station, [actionA.uuid]) },
      aegisAction: {
        [actionA.uuid]: mdauActionFrom(actionA),
        [actionB.uuid]: mdauActionFrom(actionB),
        [traverseAction.uuid]: mdauActionFrom(traverseAction),
      },
    });

    const doc = handle.doc();
    expect(doc.actions[actionB.uuid]).toBeDefined();
    expect(doc.stations[station.uuid].actionOrderUuids).toEqual([actionA.uuid, actionB.uuid]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("does not delete an action missing from aegisAction that is still in the parent's actionOrderUuids", () => {
    const { handle, station, actionA, actionB, traverseAction } = buildAddDeleteMission();

    runMdau(handle, {
      aegisStations: { [station.uuid]: mdauStationFrom(station, [actionA.uuid, actionB.uuid]) },
      aegisAction: {
        [actionA.uuid]: mdauActionFrom(actionA),
        [traverseAction.uuid]: mdauActionFrom(traverseAction),
      },
    });

    const doc = handle.doc();
    expect(doc.actions[actionB.uuid]).toBeDefined();
    expect(doc.stations[station.uuid].actionOrderUuids).toEqual([actionA.uuid, actionB.uuid]);
  });

  it("does not add an action listed in actionOrderUuids that is missing from aegisAction", () => {
    const { handle, station, actionA, actionB, traverseAction } = buildAddDeleteMission();
    const warnSpy = vi.spyOn(serverLogger, "warning").mockImplementation(() => {});
    const unknownActionUuid = "vitest-unknown-action";

    runMdau(handle, {
      aegisStations: {
        [station.uuid]: mdauStationFrom(station, [actionA.uuid, actionB.uuid, unknownActionUuid]),
      },
      aegisAction: {
        [actionA.uuid]: mdauActionFrom(actionA),
        [actionB.uuid]: mdauActionFrom(actionB),
        [traverseAction.uuid]: mdauActionFrom(traverseAction),
      },
    });

    const doc = handle.doc();
    expect(doc.actions[unknownActionUuid]).toBeUndefined();
    expect(doc.stations[station.uuid].actionOrderUuids).toEqual([actionA.uuid, actionB.uuid]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("does not delete a missing action when the parent's actionOrderUuids is null", () => {
    const { handle, station, actionA, traverseAction, actionB } = buildAddDeleteMission();

    runMdau(handle, {
      aegisStations: {
        [station.uuid]: { ...mdauStationFrom(station, []), actionOrderUuids: null },
      },
      aegisAction: {
        [actionA.uuid]: mdauActionFrom(actionA),
        [traverseAction.uuid]: mdauActionFrom(traverseAction),
      },
    });

    expect(handle.doc().actions[actionB.uuid]).toBeDefined();
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
        [station.uuid]: {
          uuid: station.uuid,
          name: "Should Not Apply",
          duration: 99,
          actionOrderUuids: null,
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
        [subscribedStation.uuid]: {
          uuid: subscribedStation.uuid,
          name: "Subscribed Updated",
          duration: 20,
          actionOrderUuids: null,
          updatedAt: now,
        },
        [unsubscribedStation.uuid]: {
          uuid: unsubscribedStation.uuid,
          name: "Unsubscribed Updated",
          duration: 30,
          actionOrderUuids: null,
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
        [action.uuid]: {
          uuid: action.uuid,
          name: action.name,
          descriptionTask: action.descriptionTask,
          duration: action.duration,
          actionDefinition: action.actionDefinition,
          missionPriorityUuid: action.missionPriorityUuid,
          stmAction: action.stmAction,
          actors: ["EV1", "EV2"],
          enabled: action.enabled,
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
          executeEditMode: "unrestricted",
          updatedAt: Date.now(),
          maestroActivityProperties: {},
          stationEntries: {},
          traverseEntries: {},
          actionEntries: {},
        },
      },
    });

    const updated = handle.doc().rexes[rex.uuid];
    expect(updated.isRunning).toBe(false);
    expect(updated.maestroControlled).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });
});
