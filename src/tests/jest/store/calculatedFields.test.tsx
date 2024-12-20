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
      durationLower: 5,
      durationUpper: 10,
      crewAssigned: ["EV1"],
    };
    const poiAction2: Action = {
      ...generateBlankAction({ name: "Jest Test Action-1", poiUuid: poi.uuid }),
      durationLower: 2,
      durationUpper: 4,
      crewAssigned: ["EV2"],
    };
    const poiAction3: Action = {
      ...generateBlankAction({ name: "Jest Test Action-1", poiUuid: poi.uuid }),
      durationLower: 1,
      durationUpper: 1,
    };
    wholeStoreState.poi.pois = [poi, poiNoActions];
    wholeStoreState.poi.poisFromDb = [poi, poiNoActions];
    wholeStoreState.action.actions = [poiAction1, poiAction2, poiAction3];
    wholeStoreState.action.actionsFromDb = [poiAction1, poiAction2, poiAction3];

    const allCalculatedFields: PoiCalculatedFields[] = [];
    for (const poi of wholeStoreState.poi.pois) {
      allCalculatedFields.push(getCalculatedFieldsByPoi({ wholeStoreState, poiUuid: poi.uuid }));
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
    expect(poiCalcField.totalActionTime).toEqual({
      durationLower: 8,
      durationUpper: 15,
    });
    expect(poiCalcField.totalEv1Time).toEqual({
      durationLower: 5,
      durationUpper: 10,
    });
    expect(poiCalcField.totalEv2Time).toEqual({
      durationLower: 2,
      durationUpper: 4,
    });
    expect(poiCalcField.totalUnassignedTime).toEqual({
      durationLower: 1,
      durationUpper: 1,
    });
    expect(poiCalcField.totalDwellTime).toEqual({
      durationLower: 5,
      durationUpper: 10,
    });
    expect(poiCalcField.actionCount).toEqual(3);
  });

  test("getCalculatedFieldsByStation()", async () => {
    const wholeStoreState: WholeStoreState = cloneDeep(wholeStoreInitialState);

    //populate the station state in the store
    const station: Station = generateBlankStation({ name: "Jest Station-1" });
    const blankMission: Mission = generateBlankMission({ name: "Jest Mission-1" });
    const stationNoActions: Station = generateBlankStation({ name: "Jest Station-1" });
    const stationAction1: Action = {
      ...generateBlankAction({ name: "Jest Test Action-1", stationUuid: station.uuid }),
      durationLower: 5,
      durationUpper: 10,
      crewAssigned: ["EV1"],
    };
    const stationAction2: Action = {
      ...generateBlankAction({ name: "Jest Test Action-1", stationUuid: station.uuid }),
      durationLower: 2,
      durationUpper: 4,
      crewAssigned: ["EV2"],
    };
    const stationAction3: Action = {
      ...generateBlankAction({ name: "Jest Test Action-1", stationUuid: station.uuid }),
      durationLower: 1,
      durationUpper: 1,
    };

    wholeStoreState.station.stations = [station, stationNoActions];
    wholeStoreState.station.stationsFromDb = [station, stationNoActions];

    wholeStoreState.action.actions = [stationAction1, stationAction2, stationAction3];
    wholeStoreState.action.actionsFromDb = [stationAction1, stationAction2, stationAction3];

    wholeStoreState.mission.mission = { ...blankMission, traverseRate: 2 };

    const allCalculatedFields: StationCalculatedFields[] = [];
    for (const station of wholeStoreState.station.stations) {
      allCalculatedFields.push(
        getCalculatedFieldsByStation({ wholeStoreState, stationUuid: station.uuid })
      );
    }

    //two calculated fields for the 2 stations in the store
    expect(allCalculatedFields.length).toEqual(2);

    //check station that has no actions
    const stationNoActionsCalcField = allCalculatedFields.find(
      (c) => c.uuid === stationNoActions.uuid
    );
    expect(stationNoActionsCalcField.reportItems.length).toEqual(3);
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
    expect(stationCalcField.totalActionTime).toEqual({
      durationLower: 8,
      durationUpper: 15,
    });
    expect(stationCalcField.totalEv1Time).toEqual({
      durationLower: 5,
      durationUpper: 10,
    });
    expect(stationCalcField.totalEv2Time).toEqual({
      durationLower: 2,
      durationUpper: 4,
    });
    expect(stationCalcField.totalUnassignedTime).toEqual({
      durationLower: 1,
      durationUpper: 1,
    });
    expect(stationCalcField.totalDwellTime).toEqual({
      durationLower: 5,
      durationUpper: 10,
    });
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
      predictedDurationLower: 50,
      predictedDurationUpper: 50,
    });
    const traverse3 = generateBlankTraverse({
      name: "Jest Traverse-1",
      pathSegmentDistances: [500],
      predictedDurationLower: 15,
      predictedDurationUpper: 15,
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
        getCalculatedFieldsByTraverse({ wholeStoreState, traverseUuid: traverse.uuid })
      );
    }
    const t1CalcFields = allCalculatedFields.find((c) => c.uuid === traverse1.uuid);
    expect(t1CalcFields).toEqual({
      uuid: traverse1.uuid,
      reportItems: [
        {
          message: "Calculated traverse duration is over predicted maximum traverse time",
          type: "error",
        },
      ],
      durationMinutes: 10,
      distanceMeters: 500,
      ascentDescent: { totalMetersClimbed: 2, totalMetersDescended: 0 },
    });
    const t2CalcFields = allCalculatedFields.find((c) => c.uuid === traverse2.uuid);
    expect(t2CalcFields.durationMinutes).toEqual(30);
    expect(t2CalcFields.reportItems).toEqual([
      {
        message: "Calculated traverse duration is under predicted nominal traverse time",
        type: "info",
      },
    ]);
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
      allEvacalculatedFields.push(getCalculatedFieldsByEva({ wholeStoreState, evaUuid: eva.uuid }));
    }

    const evaCalcFields = allEvacalculatedFields.find((c) => c.uuid === eva.uuid);
    expect(evaCalcFields).toEqual({
      uuid: eva.uuid,
      reportItems: [],
      totalActionTime: {
        durationLower: 0,
        durationUpper: 0,
      },
      totalEv1Time: {
        durationLower: 0,
        durationUpper: 0,
      },
      totalEv2Time: {
        durationLower: 0,
        durationUpper: 0,
      },
      totalUnassignedTime: {
        durationLower: 0,
        durationUpper: 0,
      },
      totalDwellTime: {
        durationLower: 0,
        durationUpper: 0,
      },
      actionCount: 0,
      totalMass: 0,
      totalTraverseTime: 10,
      totalTraverseDistanceMeters: 500,
      totalTraverseAscentDescent: {
        totalMetersClimbed: 2,
        totalMetersDescended: 0,
      },
      totalEvaTime: {
        durationLower: 10,
        durationUpper: 10,
      },
      equipmentItems: [],
      sequenceItemsCalculatedData: [
        {
          uuid: station1.uuid,
          startSeconds: 0,
          endSeconds: 0,
        },
        {
          uuid: traverse.uuid,
          startSeconds: 0,
          endSeconds: 600,
        },
        {
          uuid: station2.uuid,
          startSeconds: 600,
          endSeconds: 600,
        },
      ],
    });
  });
});
