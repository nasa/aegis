/**
 * Subscription gating for the Maestro v2 MDAU pipeline.
 *
 * Exercises the private `isEntitySubscribed` helper through its only caller,
 * `stageMdau`. The cases below encode the EVA/REX relationships:
 *
 *  - a station may be in several as-planned EVAs at once (sequence and/or
 *    ingress/egress), so its actions are in those EVAs too;
 *  - a traverse is in exactly one EVA and is never shared;
 *  - creating a REX duplicates the EVA and its stations/traverses/actions,
 *    preserving refUuids but issuing new uuids, so a refUuid only resolves
 *    within its own scope.
 */
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStation, generateLanderXgressStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { stageMdau } from "server/maestro/v2/operations/stage-mdau";
import { serverLogger } from "utils/logging/serverLogger";
import type { MDAU } from "server/maestro/v2/types/mdau";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Assemble a mission doc from loose entities. */
const buildMission = (args: {
  evas?: Eva[];
  stations?: Station[];
  traverses?: Traverse[];
  actions?: Action[];
  rexes?: Rex[];
}): Mission => {
  const mission = generateBlankMission({ id: 9999 });
  for (const eva of args.evas ?? []) mission.evas[eva.uuid] = eva;
  for (const station of args.stations ?? []) mission.stations[station.uuid] = station;
  for (const traverse of args.traverses ?? []) mission.traverses[traverse.uuid] = traverse;
  for (const action of args.actions ?? []) mission.actions[action.uuid] = action;
  for (const rex of args.rexes ?? []) mission.rexes[rex.uuid] = rex;
  return mission;
};

/** An `aegisStations` payload that renames one station. */
const stationPayload = (
  refUuid: string,
  name: string,
  rexUuid?: string
): MDAU.MaestroDataAegisUses => ({
  aegisStations: {
    [refUuid]: {
      refUuid,
      name,
      duration: 15,
      actionOrderRefUuids: null,
      updatedAt: 1_700_000_000_000,
      ...(rexUuid ? { rexUuid } : {}),
    },
  },
});

/** An `aegisTraverse` payload that changes one traverse's duration. */
const traversePayload = (refUuid: string, duration: number): MDAU.MaestroDataAegisUses => ({
  aegisTraverse: {
    [refUuid]: {
      refUuid,
      duration,
      actionOrderRefUuids: null,
      updatedAt: 1_700_000_000_000,
    },
  },
});

/** An `aegisAction` payload that reassigns one action's crew. */
const actionPayload = (refUuid: string, actors: string[]): MDAU.MaestroDataAegisUses => ({
  aegisAction: {
    [refUuid]: {
      refUuid,
      name: "Vitest Action",
      descriptionTask: null,
      duration: null,
      actionDefinition: null,
      stmAction: false,
      actors,
      updatedAt: 1_700_000_000_000,
    },
  },
});

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(serverLogger, "warning").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Stations shared across as-planned EVAs ─────────────────────────────────

describe("stageMdau() subscription check - stations in multiple as-planned EVAs", () => {
  /**
   * One station in the sequence of two as-planned EVAs.
   */
  const buildSharedStationMission = () => {
    const station = generateBlankStation({ name: "Shared", duration: 15 });
    const evaA = generateBlankEVA({ sequence: [{ type: "station", uuid: station.uuid }] });
    const evaB = generateBlankEVA({ sequence: [{ type: "station", uuid: station.uuid }] });
    return {
      station,
      evaA,
      evaB,
      mission: buildMission({ evas: [evaA, evaB], stations: [station] }),
    };
  };

  it("accepts the station when subscribed to the first EVA only", () => {
    const { station, evaA, mission } = buildSharedStationMission();

    const stage = stageMdau(
      mission,
      stationPayload(station.refUuid, "Renamed"),
      new Set([evaA.uuid])
    );

    expect(stage.stations).toHaveLength(1);
    expect(stage.stations[0].uuid).toBe(station.uuid);
    expect(stage.stations[0].name).toBe("Renamed");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("accepts the station when subscribed to the second EVA only", () => {
    const { station, evaB, mission } = buildSharedStationMission();

    const stage = stageMdau(
      mission,
      stationPayload(station.refUuid, "Renamed"),
      new Set([evaB.uuid])
    );

    expect(stage.stations).toHaveLength(1);
    expect(stage.stations[0].uuid).toBe(station.uuid);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("drops the station when subscribed to neither EVA", () => {
    const { station, mission } = buildSharedStationMission();
    const unrelatedEva = generateBlankEVA({ sequence: [] });

    const stage = stageMdau(
      mission,
      stationPayload(station.refUuid, "Renamed"),
      new Set([unrelatedEva.uuid])
    );

    expect(stage.stations).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("accepts a station occupying another EVA's ingress/egress position", () => {
    // Here the shared station is mid-sequence in evaA and sits at evaB's ingress (last) position
    const station = generateBlankStation({ name: "Xgress", duration: 15 });
    const makeLander = (xgressType: "egress" | "ingress", name: string) =>
      generateLanderXgressStation({
        xgressType,
        name,
        missionId: 0,
        location: { lat: 0, lng: 0 },
        elevation: null,
      });
    const egressA = makeLander("egress", "Lander Egress A");
    const ingressA = makeLander("ingress", "Lander Ingress A");
    const egressB = makeLander("egress", "Lander Egress B");
    const traverseA1 = generateBlankTraverse({ name: "Lander Egress A to Xgress" });
    const traverseA2 = generateBlankTraverse({ name: "Xgress to Lander Ingress A" });
    const traverseB1 = generateBlankTraverse({ name: "Lander Egress B to Xgress" });

    const evaA = generateBlankEVA({
      sequence: [
        { type: "station", uuid: egressA.uuid },
        { type: "traverse", uuid: traverseA1.uuid },
        { type: "station", uuid: station.uuid },
        { type: "traverse", uuid: traverseA2.uuid },
        { type: "station", uuid: ingressA.uuid },
      ],
    });
    const evaB = generateBlankEVA({
      sequence: [
        { type: "station", uuid: egressB.uuid },
        { type: "traverse", uuid: traverseB1.uuid },
        { type: "station", uuid: station.uuid },
      ],
    });
    const mission = buildMission({
      evas: [evaA, evaB],
      stations: [station, egressA, ingressA, egressB],
      traverses: [traverseA1, traverseA2, traverseB1],
    });

    const stage = stageMdau(
      mission,
      stationPayload(station.refUuid, "Renamed"),
      new Set([evaB.uuid])
    );

    expect(stage.stations).toHaveLength(1);
    expect(stage.stations[0].uuid).toBe(station.uuid);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("accepts a lander xgress station at the egress position of a subscribed EVA", () => {
    const egress = generateLanderXgressStation({
      xgressType: "egress",
      missionId: 0,
      duration: 15,
      location: { lat: 0, lng: 0 },
      elevation: null,
    });
    const middle = generateBlankStation({ name: "Vitest Middle" });
    const ingress = generateLanderXgressStation({
      xgressType: "ingress",
      missionId: 0,
      duration: 15,
      location: { lat: 0, lng: 0 },
      elevation: null,
    });
    const traverseOut = generateBlankTraverse({ name: "Lander Egress to Vitest Middle" });
    const traverseBack = generateBlankTraverse({ name: "Vitest Middle to Lander Ingress" });

    const eva = generateBlankEVA({
      sequence: [
        { type: "station", uuid: egress.uuid },
        { type: "traverse", uuid: traverseOut.uuid },
        { type: "station", uuid: middle.uuid },
        { type: "traverse", uuid: traverseBack.uuid },
        { type: "station", uuid: ingress.uuid },
      ],
    });
    const mission = buildMission({
      evas: [eva],
      stations: [egress, middle, ingress],
      traverses: [traverseOut, traverseBack],
    });

    const stage = stageMdau(
      mission,
      stationPayload(egress.refUuid, "Renamed Egress"),
      new Set([eva.uuid])
    );

    expect(stage.stations).toHaveLength(1);
    expect(stage.stations[0].uuid).toBe(egress.uuid);
    expect(stage.stations[0].name).toBe("Renamed Egress");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ── Actions inherit their parent station's EVAs ────────────────────────────

describe("stageMdau() subscription check — actions on a shared station", () => {
  /** An action hanging off a station that is in two as-planned EVAs. */
  const buildSharedActionMission = () => {
    const station = generateBlankStation({ name: "Shared" });
    const action = generateBlankAction({ stationUuid: station.uuid, crewAssigned: ["EV1"] });
    station.actionOrderUuids = [action.uuid];
    const evaA = generateBlankEVA({ sequence: [{ type: "station", uuid: station.uuid }] });
    const evaB = generateBlankEVA({ sequence: [{ type: "station", uuid: station.uuid }] });
    const mission = buildMission({
      evas: [evaA, evaB],
      stations: [station],
      actions: [action],
    });
    return { action, evaA, evaB, mission };
  };

  it("accepts the action when subscribed to the first EVA only", () => {
    const { action, evaA, mission } = buildSharedActionMission();

    const stage = stageMdau(mission, actionPayload(action.refUuid, ["EV2"]), new Set([evaA.uuid]));

    expect(stage.actions).toHaveLength(1);
    expect(stage.actions[0].uuid).toBe(action.uuid);
    expect(stage.actions[0].crewAssigned).toEqual(["EV2"]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("accepts the action when subscribed to the second EVA only", () => {
    const { action, evaB, mission } = buildSharedActionMission();

    const stage = stageMdau(mission, actionPayload(action.refUuid, ["EV2"]), new Set([evaB.uuid]));

    expect(stage.actions).toHaveLength(1);
    expect(stage.actions[0].uuid).toBe(action.uuid);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("drops the action when subscribed to neither EVA", () => {
    const { action, mission } = buildSharedActionMission();

    const stage = stageMdau(
      mission,
      actionPayload(action.refUuid, ["EV2"]),
      new Set(["not-an-eva"])
    );

    expect(stage.actions).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ── Traverses are never shared ─────────────────────────────────────────────

describe("stageMdau() subscription check — traverses belong to exactly one EVA", () => {
  it("drops a traverse when subscribed to a different EVA", () => {
    const traverse = generateBlankTraverse({ duration: 10 });
    const evaWithTraverse = generateBlankEVA({
      sequence: [{ type: "traverse", uuid: traverse.uuid }],
    });
    const otherEva = generateBlankEVA({ sequence: [] });
    const mission = buildMission({
      evas: [evaWithTraverse, otherEva],
      traverses: [traverse],
    });

    const stage = stageMdau(
      mission,
      traversePayload(traverse.refUuid, 42),
      new Set([otherEva.uuid])
    );

    expect(stage.traverses).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("accepts a traverse when subscribed to its own EVA", () => {
    const traverse = generateBlankTraverse({ duration: 10 });
    const eva = generateBlankEVA({ sequence: [{ type: "traverse", uuid: traverse.uuid }] });
    const mission = buildMission({ evas: [eva], traverses: [traverse] });

    const stage = stageMdau(mission, traversePayload(traverse.refUuid, 42), new Set([eva.uuid]));

    expect(stage.traverses).toHaveLength(1);
    expect(stage.traverses[0].uuid).toBe(traverse.uuid);
    expect(stage.traverses[0].duration).toBe(42);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ── REX scopes ─────────────────────────────────────────────────────────────

describe("stageMdau() subscription check — rex scopes", () => {
  /**
   * An as-planned EVA with one station, executed twice. Both rex copies keep
   * the as-planned refUuids but carry fresh uuids.
   */
  const buildExecutedMission = () => {
    const refUuid = "ref-station-1";
    const plannedStation = generateBlankStation({ refUuid, name: "Planned", duration: 15 });
    const plannedEva = generateBlankEVA({
      sequence: [{ type: "station", uuid: plannedStation.uuid }],
    });

    const buildRexCopy = (name: string) => {
      const station = generateBlankStation({ refUuid, name, duration: 15 });
      const eva = generateBlankEVA({
        refUuid: plannedEva.refUuid,
        sequence: [{ type: "station", uuid: station.uuid }],
      });
      const rex = generateBlankRex({ evaUuid: eva.uuid });
      return { station, eva, rex };
    };

    const rexA = buildRexCopy("RexA");
    const rexB = buildRexCopy("RexB");

    const mission = buildMission({
      evas: [plannedEva, rexA.eva, rexB.eva],
      stations: [plannedStation, rexA.station, rexB.station],
      rexes: [rexA.rex, rexB.rex],
    });

    return { refUuid, plannedStation, plannedEva, rexA, rexB, mission };
  };

  it("resolves a shared refUuid to the station of the addressed rex", () => {
    const { refUuid, rexA, rexB, mission } = buildExecutedMission();

    const stageA = stageMdau(
      mission,
      stationPayload(refUuid, "Renamed", rexA.rex.uuid),
      new Set([rexA.eva.uuid])
    );
    const stageB = stageMdau(
      mission,
      stationPayload(refUuid, "Renamed", rexB.rex.uuid),
      new Set([rexB.eva.uuid])
    );

    expect(stageA.stations).toHaveLength(1);
    expect(stageA.stations[0].uuid).toBe(rexA.station.uuid);
    expect(stageB.stations).toHaveLength(1);
    expect(stageB.stations[0].uuid).toBe(rexB.station.uuid);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("drops a rex-scoped station when subscribed only to a different rex's EVA", () => {
    const { refUuid, rexA, rexB, mission } = buildExecutedMission();

    const stage = stageMdau(
      mission,
      stationPayload(refUuid, "Renamed", rexA.rex.uuid),
      new Set([rexB.eva.uuid])
    );

    expect(stage.stations).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("drops the as-planned station when subscribed only to a rex's EVA", () => {
    const { refUuid, rexA, mission } = buildExecutedMission();

    // No rexUuid on the payload → resolves to the as-planned station.
    const stage = stageMdau(mission, stationPayload(refUuid, "Renamed"), new Set([rexA.eva.uuid]));

    expect(stage.stations).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("accepts the as-planned station when subscribed to the as-planned EVA", () => {
    const { refUuid, plannedStation, plannedEva, mission } = buildExecutedMission();

    const stage = stageMdau(
      mission,
      stationPayload(refUuid, "Renamed"),
      new Set([plannedEva.uuid])
    );

    expect(stage.stations).toHaveLength(1);
    expect(stage.stations[0].uuid).toBe(plannedStation.uuid);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("accepts a rex only when its EVA is subscribed", () => {
    const { rexA, rexB, mission } = buildExecutedMission();

    const rexFields: Omit<MDAU.MdauRex, "uuid"> = {
      petStartStopTimestamp: null,
      petValueAtStartStop: "+00:00:00",
      petRunning: true,
      isRunning: true,
      maestroControlled: true,
      updatedAt: 1_700_000_000_000,
      maestroActivityPropertiesByRefUuid: {},
      stationEntriesByRefUuid: {},
      traverseEntriesByRefUuid: {},
      actionEntriesByRefUuid: {},
    };

    const subscribed = stageMdau(
      mission,
      { aegisRexes: { [rexA.rex.uuid]: { uuid: rexA.rex.uuid, ...rexFields } } },
      new Set([rexA.eva.uuid])
    );
    expect(subscribed.rexes).toHaveLength(1);
    expect(subscribed.rexes[0].uuid).toBe(rexA.rex.uuid);

    const unsubscribed = stageMdau(
      mission,
      { aegisRexes: { [rexA.rex.uuid]: { uuid: rexA.rex.uuid, ...rexFields } } },
      new Set([rexB.eva.uuid])
    );
    expect(unsubscribed.rexes).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });
});
