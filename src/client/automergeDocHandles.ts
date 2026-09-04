import { missionMutationIsAllowed } from "client/databaseEpoch";

let automergeMissionDocHandle: DocHandle<Mission> = null;

/**
 * Returns the mission doc handle, or null if it has not been set yet.
 * Logs an error when null so callers don't need to repeat the log boilerplate.
 * Callers should guard with `if (!missionDocHandle) return;`.
 */
export const getMissionDocHandle = (): DocHandle<Mission> | null => {
  if (!missionMutationIsAllowed()) return null;
  const handle = automergeMissionDocHandle;
  if (!handle) {
    // Import lazily to avoid circular-dependency issues at module init time.
    import("utils/logging/clientLogger").then(({ clientLogger }) => {
      clientLogger.error(
        {
          logId: "automergeDocHandles",
          logValue: "getMissionDocHandle: Mission doc handle is not set",
        },
        new Error("Mission doc handle is not set")
      );
    });
  }
  return handle;
};

export const setMissionAutomergeDocHandle = (docHandle: DocHandle<Mission>): void => {
  automergeMissionDocHandle = docHandle;
};

/**
 * Run a single atomic mutation on the Mission Automerge document.
 *
 * This is the only sanctioned way for components and helpers outside of
 * thunks to mutate the doc. It centralizes the null-guard
 * for `getMissionDocHandle()` and the call to `.change()` so callers never
 * have to handle either themselves.
 *
 * Pass a synchronous mutator that takes the live draft and mutates it via
 * `apply*` functions. The mutator may
 * return a value (e.g. a newly-allocated uuid from `applyCreateAction`),
 * which this function returns through to the caller.
 *
 * IMPORTANT — atomicity rule:
 *   Exactly one `withMissionChange(...)` call (or one
 *   `missionDocHandle.change(...)` call in thunk code) per logical user
 *   operation. Splitting an operation across two calls produces two
 *   patches and breaks the atomicity guarantee.
 *
 * @returns the value returned by `fn`, or `undefined` if the doc handle
 *          is not available.
 */
export function withMissionChange<T>(fn: (m: Mission) => T): T | undefined {
  if (!missionMutationIsAllowed()) return undefined;
  const handle = getMissionDocHandle();
  if (!handle) return undefined;
  let result: T;
  handle.change((m) => {
    result = fn(m);
  });
  return result;
}

/**
 * Client-side entry point for invoking an `op*` function.
 * It fetches the current mission doc handle, guards for
 * null, and forwards the handle plus caller-supplied args to the op.
 *
 * Components and other client-only code must go through this helper rather
 * than calling `getMissionDocHandle()` themselves (which is ESLint-restricted
 * outside the allow-list).
 *
 * The atomicity guarantee lives inside the `op*` itself: an op owns exactly
 * one `.change()` call per logical operation.
 *
 * Example:
 *   withMissionOp(opUpdateStationName, stationUuid, newName);
 *
 * @returns the value returned by `op`, or `undefined` if the doc handle is
 *          not available.
 */
export function withMissionOp<TArgs extends unknown[], TResult>(
  op: (handle: DocHandle<Mission>, ...args: TArgs) => TResult,
  ...args: TArgs
): TResult | undefined {
  if (!missionMutationIsAllowed()) return undefined;
  const handle = getMissionDocHandle();
  if (!handle) return undefined;
  return op(handle, ...args);
}
