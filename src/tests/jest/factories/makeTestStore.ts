import { configureStore } from "@reduxjs/toolkit";
import { StoreType, sliceReducers as reducer, RootState, initialState } from "../../../store";
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
import { initialState as measureInitialState } from "store/measure";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import {
  generateBlankActionTemplate,
  generateBlankMission,
  generateDefaultActionDefinitions,
} from "store/storeUtils/mission";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankPreset } from "store/storeUtils/preset";
import { generateBlankPosEntry, generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStation } from "store/storeUtils/station";
import {
  generateBlankStmLvl1,
  generateBlankStmLvl2,
  generateBlankStmLvl3,
} from "store/storeUtils/stm";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAppUser } from "store/storeUtils/appUser";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

export const createCustomTestStore = (partialPreloadedState: Partial<RootState>): StoreType => {
  const newState = { ...initialState, ...partialPreloadedState };
  return configureStore({
    reducer,
    preloadedState: newState,
  });
};

/**
 * Create a store pre filled with objects. Any record that needs an id from the db are null (ex: mission and user)
 * @returns
 */
export const createFullTestStore = (): StoreType => {
  const mission = generateBlankMission({
    name: "Jest Test Mission",
    landerLocation: { lat: 3, lng: 3 },
    actionTemplates: {
      [uuidv4()]: generateBlankActionTemplate({ templateName: "Jest Action Template" }),
    },
    actionDefinitions: generateDefaultActionDefinitions(),
  });
  const actions: Action[] = [];

  const pois: POI[] = [];
  for (let i = 0; i < 3; i++) {
    const poi = generateBlankPoi({ location: { lat: i + 0.1, lng: i } });
    pois.push(poi);
  }
  for (let i = 0; i < pois.length; i++) {
    const action = generateBlankAction({ name: `Jest Action-${i}`, poiUuid: pois[i].uuid });
    action.duration = i + 6;
    action.poiUuid = pois[i].uuid;
    actions.push(action);
    pois[i].actionOrderUuids.push(action.uuid);
  }

  const stations: Station[] = [];
  for (let i = 0; i < 4; i++) {
    const station = generateBlankStation({
      name: `Jest Station-${i}`,
      location: { lat: i, lng: i + 0.1 },
    });
    stations.push(station);
  }
  for (let i = 0; i < stations.length; i++) {
    const action = generateBlankAction({ name: "Jest Action-1", stationUuid: stations[i].uuid });
    action.duration = i + 6;
    action.stationUuid = stations[i].uuid;
    actions.push(action);
    stations[i].actionOrderUuids.push(action.uuid);
  }

  const traverses: Traverse[] = [];
  for (let i = 0; i < 6; i++) {
    traverses.push(generateBlankTraverse({ name: `Jest Traverse-${i + 1}` }));
  }
  for (let i = 0; i < traverses.length; i++) {
    const action = generateBlankAction({ name: "Jest Action-1", traverseUuid: traverses[i].uuid });
    action.duration = i + 6;
    action.traverseUuid = traverses[i].uuid;
    actions.push(action);
    traverses[i].actionOrderUuids.push(action.uuid);
  }
  const eva1 = generateBlankEVA({ name: "Jest Eva-1 Planned with Rex" });
  eva1.sequence = [
    { uuid: traverses[0].uuid, type: "traverse" },
    { uuid: stations[0].uuid, type: "station" },
    { uuid: traverses[1].uuid, type: "traverse" },
    { uuid: stations[1].uuid, type: "station" },
    { uuid: traverses[2].uuid, type: "traverse" },
    { uuid: stations[2].uuid, type: "station" },
    { uuid: traverses[3].uuid, type: "traverse" },
  ];
  const eva2: Eva = generateBlankEVA({ name: "Jest Eva-2 Planned No Rex" });
  eva2.traverseRate = 2;
  eva2.sequence = [
    { uuid: traverses[4].uuid, type: "traverse" },
    { uuid: stations[3].uuid, type: "station" },
    { uuid: traverses[5].uuid, type: "traverse" },
  ];

  // duplicate a full EVA for a rex record
  const eva1ForRex = cloneDeep(eva1);
  eva1ForRex.name = "Jest Eva-1 Rex Version";
  eva1ForRex.uuid = uuidv4();
  for (const seq of eva1ForRex.sequence) {
    if (seq.type === "traverse") {
      const traverse = traverses.find((t) => t.uuid === seq.uuid);
      const dupTraverse = cloneDeep(traverse);
      dupTraverse.uuid = uuidv4();
      dupTraverse.name = traverse.name + " For Rex";
      traverses.push(dupTraverse);

      const action = actions.find((a) => a.traverseUuid === seq.uuid);
      const dupAction = cloneDeep(action);
      dupAction.uuid = uuidv4();
      dupAction.traverseUuid = dupTraverse.uuid;
      dupAction.name = action.name + " For Rex";
      dupTraverse.actionOrderUuids = [dupAction.uuid];
      actions.push(dupAction);

      seq.uuid = dupTraverse.uuid;
    } else if (seq.type === "station") {
      const station = stations.find((s) => s.uuid === seq.uuid);
      const dupStation = cloneDeep(station);
      dupStation.uuid = uuidv4();
      dupStation.name = station.name + " For Rex";
      stations.push(dupStation);

      const action = actions.find((a) => a.stationUuid === seq.uuid);
      const dupAction = cloneDeep(action);
      dupAction.uuid = uuidv4();
      dupAction.stationUuid = dupStation.uuid;
      dupAction.name = action.name + " For Rex";
      dupStation.actionOrderUuids = [dupAction.uuid];
      actions.push(dupAction);

      seq.uuid = dupStation.uuid;
    }
  }
  const rex1 = generateBlankRex({ name: "Jest Rex-1", evaUuid: eva1ForRex.uuid });
  rex1.posEntries = [generateBlankPosEntry({ posTypeUuids: [rex1.posTypes[0].uuid] })];

  const sublayer = generateBlankSublayer({ name: "Jest Test Sublayer" });
  const preset1 = generateBlankPreset({
    name: "Jest Test Preset",
    missionDefault: true,
    mapSublayerControls: {
      [sublayer.uuid]: {
        name: sublayer.name,
        sublayerUuid: sublayer.uuid,
        visible: true,
        style: null,
      },
    },
  });
  const presetLayersUIStates = { [preset1.uuid]: {} };
  const presetCirclesUIStates = { [preset1.uuid]: {} };

  const stmLevel1_1 = generateBlankStmLvl1({ name: "Jest STM Level1-1", numbering: "1" });
  const stmLevel2_1 = generateBlankStmLvl2({ name: "Jest STM Level2-1", numbering: "1" });
  stmLevel2_1.level1Uuid = stmLevel1_1.uuid;
  const stmLevel3_1 = generateBlankStmLvl3({ name: "Jest STM Level3-1", numbering: "1" });
  stmLevel3_1.level2Uuid = stmLevel2_1.uuid;

  const testState: RootState = {
    hover: { ...hoverInitialState },
    mission: {
      ...missionInitialState,
      mission: mission,
      missionFromDb: mission,
      sublayers: [sublayer],
    },
    user: {
      ...userInitialState,
      appUser: generateBlankAppUser({
        username: "Jest testAppUser",
        password: "superSecretPassword",
      }),
    },
    map: { ...mapInitialState },
    eva: {
      ...evaInitialState,
      evas: [eva1, eva2, eva1ForRex],
      evasFromDb: [eva1, eva2, eva1ForRex],
      selectedEvaUuid: eva1.uuid,
    },
    poi: { ...poiInitialState, pois: pois, poisFromDb: pois },
    interface: { ...interfaceInitialState },
    stm: {
      ...stmInitialState,
      level1s: [stmLevel1_1],
      level2s: [stmLevel2_1],
      level3s: [stmLevel3_1],
    },
    preset: {
      ...presetInitialState,
      presets: [preset1],
      presetsFromDb: [preset1],
      presetLayersUIStates: presetLayersUIStates,
      presetCirclesUIStates: presetCirclesUIStates,
    },
    station: {
      ...stationInitialState,
      stations: stations,
      stationsFromDb: stations,
    },
    action: {
      ...actionInitialState,
      actions: actions,
      actionsFromDb: actions,
    },
    traverse: { ...traverseInitialState, traverses: traverses, traversesFromDb: traverses },
    rex: { ...rexInitialState, rexes: [rex1], rexesFromDb: [rex1] },
    measure: { ...measureInitialState },
  };

  return configureStore({
    reducer,
    preloadedState: testState,
  });
};
