import type { AppDispatch } from "utils/useAppDispatch";

import { applyMeasurementElevation, setMeasurementElevationStatus } from "store/measure";
import type { ElevationThunkError } from "./thunkElevation";
import { thunkFetchElevation } from "./thunkElevation";

type Request = {
  generation: number;
  path: AEGISPoint[];
  pathSegmentDistances: number[];
  final: boolean;
};

type Stream = {
  nextGeneration: number;
  displayedGeneration: number;
  active?: Request;
  pending?: Request;
  controller?: AbortController;
  retryTimer?: ReturnType<typeof setTimeout>;
  pressureIndex: number;
  destroyed: boolean;
};

const PRESSURE_DELAYS_MS = [100, 250, 500, 1_000, 2_000];
const streams = new Map<string, Stream>();

const getStream = (measurementUuid: string): Stream => {
  const existing = streams.get(measurementUuid);
  if (existing) return existing;
  const stream: Stream = {
    nextGeneration: 1,
    displayedGeneration: 0,
    pressureIndex: 0,
    destroyed: false,
  };
  streams.set(measurementUuid, stream);
  return stream;
};

const isTemporaryPressure = (error: ElevationThunkError | false | undefined): boolean =>
  !!error &&
  (error.code === "ELEVATION_RATE_LIMITED" ||
    error.code === "ELEVATION_BUSY" ||
    error.code === "ELEVATION_QUEUE_DEADLINE" ||
    error.code === "ELEVATION_TIMEOUT");

const jitter = (delayMs: number): number => Math.round(delayMs * (0.9 + Math.random() * 0.2));

const runNext = async (measurementUuid: string, stream: Stream, dispatch: AppDispatch) => {
  if (stream.destroyed || stream.active || stream.retryTimer || !stream.pending) return;
  const request = stream.pending;
  stream.pending = undefined;
  stream.active = request;
  stream.controller = new AbortController();
  dispatch(
    setMeasurementElevationStatus({
      measurementUuid,
      generation: request.generation,
      status: "loading",
    })
  );

  const result = await dispatch(
    thunkFetchElevation({
      path: request.path,
      pathSegmentDistances: request.pathSegmentDistances,
      uuid: measurementUuid,
      streamId: measurementUuid,
      generation: request.generation,
      signal: stream.controller.signal,
      trackGlobalPending: false,
    })
  );
  if (stream.destroyed) return;
  stream.active = undefined;
  stream.controller = undefined;

  if (result.meta.requestStatus === "fulfilled") {
    stream.pressureIndex = Math.max(0, stream.pressureIndex - 2);
    const hasNewerPending = !!stream.pending;
    runNext(measurementUuid, stream, dispatch).catch((): undefined => undefined);
    if (request.generation > stream.displayedGeneration) {
      stream.displayedGeneration = request.generation;
      dispatch(
        applyMeasurementElevation({
          measurementUuid,
          generation: request.generation,
          elevations: result.payload as number[][],
          pathSegmentDistances: request.pathSegmentDistances,
          hasNewerPending,
        })
      );
    }
    return;
  }

  const error = result.payload as ElevationThunkError | false | undefined;
  if (error && (error.aborted || error.code === "ELEVATION_SUPERSEDED")) {
    runNext(measurementUuid, stream, dispatch).catch((): undefined => undefined);
    return;
  }
  if (isTemporaryPressure(error)) {
    if (!stream.pending) stream.pending = request;
    const adaptiveDelay =
      PRESSURE_DELAYS_MS[Math.min(stream.pressureIndex, PRESSURE_DELAYS_MS.length - 1)];
    stream.pressureIndex += 1;
    const retryAfterMs = error ? error.retryAfterMs : undefined;
    const delayMs = jitter(Math.max(adaptiveDelay, retryAfterMs ?? 0));
    dispatch(
      setMeasurementElevationStatus({
        measurementUuid,
        generation: stream.pending.generation,
        status: "delayed",
        retryAfterMs: delayMs,
      })
    );
    stream.retryTimer = setTimeout(() => {
      stream.retryTimer = undefined;
      runNext(measurementUuid, stream, dispatch).catch((): undefined => undefined);
    }, delayMs);
    return;
  }

  dispatch(
    setMeasurementElevationStatus({
      measurementUuid,
      generation: request.generation,
      status: "error",
    })
  );
  if (!stream.pending) stream.pending = request;
  else runNext(measurementUuid, stream, dispatch).catch((): undefined => undefined);
};

export const scheduleMeasurementElevation = (
  dispatch: AppDispatch,
  measurementUuid: string,
  path: AEGISPoint[],
  pathSegmentDistances: number[],
  final = false
): number => {
  const stream = getStream(measurementUuid);
  stream.destroyed = false;
  const request: Request = {
    generation: stream.nextGeneration++,
    path: path.map((point) => ({ ...point })),
    pathSegmentDistances: [...pathSegmentDistances],
    final,
  };
  stream.pending = request;
  if (stream.retryTimer && final) {
    clearTimeout(stream.retryTimer);
    stream.retryTimer = undefined;
  }
  runNext(measurementUuid, stream, dispatch).catch((): undefined => undefined);
  return request.generation;
};

export const retryMeasurementElevation = (dispatch: AppDispatch, measurementUuid: string): void => {
  const stream = streams.get(measurementUuid);
  if (!stream || stream.active || !stream.pending) return;
  stream.pressureIndex = 0;
  runNext(measurementUuid, stream, dispatch).catch((): undefined => undefined);
};

export const cancelMeasurementElevation = (measurementUuid: string): void => {
  const stream = streams.get(measurementUuid);
  if (!stream) return;
  stream.destroyed = true;
  stream.pending = undefined;
  if (stream.retryTimer) clearTimeout(stream.retryTimer);
  stream.controller?.abort();
  streams.delete(measurementUuid);
};

export const cancelAllMeasurementElevations = (): void => {
  [...streams.keys()].forEach(cancelMeasurementElevation);
};

export const resetMeasurementElevationSchedulerForTests = (): void => {
  cancelAllMeasurementElevations();
};
