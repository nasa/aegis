import { createCustomTestStore } from "tests/vitest/fixtures/store";
import { initialState as poiInitialState, setSelectedPoiUuid } from "store/poi";
import { initialState as missionInitialState, setIsInEditMode } from "store/mission";
import { clearAllEditing } from "store/crossActions";
import { v4 as uuidv4 } from "uuid";

describe("POI Store Reducers", () => {
  it("setSelectedPoiUuid", () => {
    const store = createCustomTestStore({ poi: { ...poiInitialState } });
    const uuid = uuidv4();
    store.dispatch(setSelectedPoiUuid(uuid));
    expect(store.getState().poi.selectedPoiUuid).toEqual(uuid);
  });
});

describe("Mission Edit Mode", () => {
  it("setIsInEditMode - turn on", () => {
    const store = createCustomTestStore({ mission: { ...missionInitialState } });
    store.dispatch(setIsInEditMode(true));
    expect(store.getState().mission.isInEditMode).toBe(true);
  });

  it("setIsInEditMode - turn off", () => {
    const store = createCustomTestStore({
      mission: { ...missionInitialState, isInEditMode: true },
    });
    store.dispatch(setIsInEditMode(false));
    expect(store.getState().mission.isInEditMode).toBe(false);
  });

  it("clearAllEditing turns off isInEditMode", () => {
    const store = createCustomTestStore({
      mission: { ...missionInitialState, isInEditMode: true },
    });
    store.dispatch(clearAllEditing());
    expect(store.getState().mission.isInEditMode).toBe(false);
  });
});
