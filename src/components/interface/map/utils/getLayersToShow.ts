/**
 * getLayersToShow — pure function that computes which sublayers should be
 * visible on the map, in the correct z-order.
 *
 * Pure function: no side effects, no React hooks, no Redux.
 */

import sortBy from "lodash/sortBy";
import { matchTimeToManifest, checkTimeInBounds } from "utils/mapping/timeLayers";

/**
 * A sublayer that should be rendered, enriched with:
 *   - resolved time-layer path (for time-based sublayers)
 *   - per-sublayer visual style from the preset
 *   - z-index (array position)
 */
export interface SublayerToRender extends SublayerToDraw {
  /** Visual controls from the preset (opacity, filters, blend). */
  visualStyle: MapSublayerStyle;
  /** Time info for the selected time slice, or null if not time-based. */
  timeInfo: TimeLayerInfo | null;
}

/**
 * Determine which sublayers should be shown, in UI order (index 0 = top of panel).
 *
 * Callers must invert the index for z-ordering: top-of-list items need the
 * highest zIndex so they render on top of the map.
 */
export function getLayersToShow({
  selectedPreset,
  missionSublayers,
  missionLayers,
  mapDateTime,
}: {
  selectedPreset: Preset;
  missionSublayers: Sublayer[];
  missionLayers: Layer[];
  mapDateTime: string | null;
}): SublayerToRender[] {
  if (!selectedPreset || !missionSublayers) return [];

  const result: SublayerToRender[] = [];

  if (selectedPreset.layerOrder?.length) {
    // Ordered preset — iterate in preset layer order
    for (const headerLayer of selectedPreset.layerOrder) {
      for (const sublayerUuid of headerLayer.sublayerUuids) {
        const control = selectedPreset.mapSublayerControls[sublayerUuid];
        if (!control?.visible) continue;

        const sublayer = missionSublayers.find((s) => s.uuid === sublayerUuid);
        if (!sublayer) continue;

        const resolved = resolveTimePath(sublayer, mapDateTime);
        if (!resolved) continue; // out of time bounds — skip

        result.push({
          ...resolved.sublayerToDraw,
          visualStyle: control.style,
          timeInfo: resolved.timeInfo,
        });
      }
    }
  } else {
    // No ordering — sort by layer name, then sublayer name (legacy fallback)
    const sortedLayers = sortBy(missionLayers, [(l) => l.name.toLowerCase()]);
    for (const layer of sortedLayers) {
      const layerSublayers = sortBy(
        missionSublayers.filter((s) => s.layerUuid === layer.uuid),
        [(s) => s.name.toLowerCase()]
      );
      for (const sublayer of layerSublayers) {
        const control = selectedPreset.mapSublayerControls[sublayer.uuid];
        if (!control?.visible) continue;

        const resolved = resolveTimePath(sublayer, mapDateTime);
        if (!resolved) continue;

        result.push({
          ...resolved.sublayerToDraw,
          visualStyle: control.style,
          timeInfo: resolved.timeInfo,
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Time resolution
// ---------------------------------------------------------------------------

interface ResolvedSublayer {
  sublayerToDraw: SublayerToDraw;
  timeInfo: TimeLayerInfo | null;
}

/**
 * For time-based sublayers, resolve the current time slice path.
 * Returns null if the current time is out of bounds (layer shouldn't be shown).
 */
function resolveTimePath(sublayer: Sublayer, mapDateTime: string | null): ResolvedSublayer | null {
  if (!sublayer.isTimeBased || !mapDateTime || !sublayer.timeLayerManifest?.length) {
    // Not time-based — always show
    return {
      sublayerToDraw: { ...sublayer, chosenTimeLayer: null },
      timeInfo: null,
    };
  }

  const timeInfo = matchTimeToManifest(mapDateTime, sublayer.timeLayerManifest);

  // Check if current time is within bounds
  if (!checkTimeInBounds(mapDateTime, timeInfo.lowerBound, timeInfo.upperBound)) {
    return null; // Out of bounds — don't show
  }

  return {
    sublayerToDraw: {
      ...sublayer,
      chosenTimeLayer: timeInfo,
      path: `${sublayer.path}/${timeInfo.dirName}`,
    },
    timeInfo,
  };
}
