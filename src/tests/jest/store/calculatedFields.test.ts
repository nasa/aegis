import { initialState as wholeStoreInitialState } from "store/index";
import {
  getCalculatedFieldsByPoi,
  getCalculatedFieldsByTraverse,
  getCalculatedFieldsByStation,
  getCalculatedFieldsByEva,
} from "store/processing/calculatedFields";
import isEqual from "lodash/isEqual";
import cloneDeep from "lodash/cloneDeep";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";

describe("Calculated fields", () => {
  it("getCalculatedFieldsByPoi()", async () => {
    const wholeStoreState: WholeStoreState = cloneDeep(wholeStoreInitialState);
    //populate the poi state in the store
    const poi: POI = generateBlankPoi({ name: "Jest Poi-1" });
    const poiNoActions: POI = generateBlankPoi({ name: "Jest Poi-1" });
    const poiAction1: Action = {
      ...generateBlankAction({ name: "Jest Test Action-1", poiUuid: poi.uuid }),
      duration: 10,
      crewAssigned: ["EV1"],
    };
    const poiAction2: Action = {
      ...generateBlankAction({ name: "Jest Test Action-1", poiUuid: poi.uuid }),
      duration: 4,
      crewAssigned: ["EV2"],
    };
    const poiAction3: Action = {
      ...generateBlankAction({ name: "Jest Test Action-1", poiUuid: poi.uuid }),
      duration: 1,
    };
    wholeStoreState.poi.pois = [poi, poiNoActions];
    wholeStoreState.poi.poisFromDb = [poi, poiNoActions];
    wholeStoreState.action.actions = [poiAction1, poiAction2, poiAction3];
    wholeStoreState.action.actionsFromDb = [poiAction1, poiAction2, poiAction3];

    const allCalculatedFields: PoiCalculatedFields[] = [];
    for (const poi of wholeStoreState.poi.pois) {
      const actions = wholeStoreState.action.actions;
      allCalculatedFields.push(getCalculatedFieldsByPoi({ actions, poiUuid: poi.uuid }));
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
    const wholeStoreState: WholeStoreState = cloneDeep(wholeStoreInitialState);

    //populate the station state in the store
    const station: Station = generateBlankStation({ name: "Jest Station-1", duration: 10 });
    const blankMission: Mission = generateBlankMission({ name: "Jest Mission-1" });
    const stationNoActions: Station = generateBlankStation({ name: "Jest Station-1" });
    const stationAction1: Action = {
      ...generateBlankAction({ name: "Jest Test Action-1", stationUuid: station.uuid }),
      duration: 10,
      crewAssigned: ["EV1"],
    };
    const stationAction2: Action = {
      ...generateBlankAction({ name: "Jest Test Action-1", stationUuid: station.uuid }),
      duration: 4,
      crewAssigned: ["EV2"],
    };
    const stationAction3: Action = {
      ...generateBlankAction({ name: "Jest Test Action-1", stationUuid: station.uuid }),
      duration: 1,
    };

    wholeStoreState.station.stations = [station, stationNoActions];
    wholeStoreState.station.stationsFromDb = [station, stationNoActions];

    wholeStoreState.action.actions = [stationAction1, stationAction2, stationAction3];
    wholeStoreState.action.actionsFromDb = [stationAction1, stationAction2, stationAction3];

    wholeStoreState.mission.mission = { ...blankMission, traverseRate: 2 };

    const allCalculatedFields: StationCalculatedFields[] = [];
    for (const station of wholeStoreState.station.stations) {
      allCalculatedFields.push(
        getCalculatedFieldsByStation({
          stations: wholeStoreState.station.stations,
          mission: wholeStoreState.mission.mission,
          actions: wholeStoreState.action.actions,
          stationUuid: station.uuid,
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
    const wholeStoreState: WholeStoreState = cloneDeep(wholeStoreInitialState);

    const mission = generateBlankMission({ name: "Jest Mission-1", traverseRate: 3 });
    const traverse1 = generateBlankTraverse({
      name: "Jest Traverse-1",
      pathSegmentDistances: [500],
      pathSegmentElevations: [[2, 4]],
    });
    const traverse2 = generateBlankTraverse({
      name: "Jest Traverse-1",
      traverseRate: 1,
      pathSegmentDistances: [500],
      duration: 50,
    });
    const traverse3 = generateBlankTraverse({
      name: "Jest Traverse-1",
      pathSegmentDistances: [500],
      duration: 15,
    });
    const station1: Station = generateBlankStation({ name: "Jest Station-1" });
    const station2: Station = generateBlankStation({ name: "Jest Station-1" });
    const station3: Station = generateBlankStation({ name: "Jest Station-1" });
    const eva1: Eva = generateBlankEVA({ name: "Jest Eva-1" });
    eva1.sequence = [
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse1.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
    ];
    const eva2: Eva = generateBlankEVA({ name: "Jest Eva-1" });
    eva2.traverseRate = 2;
    eva2.sequence = [
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse3.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
      { uuid: traverse2.uuid, type: "traverse" },
      { uuid: station3.uuid, type: "station" },
    ];

    wholeStoreState.mission.mission = mission;
    wholeStoreState.traverse.traverses = [traverse1, traverse2, traverse3];
    wholeStoreState.station.stations = [station1, station2, station3];
    wholeStoreState.eva.evas = [eva1, eva2];

    const allCalculatedFields: TraverseCalculatedFields[] = [];
    for (const traverse of wholeStoreState.traverse.traverses) {
      allCalculatedFields.push(
        getCalculatedFieldsByTraverse({
          traverses: wholeStoreState.traverse.traverses,
          mission: wholeStoreState.mission.mission,
          evas: wholeStoreState.eva.evas,
          traverseUuid: traverse.uuid,
          actions: wholeStoreState.action.actions,
        })
      );
    }
    const t1CalcFields = allCalculatedFields.find((c) => c.uuid === traverse1.uuid);
    expect(t1CalcFields).toEqual({
      uuid: traverse1.uuid,
      reportItems: [],
      durationMinutes: 10,
      distanceMeters: 500,
      ascentDescent: { totalMetersClimbed: 2, totalMetersDescended: 0 },
      actionCount: 0,
      totalActionTime: 0,
      totalDwellTime: 0,
      totalEv1Time: 0,
      totalEv2Time: 0,
      totalMass: 0,
      totalUnassignedTime: 0,
    });
    const t2CalcFields = allCalculatedFields.find((c) => c.uuid === traverse2.uuid);
    expect(t2CalcFields.durationMinutes).toEqual(30);
    const t3CalcFields = allCalculatedFields.find((c) => c.uuid === traverse3.uuid);
    expect(t3CalcFields.durationMinutes).toEqual(15);
    expect(t3CalcFields.reportItems).toEqual([]);
  });

  test("getCalculatedFieldsByEva", async () => {
    const wholeStoreState: WholeStoreState = cloneDeep(wholeStoreInitialState);

    const mission = generateBlankMission({ name: "Jest Mission-1", traverseRate: 3 });
    const traverse = generateBlankTraverse({
      name: "Jest Traverse-1",
      pathSegmentDistances: [500],
      pathSegmentElevations: [[2, 4]],
    });
    const station1: Station = generateBlankStation({ name: "Jest Station-1" });
    const station2: Station = generateBlankStation({ name: "Jest Station-1" });
    const eva: Eva = generateBlankEVA({
      name: "Jest Eva-1",
      egressDuration: null,
      ingressDuration: null,
    });
    eva.sequence = [
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
    ];
    wholeStoreState.mission.mission = mission;
    wholeStoreState.traverse.traverses = [traverse];
    wholeStoreState.station.stations = [station1, station2];
    wholeStoreState.eva.evas = [eva];

    const allEvacalculatedFields: EvaCalculatedFields[] = [];
    for (const eva of wholeStoreState.eva.evas) {
      allEvacalculatedFields.push(
        getCalculatedFieldsByEva({
          evaUuid: eva.uuid,
          evas: wholeStoreState.eva.evas,
          stations: wholeStoreState.station.stations,
          mission: wholeStoreState.mission.mission,
          actions: wholeStoreState.action.actions,
          traverses: wholeStoreState.traverse.traverses,
        })
      );
    }

    const evaCalcFields = allEvacalculatedFields.find((c) => c.uuid === eva.uuid);
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
      totalTraverseTime: 10,
      totalTraverseDistanceMeters: 500,
      totalTraverseAscentDescent: {
        totalMetersClimbed: 2,
        totalMetersDescended: 0,
      },
      totalEvaTime: 10,
      equipmentItems: [],
      sequenceItemsCalculatedData: [
        {
          uuid: station1.uuid,
          startSeconds: 0,
          endSeconds: 0,
          manualStartSeconds: 0,
          manualEndSeconds: 900,
        },
        {
          uuid: traverse.uuid,
          startSeconds: 0,
          endSeconds: 600,
          manualStartSeconds: 900,
          manualEndSeconds: 1500,
        },
        {
          uuid: station2.uuid,
          startSeconds: 600,
          endSeconds: 600,
          manualStartSeconds: 1500,
          manualEndSeconds: 2400,
        },
      ],
    };
    expect(evaCalcFields).toEqual(expectedEvaCalcFields);
  });
});
