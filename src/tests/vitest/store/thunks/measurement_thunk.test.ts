import { createCustomTestStore } from "../../fixtures/store";
import { initialState as missionInitialState } from "store/mission";
import { initialState as measureInitialState } from "store/measure";
import {
  thunkAddNewMeasurement,
  thunkRemoveMeasurement,
  thunkUpdateMeasurementPath,
} from "store/thunk/thunkMeasurement";
import { setMissionAutomergeDocHandle } from "client/automergeDocHandles";

const mockThunkFetchElevation = vi.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
vi.mock("store/thunk/thunkElevation", () => ({
  thunkFetchElevation: () => mockThunkFetchElevation,
}));
vi.mock("store/thunk/thunkTerrainProfile", () => ({
  thunkFetchTerrainProfile: () => mockThunkFetchElevation,
}));

beforeAll(() => {
  /**
   * Init the mission automerge doc. In the app this is handled in the component.
   * Pass in null because this function is being mocked so we don't
   * have to pass in a real value.
   */
  setMissionAutomergeDocHandle(null);
});

beforeEach(async () => {
  vi.clearAllMocks(); // clear call count
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Thunk Measurement Tests", () => {
  test("thunkUpdateMeasurementPath()", async () => {
    const newPath = [
      { lat: 1, lng: 2 },
      { lat: 1.2, lng: 2.2 },
    ];
    const measurement: Measurement = {
      path: [{ lat: 1, lng: 2 }],
      pathSegmentDistances: [0],
      pathSegmentElevations: [[0, 0]],
      pathSegmentAbsoluteSlopes: [[0, 0]],
      pathSegmentBearings: [0],
      uuid: "uuid",
      createdAt: "createdAt",
      color: "#000000",
    };
    const store = createCustomTestStore({
      measure: { ...measureInitialState, measurements: [measurement] },
      mission: {
        ...missionInitialState,
      },
    });

    await store.dispatch(
      thunkUpdateMeasurementPath({ path: newPath, measurementUuid: measurement.uuid })
    );
    const storeState = store.getState();
    expect(storeState.measure.measurements[0].path).toEqual(newPath);
    expect(storeState.measure.measurements[0].pathSegmentDistances.length).toEqual(1);
    expect(storeState.measure.measurements[0].pathSegmentElevations).toEqual([[0, 0]]);
    expect(storeState.measure.measurements[0].pathSegmentAbsoluteSlopes).toEqual([[0, 0]]);
  });

  test("thunkUpdateMeasurementPath() clears incompatible pending profiles", async () => {
    const measurement: Measurement = {
      path: [
        { lat: 1, lng: 2 },
        { lat: 1.1, lng: 2.1 },
      ],
      pathSegmentDistances: [1],
      pathSegmentElevations: [[0, 1]],
      pathSegmentAbsoluteSlopes: [[2, 3]],
      pathSegmentBearings: [0],
      uuid: "changed-segments",
      createdAt: "createdAt",
      color: "#000000",
    };
    const store = createCustomTestStore({
      measure: { ...measureInitialState, measurements: [measurement] },
    });

    await store.dispatch(
      thunkUpdateMeasurementPath({
        measurementUuid: measurement.uuid,
        path: [
          { lat: 1, lng: 2 },
          { lat: 1.1, lng: 2.1 },
          { lat: 1.2, lng: 2.2 },
        ],
      })
    );

    expect(store.getState().measure.measurements[0].pathSegmentElevations).toBeNull();
    expect(store.getState().measure.measurements[0].pathSegmentAbsoluteSlopes).toBeNull();
  });
  test("thunkUpdateMeasurementPath() stores a combined profile", async () => {
    mockThunkFetchElevation.mockReturnValueOnce({
      meta: { requestStatus: "fulfilled" },
      payload: { elevationsMeters: [[1, 2]], terrainSlopesDegrees: [[null, 3]] },
    });
    const measurement: Measurement = {
      path: [
        { lat: 1, lng: 2 },
        { lat: 1.1, lng: 2.1 },
      ],
      pathSegmentDistances: [1],
      pathSegmentElevations: null,
      pathSegmentAbsoluteSlopes: null,
      pathSegmentBearings: [0],
      uuid: "profile-uuid",
      createdAt: "createdAt",
      color: "#000000",
    };
    const store = createCustomTestStore({
      measure: { ...measureInitialState, measurements: [measurement] },
    });
    const path = [
      { lat: 1, lng: 2 },
      { lat: 1.2, lng: 2.2 },
    ];

    await store.dispatch(thunkUpdateMeasurementPath({ path, measurementUuid: measurement.uuid }));

    expect(store.getState().measure.measurements[0].pathSegmentElevations).toEqual([[1, 2]]);
    expect(store.getState().measure.measurements[0].pathSegmentAbsoluteSlopes).toEqual([[null, 3]]);
  });
  test("thunkAddNewMeasurement()", async () => {
    const store = createCustomTestStore({
      measure: { ...measureInitialState, measurements: [] },
      mission: {
        ...missionInitialState,
      },
    });
    const initialMeasurements = store.getState().measure.measurements;
    await store.dispatch(thunkAddNewMeasurement());
    const newMeasurements = store.getState().measure.measurements;
    expect(newMeasurements.length).toEqual(initialMeasurements.length + 1);
  });
  test("thunkRemoveMeasurement()", async () => {
    const measurement: Measurement = {
      path: [{ lat: 1, lng: 2 }],
      pathSegmentDistances: [0],
      pathSegmentElevations: [[0, 0]],
      pathSegmentAbsoluteSlopes: [[0, 0]],
      pathSegmentBearings: [0],
      uuid: "uuid",
      createdAt: "createdAt",
      color: "#000000",
    };
    const store = createCustomTestStore({
      measure: { ...measureInitialState, measurements: [measurement] },
      mission: {
        ...missionInitialState,
      },
    });
    const initialMeasurements = store.getState().measure.measurements;
    await store.dispatch(thunkRemoveMeasurement({ measurementUuid: measurement.uuid }));
    const newMeasurements = store.getState().measure.measurements;
    expect(newMeasurements.length).toEqual(initialMeasurements.length - 1);
  });
});
