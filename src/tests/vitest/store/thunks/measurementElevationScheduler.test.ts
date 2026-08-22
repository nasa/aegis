const requests = vi.hoisted(
  () => [] as Array<{ args: unknown; resolve: (value: unknown) => void }>
);

vi.mock("store/thunk/thunkElevation", () => ({
  thunkFetchElevation: (args: unknown) => ({ type: "test/elevation", args }),
}));

import {
  cancelMeasurementElevation,
  resetMeasurementElevationSchedulerForTests,
  scheduleMeasurementElevation,
} from "store/thunk/measurementElevationScheduler";
import type { AppDispatch } from "utils/useAppDispatch";

type TestAction = { type: string; args?: unknown; payload?: unknown };

const dispatchMock = vi.fn((action: TestAction) => {
  if (action.type !== "test/elevation") return action;
  return new Promise((resolve) => requests.push({ args: action.args, resolve }));
});
const dispatch = dispatchMock as unknown as AppDispatch;

const path = (lng: number): AEGISPoint[] => [
  { lat: 0, lng: 0 },
  { lat: 0, lng },
];

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("measurement elevation scheduler", () => {
  beforeEach(() => {
    requests.length = 0;
    dispatchMock.mockClear();
    resetMeasurementElevationSchedulerForTests();
  });

  afterEach(() => resetMeasurementElevationSchedulerForTests());

  it("keeps one active request and collapses pending updates to the latest geometry", async () => {
    scheduleMeasurementElevation(dispatch, "00000000-0000-4000-8000-000000000001", path(1), [1]);
    scheduleMeasurementElevation(dispatch, "00000000-0000-4000-8000-000000000001", path(2), [2]);
    scheduleMeasurementElevation(dispatch, "00000000-0000-4000-8000-000000000001", path(3), [3]);
    expect(requests).toHaveLength(1);
    expect(requests[0].args).toMatchObject({ generation: 1, path: path(1) });
    requests[0].resolve({ meta: { requestStatus: "fulfilled" }, payload: [[10, 11]] });
    await settle();

    expect(requests).toHaveLength(2);
    expect(requests[1].args).toMatchObject({ generation: 3, path: path(3) });
  });

  it("allows an active intermediate response to display without overwriting geometry", async () => {
    const uuid = "00000000-0000-4000-8000-000000000002";
    scheduleMeasurementElevation(dispatch, uuid, path(1), [1]);
    scheduleMeasurementElevation(dispatch, uuid, path(2), [2]);
    requests[0].resolve({ meta: { requestStatus: "fulfilled" }, payload: [[20, 21]] });
    await settle();

    expect(requests).toHaveLength(2);

    const successAction = dispatchMock.mock.calls
      .map(([action]) => action)
      .find((action) => action.type === "measure/applyMeasurementElevation");
    expect(successAction?.payload).toMatchObject({
      measurementUuid: uuid,
      generation: 1,
      elevations: [[20, 21]],
      pathSegmentDistances: [1],
      hasNewerPending: true,
    });
    expect(successAction?.payload).not.toHaveProperty("path");
    expect(requests[0].args).toMatchObject({ trackGlobalPending: false });
  });

  it("keeps pressure backoff while replacing pending geometry", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const uuid = "00000000-0000-4000-8000-000000000004";
    scheduleMeasurementElevation(dispatch, uuid, path(1), [1]);
    requests[0].resolve({
      meta: { requestStatus: "rejected" },
      payload: { message: "busy", code: "ELEVATION_BUSY", retryAfterMs: 500 },
    });
    await settle();

    scheduleMeasurementElevation(dispatch, uuid, path(2), [2]);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toHaveLength(2);
    expect(requests[1].args).toMatchObject({ generation: 2, path: path(2) });
    vi.useRealTimers();
  });

  it("lets a final update bypass pressure backoff", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const uuid = "00000000-0000-4000-8000-000000000005";
    scheduleMeasurementElevation(dispatch, uuid, path(1), [1]);
    requests[0].resolve({
      meta: { requestStatus: "rejected" },
      payload: { message: "busy", code: "ELEVATION_BUSY", retryAfterMs: 500 },
    });
    await settle();

    scheduleMeasurementElevation(dispatch, uuid, path(2), [2], true);
    expect(requests).toHaveLength(2);
    expect(requests[1].args).toMatchObject({ generation: 2, path: path(2) });
    vi.useRealTimers();
  });

  it("aborts and removes active work when the stream is cancelled", () => {
    const uuid = "00000000-0000-4000-8000-000000000003";
    scheduleMeasurementElevation(dispatch, uuid, path(1), [1]);
    const signal = (requests[0].args as { signal: AbortSignal }).signal;

    cancelMeasurementElevation(uuid);

    expect(signal.aborted).toBe(true);
  });
});
