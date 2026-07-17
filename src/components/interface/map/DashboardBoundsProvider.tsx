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
}

const DashboardBoundsContext = createContext<DashboardBoundsContextValue | null>(null);

export function useDashboardBoundsContext(): DashboardBoundsContextValue {
  const ctx = useContext(DashboardBoundsContext);
  if (!ctx) throw new Error("useDashboardBounds() must be used within <DashboardBoundsProvider>");
  return ctx;
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

  const value = useMemo(
    () => ({
      bigMapExtent,
      setBigMapExtent,
      showScaleBar,
      setShowScaleBar,
      showArrows,
      setShowArrows,
    }),
    [bigMapExtent, setBigMapExtent, showScaleBar, showArrows]
  );

  return (
    <DashboardBoundsContext.Provider value={value}>{children}</DashboardBoundsContext.Provider>
  );
}
