import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

import { generateBlankMissionPriority } from "store/storeUtils/mission";
import { getAccurateNow } from "utils/formatting";

/**
 * Mission priorities are stored as a flat map of trace rows. The `category` string on each
 * row is the only thing that groups them, so a category exists exactly as long as at least
 * one row carries its name.
 */

/** Collect the distinct category names currently present on the mission. */
export function getMissionPriorityCategories(m: Pick<Mission, "missionPriorities">): string[] {
  const categories = new Set<string>();
  for (const missionPriority of Object.values(m.missionPriorities ?? {})) {
    categories.add(missionPriority.category);
  }
  return [...categories].sort((a, b) => a.localeCompare(b));
}

/** True when a category of this name already exists (case-insensitive). */
export function missionPriorityCategoryExists(
  m: Pick<Mission, "missionPriorities">,
  category: string
): boolean {
  const normalized = category.trim().toLocaleLowerCase();
  return getMissionPriorityCategories(m).some(
    (existing) => existing.trim().toLocaleLowerCase() === normalized
  );
}

/**
 * Create a new category by inserting a single placeholder trace row under it. Because
 * categories have no storage of their own, an empty category cannot be represented.
 * Returns the uuid of the placeholder row.
 */
export function applyCreateMissionPriorityCategory(
  m: Mission,
  { category }: { category: string }
): string {
  return applyCreateMissionPriority(m, { category });
}

/**
 * Insert a new blank mission priority (trace row) under an existing category.
 * Returns the newly-allocated uuid.
 */
export function applyCreateMissionPriority(m: Mission, { category }: { category: string }): string {
  const newUuid = uuidv4();

  if (m.missionPriorities == null) m.missionPriorities = {};
  m.missionPriorities[newUuid] = generateBlankMissionPriority({ category });
  m.updatedAt = getAccurateNow().getTime();

  return newUuid;
}

/**
 * Update a single field on a mission priority in the Mission draft.
 */
export function applyUpdateMissionPriorityByField<K extends keyof MissionPriority>(
  m: Mission,
  {
    missionPriorityUuid,
    fieldName,
    value,
  }: {
    missionPriorityUuid: string;
    fieldName: K;
    value: MissionPriority[K];
  }
): void {
  const missionPriority = m.missionPriorities?.[missionPriorityUuid];
  if (missionPriority) {
    missionPriority[fieldName] = cloneDeep(value);
    m.updatedAt = getAccurateNow().getTime();
  }
}

/**
 * Rename a category by rewriting the `category` string on every row that carries it.
 */
export function applyRenameMissionPriorityCategory(
  m: Mission,
  { fromCategory, toCategory }: { fromCategory: string; toCategory: string }
): void {
  if (fromCategory === toCategory) return;

  let renamed = false;
  for (const missionPriority of Object.values(m.missionPriorities ?? {})) {
    if (missionPriority.category === fromCategory) {
      missionPriority.category = toCategory;
      renamed = true;
    }
  }
  if (renamed) m.updatedAt = getAccurateNow().getTime();
}

/**
 * Delete a single mission priority row, clearing it from any action or action template
 * that referenced it.
 */
export function applyDeleteMissionPriority(
  m: Mission,
  { missionPriorityUuid }: { missionPriorityUuid: string }
): void {
  if (!m.missionPriorities?.[missionPriorityUuid]) return;

  delete m.missionPriorities[missionPriorityUuid];
  clearMissionPriorityReferences(m, new Set([missionPriorityUuid]));
  m.updatedAt = getAccurateNow().getTime();
}

/**
 * Delete an entire category along with every trace row it contains.
 */
export function applyDeleteMissionPriorityCategory(
  m: Mission,
  { category }: { category: string }
): void {
  const removedUuids = new Set<string>();
  for (const [uuid, missionPriority] of Object.entries(m.missionPriorities ?? {})) {
    if (missionPriority.category === category) removedUuids.add(uuid);
  }
  if (removedUuids.size === 0) return;

  for (const uuid of removedUuids) delete m.missionPriorities[uuid];
  clearMissionPriorityReferences(m, removedUuids);
  m.updatedAt = getAccurateNow().getTime();
}

/**
 * Null out `missionPriorityUuid` on every action and action template pointing at one of the
 * removed uuids. Deletion is normally blocked while references exist, so this is a safety net
 * that keeps the doc free of dangling foreign keys.
 */
function clearMissionPriorityReferences(m: Mission, removedUuids: Set<string>): void {
  for (const action of Object.values(m.actions ?? {})) {
    if (action.missionPriorityUuid && removedUuids.has(action.missionPriorityUuid)) {
      action.missionPriorityUuid = null;
    }
  }
  for (const actionTemplate of Object.values(m.actionTemplates ?? {})) {
    if (
      actionTemplate.missionPriorityUuid &&
      removedUuids.has(actionTemplate.missionPriorityUuid)
    ) {
      actionTemplate.missionPriorityUuid = null;
    }
  }
}
