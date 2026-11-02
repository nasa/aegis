import { configureStore } from "@reduxjs/toolkit";
import type { StoreType, RootState } from "../../../store";
import { sliceReducers as reducer, initialState } from "../../../store";
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
import { initialState as reportInitialState } from "store/report";
import { initialState as userInitialState } from "store/user";
import { initialState as interfaceInitialState } from "store/interface";
import { initialState as connectionInitialState } from "store/connection";
import { initialState as measureInitialState } from "store/measure";
import { generateBlankAppUser } from "store/storeUtils/appUser";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import {
  generateFullMission,
  writeMissionDataToAutomergeDocHandle,
} from "tests/vitest/fixtures/mission";

// Creates a fully configured Redux store connected to a fully populated mission Automerge doc
export const createTestStoreWithAutomergeMission = (): StoreType => {
  // Generate a mock fully populated Automerge mission doc and initialize the mocked docHandle with it.
  setMissionAutomergeDocHandle(null);
  const mission = generateFullMission();
  writeMissionDataToAutomergeDocHandle(mission, getMissionDocHandle());

  // Preset UI states for the fixture mission's presets
  const presetUuid = Object.values(mission.presets).find((p) => p.missionDefault)?.uuid ?? null;
  const presetLayersUIStates = presetUuid ? { [presetUuid]: {} } : {};
  const presetCirclesUIStates = presetUuid ? { [presetUuid]: {} } : {};

  const testState: RootState = {
    terrainProfiles: { profiles: {}, previews: {} },
    hover: { ...hoverInitialState },
    mission: { ...missionInitialState },
    user: {
      ...userInitialState,
      appUser: generateBlankAppUser({
        username: "Vitest testAppUser",
        password: "superSecretPassword",
      }),
    },
    map: { ...mapInitialState },
    eva: {
      ...evaInitialState,
      selectedEvaUuid:
        Object.values(mission.evas).find((e) => e.name === "Vitest Eva-1 Planned with Rex")?.uuid ??
        null,
    },
    poi: { ...poiInitialState },
    interface: { ...interfaceInitialState },
    connection: { ...connectionInitialState },
    stm: { ...stmInitialState },
    report: { ...reportInitialState },
    preset: {
      ...presetInitialState,
      selectedPresetUuid: presetUuid,
      presetLayersUIStates,
      presetCirclesUIStates,
    },
    station: { ...stationInitialState },
    action: { ...actionInitialState },
    traverse: { ...traverseInitialState },
    rex: { ...rexInitialState },
    measure: { ...measureInitialState },
  };

  return configureStore({
    reducer,
    preloadedState: testState,
  });
};

export const createCustomTestStore = (partialPreloadedState: Partial<RootState>): StoreType => {
  const newState = { ...initialState, ...partialPreloadedState };
  return configureStore({
    reducer,
    preloadedState: newState,
  });
};
