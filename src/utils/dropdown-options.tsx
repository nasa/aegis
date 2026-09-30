import sortBy from "lodash/sortBy";
import type { ReactNode } from "react";

interface DropdownItem {
  uuid: string;
  name: string;
}

interface DropdownWithHeadingsConfig<T extends DropdownItem> {
  items: T[];
  /**
   * Heading key an item belongs under. Return null or an empty string to leave the item
   * ungrouped; ungrouped options are rendered after every heading.
   */
  getHeading: (item: T) => string | null | undefined;
  /** Display text for a heading key. Defaults to the key itself. */
  headingLabels?: Record<string, string>;
  /** Heading render order. Keys omitted here follow, sorted alphabetically by label. */
  headingOrder?: string[];
  /** Option text. Defaults to the item name. */
  getLabel?: (item: T) => string;
  /** Item order within a heading. Defaults to name collation. */
  compareItems?: (a: T, b: T) => number;
  filterFn?: (item: T) => boolean;
}

/**
 * Build `<optgroup>` / `<option>` elements for a dropdown whose items are grouped under
 * headings (folders, categories, or anything else derived from the item).
 *
 * @param config Configuration object describing the items and how to group them
 * @returns Array of React elements
 */
export function createDropdownWithHeadings<T extends DropdownItem>(
  config: DropdownWithHeadingsConfig<T>
): ReactNode[] {
  const {
    items,
    getHeading,
    headingLabels = {},
    headingOrder,
    getLabel = (item: T) => item.name,
    compareItems = (a: T, b: T) => a.name.localeCompare(b.name),
    filterFn = () => true,
  } = config;

  const labelFor = (heading: string) => headingLabels[heading] ?? heading;

  const sortedItems = [...items.filter(filterFn)].sort(compareItems);

  // Group items by heading key, with a null key bucketing the ungrouped items
  const itemsByHeading = new Map<string | null, T[]>();
  for (const item of sortedItems) {
    const heading = getHeading(item) || null;
    const bucket = itemsByHeading.get(heading);
    if (bucket) {
      bucket.push(item);
    } else {
      itemsByHeading.set(heading, [item]);
    }
  }

  const presentHeadings = [...itemsByHeading.keys()].filter(
    (heading): heading is string => heading !== null
  );
  // Explicitly ordered headings come first, then anything left over alphabetically by label
  const orderedHeadings = [
    ...(headingOrder ?? []).filter((heading) => itemsByHeading.has(heading)),
    ...sortBy(
      presentHeadings.filter((heading) => !headingOrder?.includes(heading)),
      [(heading) => labelFor(heading).toLowerCase()]
    ),
  ];

  const renderOption = (item: T) => (
    <option key={item.uuid} value={item.uuid}>
      {getLabel(item)}
    </option>
  );

  const options: ReactNode[] = [];

  orderedHeadings.forEach((heading) => {
    const itemsInHeading = itemsByHeading.get(heading);
    if (itemsInHeading && itemsInHeading.length > 0) {
      options.push(
        <optgroup key={heading} label={labelFor(heading)}>
          {itemsInHeading.map(renderOption)}
        </optgroup>
      );
    }
  });

  itemsByHeading.get(null)?.forEach((item) => options.push(renderOption(item)));

  return options;
}

interface FolderDropdownConfig<T extends DropdownItem> {
  items: T[];
  folders: Folder[];
  itemsToFolders: Record<string, string>;
  filterFn?: (item: T) => boolean;
}

/**
 * Organize dropdown options into `<optgroup>`s by folder, with items in no folder listed
 * last. Headings are keyed by folder uuid so folders sharing a name stay distinct.
 *
 * @param config Configuration object containing items, folders, and customization options
 * @returns Array of React elements
 */
export function createFolderOrganizedDropdownOptions<T extends DropdownItem>(
  config: FolderDropdownConfig<T>
): ReactNode[] {
  const { items, folders, itemsToFolders, filterFn } = config;

  return createDropdownWithHeadings({
    items,
    filterFn,
    getHeading: (item) => itemsToFolders[item.uuid],
    headingLabels: Object.fromEntries(folders.map((folder) => [folder.uuid, folder.name])),
    headingOrder: sortBy(folders, [(folder) => folder.name.toLowerCase()]).map(
      (folder) => folder.uuid
    ),
  });
}
