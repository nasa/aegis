/**
 * AegisMapMinimap — OL map wrapper for the small overview map on the dashboard.
 *
 * Must be rendered inside a `<FeatureSourcesProvider>` and `<DashboardBoundsProvider>`
 * so both the main dashboard map and this mini map share the same vector sources.
 *
 * Owns its own `<MapMenuProvider>` so eyeball menu settings are scoped to this map
 * only — with two exceptions mirrored from the dashboard menu via
 * `DashboardBoundsProvider`: scale bar and traverse arrows. The scale bar is gated
 * on the shared value directly; arrows are synced into the local provider by
 * `MinimapMenuSubscriber` so the shared `TraverseLines` behavior picks them up.
 */
import { AegisMap } from "./AegisMap";
import { MapMenuProvider } from "./MapMenuProvider";
import { useDashboardBoundsContext } from "./DashboardBoundsProvider";
import { MinimapMenuSubscriber } from "./MapMenuMinimapBridge";
import { TileLayers } from "./behaviors/TileLayers";
import { Grid } from "./behaviors/Grid";
import { LanderMarker } from "./behaviors/LanderMarker";
import { StationMarkers } from "./behaviors/StationMarkers";
import { TraverseLines } from "./behaviors/TraverseLines";
import { PosEntries } from "./behaviors/PosEntries";
import { BigMapBoundsBox } from "./behaviors/BigMapBoundsBox";
import { AutoFitBounds } from "./behaviors/AutoFitBounds";
import { ScaleBar } from "./overlays/ScaleBar";

import mapStyles from "./overlays/mapOverlays.module.css";

export function AegisMapMinimap(): JSX.Element {
  // Scale bar visibility mirrors the dashboard eyeball menu (the minimap has no
  // menu of its own). Readable here since the minimap is nested under
  // DashboardBoundsProvider on the dashboard page.
  const { showScaleBar } = useDashboardBoundsContext();

  return (
    <MapMenuProvider>
      <AegisMap mode="minimap">
        <TileLayers />
        <Grid />
        <TraverseLines />
        <StationMarkers />
        <LanderMarker />
        <PosEntries />
        <BigMapBoundsBox />
        <AutoFitBounds />
        <MinimapMenuSubscriber />

        {/* Scale bar — bottom left, gated on the dashboard menu toggle. */}
        {showScaleBar && (
          <div className={mapStyles.mapScaleDisplay}>
            <ScaleBar />
          </div>
        )}
      </AegisMap>
    </MapMenuProvider>
  );
}
