/**
 * MapMenuMinimapBridge — one-way sync of two eyeball toggles from the dashboard
 * map to the minimap.
 *
 * The minimap has no eyeball menu of its own, but users expect the scale bar and
 * traverse arrows to follow the dashboard menu. Each map still owns a separate
 * `MapMenuProvider`, so these two headless components relay just those two values
 * through the shared `DashboardBoundsProvider`:
 *
 *   DashboardMenuPublisher  (dashboard map): MapMenuProvider  → DashboardBounds
 *   MinimapMenuSubscriber   (minimap map):   DashboardBounds → MapMenuProvider
 *
 * The minimap's ScaleBar is gated directly on the shared value; only the arrows
 * are synced back into the minimap's provider so its unchanged TraverseLines
 * behavior reads them.
 */

import { useEffect } from "react";
import { useMapMenuContext, useMapMenuSetters } from "./MapMenuProvider";
import { useDashboardBoundsContext } from "./DashboardBoundsProvider";

/** Dashboard map: publish scale bar + arrows from its menu to the shared context. */
export function DashboardMenuPublisher(): null {
  const { showScaleBar, showArrows } = useMapMenuContext();
  const { setShowScaleBar, setShowArrows } = useDashboardBoundsContext();

  useEffect(() => {
    setShowScaleBar(showScaleBar);
  }, [showScaleBar, setShowScaleBar]);

  useEffect(() => {
    setShowArrows(showArrows);
  }, [showArrows, setShowArrows]);

  return null;
}

/** Minimap: mirror the shared arrows value into its own provider for TraverseLines. */
export function MinimapMenuSubscriber(): null {
  const { showArrows } = useDashboardBoundsContext();
  const { setShowArrows } = useMapMenuSetters();

  useEffect(() => {
    setShowArrows(showArrows);
  }, [showArrows, setShowArrows]);

  return null;
}
