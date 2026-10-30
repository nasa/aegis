import { applyDeleteFolder } from "operations/apply/apply-mission-folder";

/** Uuids of the entities a folder of the given type can hold. */
const getFolderTargetUuids = (mission: Mission, type: FolderType): Set<string> => {
  const targets: Record<FolderType, { [uuid: string]: unknown }> = {
    poi: mission.pois,
    station: mission.stations,
    eva: mission.evas,
    preset: mission.presets,
    layer: mission.layers,
    asset: mission.assets,
  };
  return new Set(Object.keys(targets[type] ?? {}));
};

/**
 * Delete a folder. Refuses to delete and returns an in-use message if the folder still holds
 * an existing entity. Otherwise asks `confirmDelete` and deletes only if it returns true.
 *
 * @returns an in-use message if the folder is not empty, otherwise `undefined`.
 */
export function opDeleteFolder(
  missionDocHandle: DocHandle<Mission>,
  folderUuid: string,
  confirmDelete: () => boolean
): string | undefined {
  if (!missionDocHandle || !folderUuid) return undefined;
  const mission = missionDocHandle.doc();
  const folder = mission?.folders?.[folderUuid];
  if (!folder) return undefined;

  // Step 1: Check if the folder is empty. Ignore item uuids whose entity no longer exists;
  // they are not shown in the folder.
  const targetUuids = getFolderTargetUuids(mission, folder.type);
  if (folder.items.some((itemUuid) => targetUuids.has(itemUuid))) {
    return "Cannot delete folder with items in it";
  }

  if (!confirmDelete()) return undefined;

  // Step 2: Folder is empty — delete it from the Automerge doc.
  missionDocHandle.change((m: Mission) => applyDeleteFolder(m, folderUuid));

  return undefined;
}
