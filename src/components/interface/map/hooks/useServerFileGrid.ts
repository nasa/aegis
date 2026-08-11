import { useSyncExternalStore } from "react";

import { getLoadedGrid, getServerFileGrid, subscribeLoadedGrid } from "utils/mapping/grid";
import { refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";

/**
 * The mission's server-file grid when there is one to work with — i.e. the
 * mission's `gridRenderMode` is "server-file" *and* the coordinate file has
 * loaded. Null otherwise, so callers can guard on the return value alone.
 *
 * Returns the loaded grid by reference (never a new object), so it is safe to
 * use directly in dependency arrays.
 */
export function useServerFileGrid(): MissionGrid | null {
  const gridRenderMode = useMissionDocSelector((doc) => doc.gridRenderMode, refEqual);
  // Subscribe for the re-render; getServerFileGrid reads the same store.
  useSyncExternalStore(subscribeLoadedGrid, getLoadedGrid, getLoadedGrid);
  return getServerFileGrid(gridRenderMode);
}
