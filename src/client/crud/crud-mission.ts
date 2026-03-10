import { getAutomergeDocHandles } from "client/automergeDocHandles";
import { getAccurateNow } from "utils/formatting";

/**
 * A utility functions to update/delete properties in the mission document
 * Use the reference to the doc handle that was initialized above
 * This removes the need for calling the automerge native useDocHandle hook in the components.
 *
 * Use function overloads to allow for both top level and nested field updates with correct typings
 * The first two signatures are the ones that can be called, the third is the actual implementation
 */

// Update a top level field: crudUpdateMissionByField("description", value)
export function crudUpdateMissionByField<K extends keyof Mission>(
  fieldName: K,
  value: Mission[K],
  preserveUpdatedAt?: boolean
): void;

// Update a nested map field: crudUpdateMissionByField("circleDefinitions", circleDefUuid, circleDefValue)
export function crudUpdateMissionByField<
  K extends keyof Mission,
  MapKey extends keyof NonNullable<Mission[K]>,
>(
  mapFieldName: K,
  mapKey: MapKey,
  mapValue: NonNullable<Mission[K]>[MapKey],
  preserveUpdatedAt?: boolean
): void;

export function crudUpdateMissionByField<
  K extends keyof Mission,
  MapKey extends keyof NonNullable<Mission[K]>,
>(
  fieldName: K,
  valueOrMapKey: Mission[K] | MapKey,
  mapValue?: NonNullable<Mission[K]>[MapKey],
  preserveUpdatedAt = false
): void {
  const automergeDocHandles = getAutomergeDocHandles();
  const missionDocHandle = automergeDocHandles.mission;
  if (!missionDocHandle) {
    console.error("Mission doc handle is not set");
    return;
  }

  missionDocHandle.change((m: Mission) => {
    if (mapValue !== undefined) {
      // This is map field with a nested key/value we need to update
      const map = m[fieldName] as NonNullable<Mission[K]>;
      map[valueOrMapKey as MapKey] = mapValue;
    } else {
      m[fieldName] = valueOrMapKey as Mission[K];
    }
    if (!preserveUpdatedAt) m.updatedAt = getAccurateNow().getTime();
  });
}
