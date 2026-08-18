/**
 * DashboardBoundsProvider — shared state between dashboard and minimap.
 *
 * Lifts the "big map viewport bounds" into a context so that:
 * - The dashboard map can publish its viewport extent on every move/zoom
 * - The minimap can draw a bounds box and auto-fit to all objects + bounds
 *
 * Also carries the two eyeball-menu toggles that the minimap mirrors from the
 * dashboard menu (scale bar + traverse arrows). The dashboard map has the only
 * eyeball menu; it publishes these here and the minimap reads them so both maps
 * stay in sync live. Other eyeball settings remain scoped per-map.
 *
 * Finally it carries the grid spacing the dashboard drew, so the minimap can
 * render the same ground spacing and show as many grid lines inside the
 * bounds box as the dashboard shows.
 *
 * Only used on the dashboard page. Wrap both maps in this provider.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { Extent } from "ol/extent";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** Grid line/label spacing, in ground metres of the mission projection. */
export interface GridSpacingMeters {
  /** Distance between adjacent drawn grid lines. */
  line: number;
  /** Distance between adjacent grid labels. */
  label: number;
}

export interface DashboardBoundsContextValue {
  /** The current viewport extent of the big (dashboard) map in projected CRS */
  bigMapExtent: Extent | null;
  /** Called by the dashboard map on moveend/zoomend */
  setBigMapExtent: (extent: Extent) => void;
  /** Scale bar visibility, mirrored from the dashboard eyeball menu */
  showScaleBar: boolean;
  setShowScaleBar: Dispatch<SetStateAction<boolean>>;
  /** Traverse arrow visibility, mirrored from the dashboard eyeball menu */
  showArrows: boolean;
  setShowArrows: Dispatch<SetStateAction<boolean>>;
  /** Grid spacing the dashboard last drew; null when it drew no grid */
  gridSpacing: GridSpacingMeters | null;
  /** Called by the dashboard map's Grid after each rebuild */
  setGridSpacing: (spacing: GridSpacingMeters | null) => void;
}

const DashboardBoundsContext = createContext<DashboardBoundsContextValue | null>(null);

export function useDashboardBoundsContext(): DashboardBoundsContextValue {
  const ctx = useContext(DashboardBoundsContext);
  if (!ctx) throw new Error("useDashboardBounds() must be used within <DashboardBoundsProvider>");
  return ctx;
}

/**
 * Same context, but null instead of throwing outside a provider — for behaviors
 * that also run on the editor map, which has no DashboardBoundsProvider.
 */
export function useOptionalDashboardBoundsContext(): DashboardBoundsContextValue | null {
  return useContext(DashboardBoundsContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface DashboardBoundsProviderProps {
  children: ReactNode;
}

export function DashboardBoundsProvider({ children }: DashboardBoundsProviderProps): JSX.Element {
  const [bigMapExtent, setBigMapExtentState] = useState<Extent | null>(null);
  const setBigMapExtent = useCallback((extent: Extent) => {
    setBigMapExtentState(extent);
  }, []);

  const [showScaleBar, setShowScaleBar] = useState(true);
  const [showArrows, setShowArrows] = useState(true);

  // The dashboard republishes on every animation frame while panning, so keep the
  // previous object when the numbers are unchanged — otherwise every frame would
  // re-render the minimap.
  const [gridSpacing, setGridSpacingState] = useState<GridSpacingMeters | null>(null);
  const setGridSpacing = useCallback((next: GridSpacingMeters | null) => {
    setGridSpacingState((prev) => {
      if (!prev || !next) return prev === next ? prev : next;
      return prev.line === next.line && prev.label === next.label ? prev : next;
    });
  }, []);

  const value = useMemo(
    () => ({
      bigMapExtent,
      setBigMapExtent,
      showScaleBar,
      setShowScaleBar,
      showArrows,
      setShowArrows,
      gridSpacing,
      setGridSpacing,
    }),
    [bigMapExtent, setBigMapExtent, showScaleBar, showArrows, gridSpacing, setGridSpacing]
  );

  return (
    <DashboardBoundsContext.Provider value={value}>{children}</DashboardBoundsContext.Provider>
  );
}
