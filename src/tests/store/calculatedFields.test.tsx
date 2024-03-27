import { initialState as wholeStoreInitialState } from "store/index";
import { createTestMission } from "../factories/MissionFactory";
import { createTestTraverse } from "../factories/TraverseFactory";
import { createTestStation } from "../factories/StationFactory";
import { createTestEva } from "../factories/EVAFactory";
import {
  getCalculatedFieldsByPoi,
  getCalculatedFieldsByTraverse,
  getCalculatedFieldsByStation,
  getCalculatedFieldsByEva,
} from "store/processing/calculatedFields";
import _ from "lodash";
import { createTestAction } from "tests/factories/ActionFactory";
import { createTestPoi } from "tests/factories/PoiFactory";

describe("Calculated fields", () => {
  it("getCalculatedFieldsByPoi()", async () => {
    const wholeStoreState: WholeStoreState = _.cloneDeep(wholeStoreInitialState);
    //populate the poi state in the store
    const poi: POI = createTestPoi();
    const poiNoActions: POI = createTestPoi();
    const poiAction1: Action = {
      ...createTestAction({ poiUuid: poi.uuid }),
      durationLower: 5,
      durationUpper: 10,
      crewAssigned: ["EV1"],
    };
    const poiAction2: Action = {
      ...createTestAction({ poiUuid: poi.uuid }),
      durationLower: 2,
      durationUpper: 4,
      crewAssigned: ["EV2"],
    };
    const poiAction3: Action = {
      ...createTestAction({ poiUuid: poi.uuid }),
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
    const wholeStoreState: WholeStoreState = _.cloneDeep(wholeStoreInitialState);

    //populate the station state in the store
    const station: Station = createTestStation();
    const blankMission: Mission = createTestMission();
    const stationNoActions: Station = createTestStation();
    const stationAction1: Action = {
      ...createTestAction({ stationUuid: station.uuid }),
      durationLower: 5,
      durationUpper: 10,
      crewAssigned: ["EV1"],
    };
    const stationAction2: Action = {
      ...createTestAction({ stationUuid: station.uuid }),
      durationLower: 2,
      durationUpper: 4,
      crewAssigned: ["EV2"],
    };
    const stationAction3: Action = {
      ...createTestAction({ stationUuid: station.uuid }),
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
        _.isEqual(r, {
          message: "Station has no actions",
          type: "warning",
        })
      )
    ).toBeTruthy();
    expect(
      stationNoActionsCalcField.reportItems.find((r) =>
        _.isEqual(r, {
          message: "Station location not yet set",
          type: "warning",
        })
      )
    ).toBeTruthy();
    expect(
      stationNoActionsCalcField.reportItems.find((r) =>
        _.isEqual(r, {
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
    const wholeStoreState: WholeStoreState = _.cloneDeep(wholeStoreInitialState);

    const mission = createTestMission();
    mission.traverseRate = 3;
    const traverse1 = createTestTraverse();
    traverse1.pathSegmentDistances = [500];
    traverse1.pathSegmentElevations = [[2, 4]];
    const traverse2 = createTestTraverse();
    traverse2.traverseRate = 1;
    traverse2.pathSegmentDistances = [500];
    traverse2.predictedDurationLower = 50;
    traverse2.predictedDurationUpper = 50;
    const traverse3 = createTestTraverse();
    traverse3.pathSegmentDistances = [500];
    traverse3.predictedDurationLower = 15;
    traverse3.predictedDurationUpper = 15;
    const station1: Station = createTestStation();
    const station2: Station = createTestStation();
    const station3: Station = createTestStation();
    const eva1: Eva = createTestEva();
    eva1.sequence = [
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse1.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
    ];
    const eva2: Eva = createTestEva();
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
    const wholeStoreState: WholeStoreState = _.cloneDeep(wholeStoreInitialState);

    const mission = createTestMission();
    mission.traverseRate = 3;
    const traverse = createTestTraverse();
    traverse.pathSegmentDistances = [500];
    traverse.pathSegmentElevations = [[2, 4]];
    const station1: Station = createTestStation();
    const station2: Station = createTestStation();
    const eva: Eva = createTestEva();
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
