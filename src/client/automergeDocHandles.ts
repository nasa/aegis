import { isLoggedIn } from "http-client/login";

let automergeMissionDocHandle: DocHandle<Mission> = null;
let subscribedMissionDocHandle: DocHandle<Mission> = null;
let missionCanEdit = false;
let folderMembershipRepairQueued = false;
const folderMembershipRepairsInFlight = new WeakSet<DocHandle<Mission>>();
let repairingFolderMemberships = false;

/**
 * Automerge merges concurrent list edits, so two clients can each move one item
 * into different folders and leave the UUID in both arrays. Repair that merged
 * state deterministically, keeping the membership in the most recently updated
 * folder (UUID breaks timestamp ties).
 */
type FolderMembershipRepair = {
  winningFolderByItem: Map<string, string>;
  orphanMemberships: Set<string>;
};

const getFolderMembershipRepair = (mission: Mission): FolderMembershipRepair => {
  const membershipFolders = new Map<string, Folder[]>();
  const orphanMemberships = new Set<string>();
  for (const folder of Object.values(mission.folders ?? {})) {
    for (const itemUuid of folder.items) {
      const exists =
        folder.type === "poi"
          ? Boolean(mission.pois?.[itemUuid])
          : folder.type === "station"
            ? Boolean(mission.stations?.[itemUuid])
            : folder.type === "eva"
              ? Boolean(mission.evas?.[itemUuid])
              : folder.type === "preset"
                ? Boolean(mission.presets?.[itemUuid])
                : true;
      if (!exists) {
        orphanMemberships.add(`${folder.uuid}\u0000${itemUuid}`);
        continue;
      }
      const memberships = membershipFolders.get(itemUuid) ?? [];
      memberships.push(folder);
      membershipFolders.set(itemUuid, memberships);
    }
  }
  const duplicateMemberships = [...membershipFolders.entries()].filter(
    ([, folders]) => folders.length > 1
  );
  const winningFolderByItem = new Map(
    duplicateMemberships.map(([itemUuid, folders]) => [
      itemUuid,
      [...folders].sort(
        (a, b) =>
          (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0) ||
          a.uuid.localeCompare(b.uuid)
      )[0].uuid,
    ])
  );
  return { winningFolderByItem, orphanMemberships };
};

const repairConcurrentFolderMemberships = async (): Promise<void> => {
  const handle = automergeMissionDocHandle;
  if (
    !handle ||
    !missionCanEdit ||
    repairingFolderMemberships ||
    folderMembershipRepairsInFlight.has(handle)
  )
    return;
  const initialRepair = getFolderMembershipRepair(handle.doc());
  if (initialRepair.winningFolderByItem.size === 0 && initialRepair.orphanMemberships.size === 0)
    return;

  folderMembershipRepairsInFlight.add(handle);
  let currentUser: AppUser | undefined;
  try {
    const response = await isLoggedIn();
    if (response.status === "success") currentUser = response.data;
  } catch {
    // A permission lookup failure must leave the shared mission document untouched.
  }

  const currentlyCanEdit =
    currentUser?.isSuperAdmin === true ||
    currentUser?.permissionList?.some(
      (permission) =>
        permission.missionId === handle.doc().id && permission.permissions.edit === true
    ) === true;
  try {
    // Permission and handle state can change while the persisted-grant check is in flight.
    if (
      !currentlyCanEdit ||
      !missionCanEdit ||
      handle !== automergeMissionDocHandle ||
      handle !== subscribedMissionDocHandle
    )
      return;

    const repair = getFolderMembershipRepair(handle.doc());
    if (repair.winningFolderByItem.size === 0 && repair.orphanMemberships.size === 0) return;

    repairingFolderMemberships = true;
    handle.change((draft) => {
      for (const folder of Object.values(draft.folders ?? {})) {
        const retainedItems = new Set<string>();
        for (let index = folder.items.length - 1; index >= 0; index -= 1) {
          const itemUuid = folder.items[index];
          if (repair.orphanMemberships.has(`${folder.uuid}\u0000${itemUuid}`)) {
            folder.items.splice(index, 1);
            continue;
          }
          const winningFolderUuid = repair.winningFolderByItem.get(itemUuid);
          if (
            winningFolderUuid &&
            (winningFolderUuid !== folder.uuid || retainedItems.has(itemUuid))
          ) {
            folder.items.splice(index, 1);
          } else if (winningFolderUuid === folder.uuid) {
            retainedItems.add(itemUuid);
          }
        }
      }
    });
  } finally {
    repairingFolderMemberships = false;
    folderMembershipRepairsInFlight.delete(handle);
  }
};

const scheduleFolderMembershipRepair = (): void => {
  if (folderMembershipRepairQueued || repairingFolderMemberships) return;
  folderMembershipRepairQueued = true;
  queueMicrotask(() => {
    folderMembershipRepairQueued = false;
    repairConcurrentFolderMemberships().catch((error: unknown) => {
      import("utils/logging/clientLogger").then(({ clientLogger }) => {
        clientLogger.error(
          { logId: "automergeDocHandles", logValue: "Could not reconcile folder memberships" },
          error instanceof Error ? error : new Error(String(error))
        );
      });
    });
  });
};

const onMissionDocumentChange = (): void => scheduleFolderMembershipRepair();

/**
 * Returns the mission doc handle, or null if it has not been set yet.
 * Logs an error when null so callers don't need to repeat the log boilerplate.
 * Callers should guard with `if (!missionDocHandle) return;`.
 */
export const getMissionDocHandle = (): DocHandle<Mission> | null => {
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

export const setMissionAutomergeDocHandle = (
  docHandle: DocHandle<Mission>,
  canEdit = false
): void => {
  automergeMissionDocHandle = docHandle;
  missionCanEdit = canEdit;
  if (!canEdit || subscribedMissionDocHandle !== docHandle) {
    subscribedMissionDocHandle?.off("change", onMissionDocumentChange);
    subscribedMissionDocHandle = null;
  }
  if (canEdit && subscribedMissionDocHandle !== docHandle) {
    subscribedMissionDocHandle = docHandle;
    subscribedMissionDocHandle?.on("change", onMissionDocumentChange);
  }
  if (canEdit) scheduleFolderMembershipRepair();
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
  const handle = getMissionDocHandle();
  if (!handle) return undefined;
  return op(handle, ...args);
}
