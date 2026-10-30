/**
 * MapMenuMinimapBridge — one-way sync of eyeball toggles from the dashboard
 * map to the minimap.
 *
 * The minimap has no eyeball menu of its own, but users expect the scale bar,
 * traverse arrows, and assets to follow the dashboard menu. Each map still owns a separate
 * `MapMenuProvider`, so these two headless components relay just those values
 * through the shared `DashboardBoundsProvider`:
 *
 *   DashboardMenuPublisher  (dashboard map): MapMenuProvider  → DashboardBounds
 *   MinimapMenuSubscriber   (minimap map):   DashboardBounds → MapMenuProvider
 *
 * The minimap's ScaleBar is gated directly on the shared value; the arrows and assets
 * are synced back into the minimap's provider so its TraverseLines and asset behaviors
 * read them. The minimap draws no labels, so asset labels are not mirrored.
 */

import { useEffect } from "react";
import { useMapMenuContext, useMapMenuSetters } from "./MapMenuProvider";
import { useDashboardBoundsContext } from "./DashboardBoundsProvider";

/** Dashboard map: publish scale bar, arrows, and assets from its menu to the shared context. */
export function DashboardMenuPublisher(): null {
  const { showScaleBar, showArrows, submenuAssets } = useMapMenuContext();
  const { setShowScaleBar, setShowArrows, setShowAssets } = useDashboardBoundsContext();

  useEffect(() => {
    setShowScaleBar(showScaleBar);
  }, [showScaleBar, setShowScaleBar]);

  useEffect(() => {
    setShowArrows(showArrows);
  }, [showArrows, setShowArrows]);

  useEffect(() => {
    setShowAssets(submenuAssets.show);
  }, [submenuAssets.show, setShowAssets]);

  return null;
}

/** Minimap: mirror the shared arrows and assets values into its own provider. */
export function MinimapMenuSubscriber(): null {
  const { showArrows, showAssets } = useDashboardBoundsContext();
  const { setShowArrows, setSubmenuAssets } = useMapMenuSetters();

  useEffect(() => {
    setShowArrows(showArrows);
  }, [showArrows, setShowArrows]);

  useEffect(() => {
    setSubmenuAssets((current) =>
      current.show === showAssets ? current : { ...current, show: showAssets }
    );
  }, [showAssets, setSubmenuAssets]);

  return null;
}
