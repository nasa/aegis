import sortBy from "lodash/sortBy";
import { ReactNode } from "react";

interface FolderDropdownItem {
  uuid: string;
  name: string;
}

interface FolderDropdownConfig<T extends FolderDropdownItem> {
  items: T[];
  folders: Folder[];
  itemsToFolders: Record<string, string>;
  filterFn?: (item: T) => boolean;
}

/**
 * Utility function to organize dropdown options by folders using optgroups
 *
 * @param config Configuration object containing items, folders, and customization options
 * @returns Array of React elements with optgroups for folders and individual options for unorganized items
 */
export function createFolderOrganizedDropdownOptions<T extends FolderDropdownItem>(
  config: FolderDropdownConfig<T>
): ReactNode[] {
  const { items, folders, itemsToFolders, filterFn = () => true } = config;

  // Filter and sort items
  const filteredItems = items.filter(filterFn);
  const sortedItems = [...filteredItems].sort((a, b) => a.name.localeCompare(b.name));

  // Group items by folder
  const itemsByFolder = sortedItems.reduce<Record<string, T[]>>((acc, item) => {
    const folderUuid = itemsToFolders[item.uuid];
    const key = folderUuid || "no-folder";
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});

  // Sort folders alphabetically by name
  const sortedFolders = sortBy(folders, [(folder) => folder.name.toLowerCase()]);

  const options: ReactNode[] = [];

  // First, render items in folders
  sortedFolders.forEach((folder) => {
    const itemsInFolder = itemsByFolder[folder.uuid];
    if (itemsInFolder && itemsInFolder.length > 0) {
      options.push(
        <optgroup key={folder.uuid} label={folder.name}>
          {itemsInFolder.map((item) => (
            <option key={item.uuid} value={item.uuid}>
              {item.name}
            </option>
          ))}
        </optgroup>
      );
    }
  });

  // Then, render items not in any folder
  const unorganizedItems = itemsByFolder["no-folder"];
  if (unorganizedItems && unorganizedItems.length > 0) {
    unorganizedItems.forEach((item) => {
      options.push(
        <option key={item.uuid} value={item.uuid}>
          {item.name}
        </option>
      );
    });
  }

  return options;
}
