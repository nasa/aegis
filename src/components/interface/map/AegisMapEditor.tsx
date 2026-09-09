/**
 * AegisMapEditor — OL map wrapper for the mission page.
 *
 * Composes all behavior components for the full editor experience:
 * tiles, markers, polylines, circles, grid, interactions, POS,
 * hover/selection highlights, timeline astronaut, and UI overlays.
 */
import { AegisMap } from "./AegisMap";
import { FeatureSourcesProvider } from "./FeatureSourcesProvider";
import { TileLayers } from "./behaviors/TileLayers";
import { LanderMarker } from "./behaviors/LanderMarker";
import { Circles } from "./behaviors/Circles";
import { Grid } from "./behaviors/Grid";
import { StationMarkers } from "./behaviors/StationMarkers";
import { PoiMarkers } from "./behaviors/PoiMarkers";
import { ActionMarkers } from "./behaviors/ActionMarkers";
import { TraverseLines } from "./behaviors/TraverseLines";
import { WalkbackLines } from "./behaviors/WalkbackLines";
import { MeasurementLines } from "./behaviors/MeasurementLines";
import { InteractionManager } from "./behaviors/InteractionManager";
import { PosEntries } from "./behaviors/PosEntries";
import { HoverHighlight } from "./behaviors/HoverHighlight";
import { SelectionHighlight } from "./behaviors/SelectionHighlight";
import { TimelineAstronaut } from "./behaviors/TimelineAstronaut";
import { MapOverlays } from "./overlays/MapOverlays";
import { MarkerLabels } from "./behaviors/MarkerLabels";

interface AegisMapEditorProps {
  className?: string;
}

export function AegisMapEditor({ className }: AegisMapEditorProps): JSX.Element {
  return (
    <FeatureSourcesProvider>
      <AegisMap mode="editor" className={className}>
        <TileLayers />
        <Grid />
        <Circles />
        <TraverseLines />
        <WalkbackLines />
        <MeasurementLines />
        <StationMarkers />
        <PoiMarkers />
        <ActionMarkers />
        <LanderMarker />
        <MarkerLabels />
        <PosEntries />
        <InteractionManager />
        <HoverHighlight />
        <SelectionHighlight />
        <TimelineAstronaut />
        <MapOverlays />
      </AegisMap>
    </FeatureSourcesProvider>
  );
}
