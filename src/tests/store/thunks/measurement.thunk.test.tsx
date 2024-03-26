import { createCustomTestStore } from "../../factories/makeTestStore";
import { initialState as missionInitialState } from "store/mission";
import { initialState as measureInitialState } from "store/measure";
import { createTestMission } from "../../factories/MissionFactory";
import {
  thunkAddNewMeasurement,
  thunkRemoveMeasurement,
  thunkUpdateMeasurementPath,
} from "store/thunk/thunkMeasurement";

const mockThunkGetElevation = jest.fn();
jest.mock("store/thunk/thunkElevation", () => ({
  thunkGetElevation: () => mockThunkGetElevation,
}));

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Thunk Measurement Tests", () => {
  test("thunkUpdateMeasurementPath()", async () => {
    const blankMission: Mission = createTestMission();
    const newPath = [
      { lat: 1, lng: 2 },
      { lat: 1.2, lng: 2.2 },
    ];
    const measurement: Measurement = {
      path: [{ lat: 1, lng: 2 }],
      pathSegmentDistances: [0],
      pathSegmentElevations: [[0, 0]],
      uuid: "uuid",
      createdAt: "createdAt",
      color: "#000000",
    };
    const store = createCustomTestStore({
      measure: { ...measureInitialState, measurements: [measurement] },
      mission: {
        ...missionInitialState,
        mission: { ...blankMission, planetRadius: 1737400 },
      },
    });

    await store.dispatch(
      thunkUpdateMeasurementPath({ path: newPath, measurementUuid: measurement.uuid })
    );
    const storeState = store.getState();
    expect(storeState.measure.measurements[0].path).toEqual(newPath);
    expect(storeState.measure.measurements[0].pathSegmentDistances.length).toEqual(1);
  });
  test("thunkAddNewMeasurement()", async () => {
    const blankMission: Mission = createTestMission();
    const store = createCustomTestStore({
      measure: { ...measureInitialState, measurements: [] },
      mission: {
        ...missionInitialState,
        mission: { ...blankMission, planetRadius: 1737400 },
      },
    });
    const initialMeasurements = store.getState().measure.measurements;
    await store.dispatch(thunkAddNewMeasurement());
    const newMeasurements = store.getState().measure.measurements;
    expect(newMeasurements.length).toEqual(initialMeasurements.length + 1);
  });
  test("thunkRemoveMeasurement()", async () => {
    const blankMission: Mission = createTestMission();
    const measurement: Measurement = {
      path: [{ lat: 1, lng: 2 }],
      pathSegmentDistances: [0],
      pathSegmentElevations: [[0, 0]],
      uuid: "uuid",
      createdAt: "createdAt",
      color: "#000000",
    };
    const store = createCustomTestStore({
      measure: { ...measureInitialState, measurements: [measurement] },
      mission: {
        ...missionInitialState,
        mission: { ...blankMission, planetRadius: 1737400 },
      },
    });
    const initialMeasurements = store.getState().measure.measurements;
    await store.dispatch(thunkRemoveMeasurement({ measurementUuid: measurement.uuid }));
    const newMeasurements = store.getState().measure.measurements;
    expect(newMeasurements.length).toEqual(initialMeasurements.length - 1);
  });
});
