import {
  getCalcFieldsForPoi,
  getCalcFieldsForTraverse,
  getCalcFieldsForStation,
  getCalcFieldsForEva,
} from "store/processing/calculatedFields";
import isEqual from "lodash/isEqual";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";

describe("Calculated fields", () => {
  it("getCalculatedFieldsByPoi()", async () => {
    //populate the poi state in the store
    const poi: POI = generateBlankPoi({ name: "Vitest Poi-1" });
    const poiNoActions: POI = generateBlankPoi({ name: "Vitest Poi-1" });
    const poiAction1: Action = {
      ...generateBlankAction({ name: "Vitest Test Action-1", poiUuid: poi.uuid }),
      duration: 10,
      crewAssigned: ["EV1"],
    };
    const poiAction2: Action = {
      ...generateBlankAction({ name: "Vitest Test Action-1", poiUuid: poi.uuid }),
      duration: 4,
      crewAssigned: ["EV2"],
    };
    const poiAction3: Action = {
      ...generateBlankAction({ name: "Vitest Test Action-1", poiUuid: poi.uuid }),
      duration: 1,
    };
    const poiActions_all = [poiAction1, poiAction2, poiAction3];

    const pois = [poi, poiNoActions];
    const allCalculatedFields: PoiCalculatedFields[] = [];
    for (const p of pois) {
      const actions = poiActions_all;
      const poiActions = actions.filter((a) => a.poiUuid === p.uuid && a.enabled);
      allCalculatedFields.push(getCalcFieldsForPoi({ poiActions, poiUuid: p.uuid }));
    }

    //check poi that has no actions
    expect(allCalculatedFields.length).toEqual(2);
    const poiNoActionsCalcField = allCalculatedFields.find((c) => c.uuid === poiNoActions.uuid);
    expect(poiNoActionsCalcField.reportItems.length).toEqual(1);
    expect(poiNoActionsCalcField.reportItems[0]).toEqual({
      message: "POI has no actions",
      type: "warning",
    });

    //check poi with actions
    const poiCalcField = allCalculatedFields.find((c) => c.uuid === poi.uuid);
    expect(poiCalcField.uuid).toEqual(poi.uuid);
    expect(poiCalcField.totalActionTime).toEqual(15);
    expect(poiCalcField.totalEv1Time).toEqual(10);
    expect(poiCalcField.totalEv2Time).toEqual(4);
    expect(poiCalcField.totalUnassignedTime).toEqual(1);
    expect(poiCalcField.totalDwellTime).toEqual(10);
    expect(poiCalcField.actionCount).toEqual(3);
  });

  test("getCalculatedFieldsByStation()", async () => {
    //populate the station list (entity collections live on Automerge now;
    //these tests just need plain local arrays to drive the calculator)
    const station: Station = generateBlankStation({ name: "Vitest Station-1", duration: 10 });
    const blankMission: Mission = generateBlankMission({ name: "Vitest Mission-1" });
    const stationNoActions: Station = generateBlankStation({ name: "Vitest Station-1" });
    const stationAction1: Action = {
      ...generateBlankAction({ name: "Vitest Test Action-1", stationUuid: station.uuid }),
      duration: 10,
      crewAssigned: ["EV1"],
    };
    const stationAction2: Action = {
      ...generateBlankAction({ name: "Vitest Test Action-1", stationUuid: station.uuid }),
      duration: 4,
      crewAssigned: ["EV2"],
    };
    const stationAction3: Action = {
      ...generateBlankAction({ name: "Vitest Test Action-1", stationUuid: station.uuid }),
      duration: 1,
    };

    const stations: Station[] = [station, stationNoActions];
    const stationActions_all = [stationAction1, stationAction2, stationAction3];

    const allCalculatedFields: StationCalculatedFields[] = [];
    for (const s of stations) {
      const stationActions = stationActions_all.filter(
        (a) => a.stationUuid === s.uuid && a.enabled
      );
      allCalculatedFields.push(
        getCalcFieldsForStation({
          station: s,
          missionWalkbackRate: blankMission.walkbackRate,
          stationActions,
        })
      );
    }

    //two calculated fields for the 2 stations in the store
    expect(allCalculatedFields.length).toEqual(2);

    //check station that has no actions
    const stationNoActionsCalcField = allCalculatedFields.find(
      (c) => c.uuid === stationNoActions.uuid
    );
    expect(stationNoActionsCalcField.reportItems.length).toEqual(4);
    expect(
      stationNoActionsCalcField.reportItems.find((r) =>
        isEqual(r, {
          message: "Station has no actions",
          type: "warning",
        })
      )
    ).toBeTruthy();
    expect(
      stationNoActionsCalcField.reportItems.find((r) =>
        isEqual(r, {
          message: "Station location not yet set",
          type: "warning",
        })
      )
    ).toBeTruthy();
    expect(
      stationNoActionsCalcField.reportItems.find((r) =>
        isEqual(r, {
          message: "Station has no associated POIs",
          type: "info",
        })
      )
    ).toBeTruthy();

    //check station with actions
    const stationCalcField = allCalculatedFields.find((c) => c.uuid === station.uuid);
    expect(stationCalcField.uuid).toEqual(station.uuid);
    expect(stationCalcField.totalActionTime).toEqual(15);
    expect(stationCalcField.totalEv1Time).toEqual(10);
    expect(stationCalcField.totalEv2Time).toEqual(4);
    expect(stationCalcField.totalUnassignedTime).toEqual(1);
    expect(stationCalcField.totalDwellTime).toEqual(10);
    expect(stationCalcField.actionCount).toEqual(3);
  });

  test("getCalculatedFieldsByTraverse", async () => {
    const mission = generateBlankMission({ name: "Vitest Mission-1", traverseRate: 3 });
    const traverse1 = generateBlankTraverse({
      name: "Vitest Traverse-1",
      pathSegmentDistances: [500],
      pathSegmentElevations: [[2, 4]],
    });
    const traverse2 = generateBlankTraverse({
      name: "Vitest Traverse-1",
      traverseRate: 1,
      pathSegmentDistances: [500],
      duration: 50,
    });
    const traverse3 = generateBlankTraverse({
      name: "Vitest Traverse-1",
      pathSegmentDistances: [500],
      duration: 15,
    });
    const station1: Station = generateBlankStation({ name: "Vitest Station-1" });
    const station2: Station = generateBlankStation({ name: "Vitest Station-1" });
    const station3: Station = generateBlankStation({ name: "Vitest Station-1" });
    const eva1: Eva = generateBlankEVA({ name: "Vitest Eva-1" });
    eva1.sequence = [
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse1.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
    ];
    const eva2: Eva = generateBlankEVA({ name: "Vitest Eva-1" });
    eva2.traverseRate = 2;
    eva2.sequence = [
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse3.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
      { uuid: traverse2.uuid, type: "traverse" },
      { uuid: station3.uuid, type: "station" },
    ];

    const traverses = [traverse1, traverse2, traverse3];
    const evas = [eva1, eva2];

    const traverseActions_all: Action[] = [];
    const allCalculatedFields: TraverseCalculatedFields[] = [];
    for (const traverse of traverses) {
      const traverseEva = evas.find((eva: Eva) =>
        eva.sequence.some((seqItem) => seqItem.uuid === traverse.uuid)
      );
      const traverseActions = traverseActions_all.filter(
        (a) => a.traverseUuid === traverse.uuid && a.enabled
      );
      allCalculatedFields.push(
        getCalcFieldsForTraverse({
          traverse,
          missionTraverseRate: mission.traverseRate,
          evaTraverseRate: traverseEva.traverseRate,
          traverseActions,
        })
      );
    }
    const t1CalcFields = allCalculatedFields.find((c) => c.uuid === traverse1.uuid);
    expect(t1CalcFields).toEqual({
      uuid: traverse1.uuid,
      reportItems: [],
      movementDurationMinutes: 10,
      distanceMeters: 500,
      ascentDescent: { totalMetersClimbed: 2, totalMetersDescended: 0 },
      actionCount: 0,
      totalActionTime: 0,
      totalDwellTime: 0,
      totalEv1Time: 0,
      totalEv2Time: 0,
      totalMass: 0,
      totalUnassignedTime: 0,
      totalEquipmentItems: {},
      bearings: [],
    });
    const t2CalcFields = allCalculatedFields.find((c) => c.uuid === traverse2.uuid);
    expect(t2CalcFields.movementDurationMinutes).toEqual(30);
    const t3CalcFields = allCalculatedFields.find((c) => c.uuid === traverse3.uuid);
    expect(t3CalcFields.movementDurationMinutes).toEqual(15);
    expect(t3CalcFields.reportItems).toEqual([]);
  });

  test("getCalculatedFieldsByEva", async () => {
    const mission = generateBlankMission({ name: "Vitest Mission-1", traverseRate: 3 });
    const traverse = generateBlankTraverse({
      name: "Vitest Traverse-1",
      pathSegmentDistances: [500],
      pathSegmentElevations: [[2, 4]],
    });
    const station1: Station = generateBlankStation({ name: "Vitest Station-1" });
    const station2: Station = generateBlankStation({ name: "Vitest Station-1" });
    const eva: Eva = generateBlankEVA({
      name: "Vitest Eva-1",
    });
    eva.sequence = [
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
    ];
    const traverses = [traverse];
    const stations = [station1, station2];
    const evas = [eva];

    const evaActions_all: Action[] = [];
    const allEvaCalculatedFields: EvaCalculatedFields[] = [];
    for (const e of evas) {
      allEvaCalculatedFields.push(
        getCalcFieldsForEva({
          eva: e,
          evaStations: stations,
          missionWalkbackRate: mission.walkbackRate,
          missionTraverseRate: mission.traverseRate,
          evaActions: evaActions_all,
          evaTraverses: traverses,
        })
      );
    }

    const evaCalcFields = allEvaCalculatedFields.find((c) => c.uuid === eva.uuid);
    const expectedEvaCalcFields: EvaCalculatedFields = {
      uuid: eva.uuid,
      reportItems: [],
      totalActionTime: 0,
      totalEv1Time: 0,
      totalEv2Time: 0,
      totalUnassignedTime: 0,
      totalDwellTime: 0,
      actionCount: 0,
      totalMass: 0,
      totalTraverseMovementTime: 10,
      totalTraverseDistanceMeters: 500,
      totalTraverseAscentDescent: {
        totalMetersClimbed: 2,
        totalMetersDescended: 0,
      },
      totalResolvedEvaTime: 40,
      totalResolvedStationTime: 30,
      totalResolvedTraverseTime: 10,
      totalEquipmentItems: {},
      sequenceItemsCalculatedData: [
        {
          uuid: station1.uuid,
          startSeconds: 0,
          endSeconds: 0,
          manualStartSeconds: 0,
          manualEndSeconds: 900,
          resolvedDurationMins: 15,
        },
        {
          uuid: traverse.uuid,
          startSeconds: 0,
          endSeconds: 600,
          manualStartSeconds: 900,
          manualEndSeconds: 1500,
          resolvedDurationMins: 10,
        },
        {
          uuid: station2.uuid,
          startSeconds: 600,
          endSeconds: 600,
          manualStartSeconds: 1500,
          manualEndSeconds: 2400,
          resolvedDurationMins: 15,
        },
      ],
    };
    expect(evaCalcFields).toEqual(expectedEvaCalcFields);
  });

  test("getCalcFieldsForEva skips sequence items whose entity does not resolve", async () => {
    // Adding a station to an EVA inserts a placeholder sequence item with an
    // empty uuid until the user picks a station, so the calculator has to
    // tolerate sequence items that resolve to nothing.
    const mission = generateBlankMission({ name: "Vitest Mission-1", traverseRate: 3 });
    const traverse = generateBlankTraverse({
      name: "Vitest Traverse-1",
      pathSegmentDistances: [500],
      pathSegmentElevations: [[2, 4]],
    });
    const station1: Station = generateBlankStation({ name: "Vitest Station-1" });
    const station2: Station = generateBlankStation({ name: "Vitest Station-2" });
    const eva: Eva = generateBlankEVA({ name: "Vitest Eva-1" });
    eva.sequence = [
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse.uuid, type: "traverse" },
      { uuid: "", type: "station" }, // station not chosen yet
      { uuid: "", type: "traverse" }, // traverse not built yet
      { uuid: station2.uuid, type: "station" },
    ];

    const evaCalcFields = getCalcFieldsForEva({
      eva,
      evaStations: [station1, station2],
      missionWalkbackRate: mission.walkbackRate,
      missionTraverseRate: mission.traverseRate,
      evaActions: [],
      evaTraverses: [traverse],
    });

    // The unresolved items contribute nothing and are absent from the output,
    // while the resolvable items total up exactly as they do without them.
    expect(evaCalcFields.sequenceItemsCalculatedData.map((d) => d.uuid)).toEqual([
      station1.uuid,
      traverse.uuid,
      station2.uuid,
    ]);
    expect(evaCalcFields.totalTraverseMovementTime).toEqual(10);
    expect(evaCalcFields.totalTraverseDistanceMeters).toEqual(500);
    expect(evaCalcFields.totalResolvedEvaTime).toEqual(40);
    expect(evaCalcFields.totalResolvedStationTime).toEqual(30);
    expect(evaCalcFields.totalResolvedTraverseTime).toEqual(10);
  });
});
