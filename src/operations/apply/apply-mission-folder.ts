import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";

/** Insert/replace a folder in the doc. */
export function applyUpsertFolder(m: Mission, folder: Folder): void {
  m.folders[folder.uuid] = cloneDeep(folder);
}

/** Rename a folder. */
export function applyRenameFolder(
  m: Mission,
  { folderUuid, name }: { folderUuid: string; name: string }
): void {
  const folder = m.folders[folderUuid];
  if (!folder) return;
  folder.name = name;
  folder.updatedAt = getAccurateNow().getTime();
}

/** Delete a folder from the doc. */
export function applyDeleteFolder(m: Mission, folderUuid: string): void {
  delete m.folders[folderUuid];
}

/** Remove the given item uuids from every folder that contains them. */
export function applyRemoveItemsFromAllFolders(m: Mission, itemUuids: string[]): void {
  if (itemUuids.length === 0) return;
  const itemUuidSet = new Set(itemUuids);
  const now = getAccurateNow().getTime();
  for (const folder of Object.values(m.folders ?? {})) {
    for (let index = folder.items.length - 1; index >= 0; index -= 1) {
      if (itemUuidSet.has(folder.items[index])) {
        folder.items.splice(index, 1);
        folder.updatedAt = now;
      }
    }
  }
}

/**
 * Move an item into a folder, removing it from any other folder first.
 * A null folderUuid moves the item back to the root (no folder).
 */
export function applyMoveItemToFolder(
  m: Mission,
  { folderUuid, itemUuid }: { folderUuid: string | null; itemUuid: string }
): void {
  applyRemoveItemsFromAllFolders(m, [itemUuid]);
  if (folderUuid === null) return;
  const folder = m.folders[folderUuid];
  if (!folder) return;
  folder.items.push(itemUuid);
  folder.updatedAt = getAccurateNow().getTime();
}
