import { configureStore } from "@reduxjs/toolkit";
import { StoreType, sliceReducers as reducer, RootState, initialState } from "../../store";
import { initialState as actionInitialState } from "store/action";
import { initialState as evaInitialState } from "store/eva";
import { initialState as traverseInitialState } from "store/traverse";
import { initialState as mapInitialState } from "store/map";
import { initialState as missionInitialState } from "store/mission";
import { initialState as poiInitialState } from "store/poi";
import { initialState as presetInitialState } from "store/preset";
import { initialState as stationInitialState } from "store/station";
import { initialState as rexInitialState } from "store/rex";
import { initialState as hoverInitialState } from "store/hover";
import { initialState as stmInitialState } from "store/stm";
import { initialState as userInitialState } from "store/user";
import { initialState as interfaceInitialState } from "store/interface";
import { createTestTraverse } from "./TraverseFactory";
import { createTestStation } from "./StationFactory";
import { createTestActionTemplate, createTestMission } from "./MissionFactory";
import { createTestEva } from "./EVAFactory";
import { createTestAction } from "./ActionFactory";
import { createTestPoi } from "./PoiFactory";
import { createTestPosEntry, createTestPosType, createTestRex } from "./RexFactory";
import { createTestPreset } from "./PresetFactory";
import { createTestUser } from "./UserFactory";
import { createTestSTMGoal } from "./STMGoalFactory";
import { createTestSTMObjective } from "./STMObjectiveFactory";
import { createTestSTMInvstg } from "./STMInvestigationFactory";

export const createCustomTestStore = (partialPreloadedState: Partial<RootState>): StoreType => {
  const newState = { ...initialState, ...partialPreloadedState };
  return configureStore({
    reducer,
    preloadedState: newState,
  });
};

/**
 * Create a store pre filled with objects. Any record that needs an id from the db are null (ex: mission and user)
 *    3 pois each with 1 action
 *    3 stations each with 1 action
 *    2 evas
 *    1 rex with 1 pos and a selected eva
 *    1 preset
 *    1 user
 *    STM with 1 objective, 1 goal, and 1 invstg linked together
 * @returns
 */
export const createFullTestStore = (): StoreType => {
  const mission = createTestMission();
  mission.name = "Jest Test Mission";
  mission.planetRadius = 1737400;
  mission.landerLocation = { lat: 3, lng: 3 };
  mission.actionTemplates = [createTestActionTemplate()];

  const actions: Action[] = [];

  const pois: POI[] = [];
  for (let i = 0; i < 3; i++) {
    const poi = createTestPoi();
    poi.location = { lat: i + 0.1, lng: i };
    pois.push(poi);
  }
  for (let i = 0; i < pois.length; i++) {
    const action = createTestAction({ poiUuid: pois[i].uuid });
    action.durationLower = i + 1;
    action.durationUpper = action.durationLower + 5;
    actions.push(action);
    pois[i].actionOrderUuids.push(action.uuid);
  }

  const stations: Station[] = [];
  for (let i = 0; i < 4; i++) {
    const station = createTestStation();
    station.location = { lat: i, lng: i + 0.1 };
    stations.push(station);
  }
  for (let i = 0; i < stations.length; i++) {
    const action = createTestAction({ stationUuid: stations[i].uuid });
    action.durationLower = i + 1;
    action.durationUpper = action.durationLower + 5;
    actions.push(action);
    stations[i].actionOrderUuids.push(action.uuid);
  }

  const traverses: Traverse[] = [];
  for (let i = 0; i < 6; i++) {
    traverses.push(createTestTraverse());
  }
  const eva1 = createTestEva();
  eva1.egressLocationUuid = "lander";
  eva1.ingressLocationUuid = "lander";
  eva1.sequence = [
    { uuid: traverses[0].uuid, type: "traverse" },
    { uuid: stations[0].uuid, type: "station" },
    { uuid: traverses[1].uuid, type: "traverse" },
    { uuid: stations[1].uuid, type: "station" },
    { uuid: traverses[2].uuid, type: "traverse" },
    { uuid: stations[2].uuid, type: "station" },
    { uuid: traverses[3].uuid, type: "traverse" },
  ];
  const eva2: Eva = createTestEva();
  eva2.traverseRate = 2;
  eva2.sequence = [
    { uuid: traverses[4].uuid, type: "traverse" },
    { uuid: stations[3].uuid, type: "station" },
    { uuid: traverses[5].uuid, type: "traverse" },
  ];

  const rex1 = createTestRex();
  rex1.evaUuid = eva1.uuid;

  const posType1 = createTestPosType("EV1");
  const posType2 = createTestPosType("EV2");
  rex1.posTypes = [posType1, posType2];
  rex1.posEntries = [createTestPosEntry(posType1.uuid)];

  const preset1 = createTestPreset();
  const presetsUIStates = { [preset1.uuid]: {} };

  const stmObj1 = createTestSTMObjective();
  const stmGoal1 = createTestSTMGoal();
  stmGoal1.objectiveUuid = stmObj1.uuid;
  const stmInvstg1 = createTestSTMInvstg();
  stmInvstg1.goalUuid = stmGoal1.uuid;

  const testState: RootState = {
    hover: { ...hoverInitialState },
    mission: {
      ...missionInitialState,
      mission: mission,
      missionFromDb: mission,
    },
    user: { ...userInitialState, user: createTestUser() },
    map: { ...mapInitialState },
    eva: {
      ...evaInitialState,
      evas: [eva1, eva2],
      evasFromDb: [eva1, eva2],
      selectedEvaUuid: eva1.uuid,
    },
    poi: { ...poiInitialState, pois: pois, poisFromDb: pois },
    interface: { ...interfaceInitialState },
    stm: {
      ...stmInitialState,
      objectives: [stmObj1],
      goals: [stmGoal1],
      investigations: [stmInvstg1],
    },
    preset: {
      ...presetInitialState,
      presets: [preset1],
      presetsFromDb: [preset1],
      presetsUIStates,
    },
    station: { ...stationInitialState, stations: stations, stationsFromDb: stations },
    action: {
      ...actionInitialState,
      actions: actions,
      actionsFromDb: actions,
    },
    traverse: { ...traverseInitialState, traverses: traverses, traversesFromDb: traverses },
    rex: { ...rexInitialState, rexes: [rex1], rexesFromDb: [rex1] },
  };

  return configureStore({
    reducer,
    preloadedState: testState,
  });
};
