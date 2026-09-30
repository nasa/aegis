/**
 * AegisMapDashboard — OL map wrapper for the main (large) dashboard map.
 *
 * Reads all state from Redux; no props needed. Must be rendered inside a
 * `<FeatureSourcesProvider>` and `<DashboardBoundsProvider>` so it can share
 * vector sources with `<AegisMapMinimap>` and publish viewport bounds.
 *
 * Owns its own `<MapMenuProvider>` so eyeball menu settings are scoped
 * to this map only — the minimap is unaffected.
 */
import { AegisMap } from "./AegisMap";
import { MapMenuProvider } from "./MapMenuProvider";
import { FollowModeProvider } from "./FollowModeProvider";
import { TileLayers } from "./behaviors/TileLayers";
import { LanderMarker } from "./behaviors/LanderMarker";
import { Circles } from "./behaviors/Circles";
import { Grid } from "./behaviors/Grid";
import { StationMarkers } from "./behaviors/StationMarkers";
import { PoiMarkers } from "./behaviors/PoiMarkers";
import { ActionMarkers } from "./behaviors/ActionMarkers";
import { TraverseLines } from "./behaviors/TraverseLines";
import { WalkbackLines } from "./behaviors/WalkbackLines";
import { PosEntries } from "./behaviors/PosEntries";
import { FollowMode } from "./behaviors/FollowMode";
import { MapOverlays } from "./overlays/MapOverlays";
import { MarkerLabels } from "./behaviors/MarkerLabels";
import { DashboardMenuPublisher } from "./MapMenuMinimapBridge";

export function AegisMapDashboard(): JSX.Element {
  return (
    <MapMenuProvider>
      <FollowModeProvider>
        <AegisMap mode="dashboard">
          <TileLayers />
          <Grid />
          <Circles />
          <TraverseLines />
          <WalkbackLines />
          <StationMarkers />
          <PoiMarkers />
          <ActionMarkers />
          <LanderMarker />
          <MarkerLabels />
          <PosEntries />
          <FollowMode />
          <MapOverlays />
          <DashboardMenuPublisher />
        </AegisMap>
      </FollowModeProvider>
    </MapMenuProvider>
  );
}
