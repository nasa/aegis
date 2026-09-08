import { createCustomTestStore } from "../../fixtures/store";
import { initialState as missionInitialState } from "store/mission";
import { initialState as measureInitialState } from "store/measure";
import {
  thunkAddNewMeasurement,
  thunkRemoveMeasurement,
  thunkUpdateMeasurementPath,
} from "store/thunk/thunkMeasurement";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import type { CompleteTerrainProfile } from "utils/terrainProfile";
import { initialState as userInitialState } from "store/user";
import { generateBlankAppUser } from "store/storeUtils/appUser";

const mockThunkFetchTerrainProfile = vi.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
vi.mock("store/thunk/thunkTerrainProfile", () => ({
  thunkFetchTerrainProfile: () => mockThunkFetchTerrainProfile,
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
    mockThunkFetchTerrainProfile.mockReturnValueOnce({
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
  test.each([false, true])("applies newer completed profiles (%s)", async (outOfOrder) => {
    let resolveFirst: (value: {
      meta: { requestStatus: string };
      payload: CompleteTerrainProfile;
    }) => void;
    let resolveSecond: (value: {
      meta: { requestStatus: string };
      payload: CompleteTerrainProfile;
    }) => void;
    const firstResponse = new Promise<{
      meta: { requestStatus: string };
      payload: CompleteTerrainProfile;
    }>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise<{
      meta: { requestStatus: string };
      payload: CompleteTerrainProfile;
    }>((resolve) => {
      resolveSecond = resolve;
    });
    mockThunkFetchTerrainProfile
      .mockImplementationOnce(() => firstResponse)
      .mockImplementationOnce(() => secondResponse);

    const measurement: Measurement = {
      path: [
        { lat: 1, lng: 2 },
        { lat: 1.1, lng: 2.1 },
      ],
      pathSegmentDistances: [1],
      pathSegmentElevations: [[0, 1]],
      pathSegmentAbsoluteSlopes: [[2, 3]],
      pathSegmentBearings: [0],
      uuid: "ordered-preview-uuid",
      createdAt: "createdAt",
      color: "#000000",
    };
    const store = createCustomTestStore({
      measure: { ...measureInitialState, measurements: [measurement] },
    });
    const firstPath = [
      { lat: 1, lng: 2 },
      { lat: 1.2, lng: 2.2 },
    ];
    const secondPath = [
      { lat: 1, lng: 2 },
      { lat: 1.3, lng: 2.3 },
    ];

    const firstDispatch = store.dispatch(
      thunkUpdateMeasurementPath({
        path: firstPath,
        measurementUuid: measurement.uuid,
      })
    );
    const secondDispatch = store.dispatch(
      thunkUpdateMeasurementPath({
        path: secondPath,
        measurementUuid: measurement.uuid,
      })
    );

    const firstResult = {
      meta: { requestStatus: "fulfilled" },
      payload: { elevationsMeters: [[4, 5]], terrainSlopesDegrees: [[6, 7]] },
    };
    if (!outOfOrder) {
      resolveFirst!(firstResult);
      await firstDispatch;
      expect(store.getState().measure.measurements[0].path).toEqual(secondPath);
      expect(store.getState().measure.measurements[0].pathSegmentElevations).toEqual([[4, 5]]);
    }

    resolveSecond!({
      meta: { requestStatus: "fulfilled" },
      payload: { elevationsMeters: [[8, 9]], terrainSlopesDegrees: [[10, 11]] },
    });
    await secondDispatch;
    if (outOfOrder) {
      resolveFirst!(firstResult);
      await firstDispatch;
    }
    expect(store.getState().measure.measurements[0].path).toEqual(secondPath);
    expect(store.getState().measure.measurements[0].pathSegmentElevations).toEqual([[8, 9]]);
    expect(store.getState().measure.measurements[0].pathSegmentAbsoluteSlopes).toEqual([[10, 11]]);
  });
  test.each(["user", "mission"])("isolates measurement revisions by %s", async (scope) => {
    const originalGetHandle = vi.mocked(getMissionDocHandle).getMockImplementation();
    const firstHandle = getMissionDocHandle();
    let activeHandle = firstHandle;
    setMissionAutomergeDocHandle(null);
    const secondHandle = scope === "mission" ? getMissionDocHandle() : firstHandle;
    vi.mocked(getMissionDocHandle).mockImplementation(() => activeHandle);

    try {
      const path = [
        { lat: 1, lng: 2 },
        { lat: 1.1, lng: 2.1 },
      ];
      const createStore = (username: string) =>
        createCustomTestStore({
          user: { ...userInitialState, appUser: generateBlankAppUser({ username }) },
          measure: {
            ...measureInitialState,
            measurements: [
              {
                uuid: "shared-measurement-uuid",
                createdAt: "createdAt",
                color: "#000000",
                path,
                pathSegmentDistances: [1],
                pathSegmentBearings: [0],
                pathSegmentElevations: null,
                pathSegmentAbsoluteSlopes: null,
              },
            ],
          },
        });
      const firstStore = createStore("first-user");
      const secondStore = createStore(scope === "user" ? "second-user" : "first-user");
      let resolveFirst: (value: {
        meta: { requestStatus: string };
        payload: CompleteTerrainProfile;
      }) => void;
      mockThunkFetchTerrainProfile
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirst = resolve;
            })
        )
        .mockReturnValueOnce({
          meta: { requestStatus: "fulfilled" },
          payload: { elevationsMeters: [[8, 9]], terrainSlopesDegrees: [[10, 11]] },
        });

      const firstDispatch = firstStore.dispatch(
        thunkUpdateMeasurementPath({
          path,
          measurementUuid: "shared-measurement-uuid",
        })
      );
      activeHandle = secondHandle;
      await secondStore.dispatch(
        thunkUpdateMeasurementPath({
          path,
          measurementUuid: "shared-measurement-uuid",
        })
      );
      activeHandle = firstHandle;
      resolveFirst!({
        meta: { requestStatus: "fulfilled" },
        payload: { elevationsMeters: [[4, 5]], terrainSlopesDegrees: [[6, 7]] },
      });
      await firstDispatch;

      expect(firstStore.getState().measure.measurements[0].pathSegmentElevations).toEqual([[4, 5]]);
      expect(firstStore.getState().measure.measurements[0].pathSegmentAbsoluteSlopes).toEqual([
        [6, 7],
      ]);
      expect(secondStore.getState().measure.measurements[0].pathSegmentElevations).toEqual([
        [8, 9],
      ]);
      expect(secondStore.getState().measure.measurements[0].pathSegmentAbsoluteSlopes).toEqual([
        [10, 11],
      ]);
    } finally {
      vi.mocked(getMissionDocHandle).mockImplementation(originalGetHandle);
    }
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
