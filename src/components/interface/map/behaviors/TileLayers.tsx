/**
 * TileLayers — behavior component that manages all sublayer types on the map.
 *
 * Handles raster tiles, GeoJSON vectors, PMTiles, and COG layers.
 * Reads state from Redux (preset visibility, mission sublayers, map time),
 * computes the desired layer set via `getLayersToShow()`, and reconciles
 * the OL map's layers by adding, removing, or updating as needed.
 *
 * Returns null — this is a headless behavior component.
 */

import { useEffect, useMemo, useRef } from "react";
import type { Layer as OLLayer } from "ol/layer";
import type { VectorImage as VectorImageLayer } from "ol/layer";
import type VectorTileLayer from "ol/layer/VectorTile";
import MVT from "ol/format/MVT";
import { PMTilesVectorSource } from "ol-pmtiles";
import { PMTiles } from "pmtiles";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { parseEsriPmtilesMetadata, buildTileGrid } from "../utils/parsers/esriPMTiles";

import { useMapContext } from "../MapProvider";
import { useMapDateTime } from "../hooks/useMapDateTime";
import {
  createOlLayer,
  createCogLayer,
  buildVectorStyleFn,
  type LayerFactoryInput,
  type TileGridConfig,
} from "../utils/layers/layerFactory";
import { applyVisualStyle, clearVisualStyle } from "../utils/visualStyleApplicator";
import { getLayersToShow, type SublayerToRender } from "../utils/getLayersToShow";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TileLayers(): null {
  const { map } = useMapContext();
  const mapDateTime = useMapDateTime();

  // --- Redux state --------------------------------------------------------
  const selectedPresetUuid = useAppSelector((s) => s.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (s) => s.preset.presets.find((p) => p.uuid === selectedPresetUuid),
    deepEqual
  );
  const missionLayers = useAppSelector((s) => s.mission.layers, deepEqual);
  const missionSublayers = useAppSelector((s) => s.mission.sublayers, deepEqual);
  const missionId = useMissionDocSelector((doc) => doc.id, refEqual);

  // --- Mission projection config (for tile grid building) ------------------
  // Custom tile grids are only needed for non-Mercator projections (raster
  // profile, e.g. polar stereographic). Mercator missions (projIsCustom=false)
  // must use the default EPSG:3857 tile grid — their projBounds/projOrigin are
  // in degrees, not meters, and would produce an invalid tile grid.
  const projIsCustom = useMissionDocSelector((doc) => doc.projIsCustom, refEqual);
  const projConfigRaw = useMissionDocSelector(
    (doc) => ({
      projResUnitsPerPixel: doc.projResUnitsPerPixel,
      projResZoomLevel: doc.projResZoomLevel,
      projOriginX: doc.projOriginX,
      projOriginY: doc.projOriginY,
      projBoundsMinX: doc.projBoundsMinX,
      projBoundsMinY: doc.projBoundsMinY,
      projBoundsMaxX: doc.projBoundsMaxX,
      projBoundsMaxY: doc.projBoundsMaxY,
    }),
    deepEqual
  ) as TileGridConfig | undefined;
  const projConfig = projIsCustom ? projConfigRaw : undefined;

  const projCode = useMemo(() => {
    const view = map.getView();
    return view.getProjection().getCode();
  }, [map]);

  // --- Compute desired layers ----------------------------------------------
  const layersToShow = useMemo(() => {
    if (!selectedPreset || !missionSublayers) return [];
    return getLayersToShow({
      selectedPreset,
      missionSublayers,
      missionLayers: missionLayers ?? [],
      mapDateTime,
    });
  }, [selectedPreset, missionSublayers, missionLayers, mapDateTime]);

  // --- Reconcile layers on the map ----------------------------------------
  const activeLayersRef = useRef(new Map<string, OLLayer>());
  const prevPresetUuidRef = useRef<string | null>(null);
  const prevMapRef = useRef<typeof map | null>(null);

  useEffect(() => {
    // If the map instance changed, the old layers belong to the disposed map.
    // Clear our tracking so the reconciliation re-adds them to the new map.
    if (prevMapRef.current !== null && prevMapRef.current !== map) {
      activeLayersRef.current.clear();
    }
    prevMapRef.current = map;

    // On preset switch, tear down ALL layers and rebuild (per migration plan)
    if (prevPresetUuidRef.current !== null && prevPresetUuidRef.current !== selectedPresetUuid) {
      for (const [, layer] of activeLayersRef.current) {
        clearVisualStyle(layer);
        map.removeLayer(layer);
      }
      activeLayersRef.current.clear();
    }
    prevPresetUuidRef.current = selectedPresetUuid;

    if (!missionId) return;

    const desiredUuids = new Set(layersToShow.map((l) => l.uuid));

    // Remove layers that should no longer be visible
    for (const [uuid, layer] of activeLayersRef.current) {
      if (!desiredUuids.has(uuid)) {
        clearVisualStyle(layer);
        map.removeLayer(layer);
        activeLayersRef.current.delete(uuid);
      }
    }

    // Add new layers, update existing.
    // Data layers (tiles, vectors) must sit BELOW all feature layers
    // (circles at Z_INDEX.CIRCLES=6, grid, markers, etc.) which start at z≥6.
    // We use negative z-indices so no cap arithmetic is needed:
    //   layerOrder[0] = top of UI list → rendered on top → z-index -1
    //   layerOrder[N] = bottom of list → rendered at bottom → z-index -(N+1)
    // This guarantees strict ordering regardless of how many layers exist,
    // and all data layers stay below z=0 which is below every feature layer.
    layersToShow.forEach((sublayerToRender, index) => {
      const zIndex = -(index + 1);
      const existing = activeLayersRef.current.get(sublayerToRender.uuid);

      // For time-based sublayers the resolved `path` embeds the current
      // time-slice directory (`.../{dirName}`), which is baked into the layer's
      // tile/data source URL at creation time. When the map time moves to a
      // different manifest entry the resolved path changes but the sublayer uuid
      // does not, so an existing layer must be torn down and rebuilt — the XYZ /
      // GeoTIFF / vector sources cannot be cheaply repointed. Non-time-based
      // layers keep a stable path, so this never triggers a spurious rebuild.
      const pathChanged =
        existing != null && existing.get("_resolvedPath") !== sublayerToRender.path;

      if (existing && !pathChanged) {
        // Layer exists and points at the same source — update z-index and
        // visual style only
        existing.setZIndex(zIndex);
        applyVisualStyle(existing, sublayerToRender.visualStyle);
        const baseResolution = map.getView().getResolutionForZoom(0);
        if (sublayerToRender.type === "vector") {
          (existing as VectorImageLayer).setStyle(
            buildVectorStyleFn(sublayerToRender.visualStyle, baseResolution)
          );
        } else if (sublayerToRender.type === "vector-tile") {
          (existing as VectorTileLayer).setStyle(
            buildVectorStyleFn(sublayerToRender.visualStyle, baseResolution)
          );
        }
      } else {
        // Tear down the stale layer first if only its resolved path changed
        // (e.g. the time slider moved to a new time slice).
        if (existing) {
          clearVisualStyle(existing);
          map.removeLayer(existing);
          activeLayersRef.current.delete(sublayerToRender.uuid);
        }

        // Create new layer
        const layer = createLayerForSublayer(
          sublayerToRender,
          missionId,
          projCode,
          projConfig ?? null
        );
        if (!layer) return;

        // Remember the resolved path so a later time change can detect that the
        // source URL is stale and rebuild.
        layer.set("_resolvedPath", sublayerToRender.path);
        layer.setZIndex(zIndex);
        applyVisualStyle(layer, sublayerToRender.visualStyle);
        if (sublayerToRender.type === "vector") {
          const source = (layer as VectorImageLayer).getSource();
          source?.once("featuresloadend", () => {
            layer.changed();
            map.render();
          });
        }
        map.addLayer(layer);
        activeLayersRef.current.set(sublayerToRender.uuid, layer);

        // If it's a PMTiles layer, asynchronously attach the source
        if (sublayerToRender.type === "vector-tile") {
          attachPmtilesSource(layer as VectorTileLayer, projCode);
        }
      }
    });

    // Trigger an explicit render pass after reconciling layers. When layers
    // are added during the initial mount (before the map has painted its
    // first frame) OL may not schedule tile loading automatically. Calling
    // render() ensures tile sources compute their visible tile ranges and
    // start requesting tiles immediately.
    map.render();
  }, [layersToShow, selectedPresetUuid, missionId, map, projCode, projConfig]);

  // --- Cleanup on unmount -------------------------------------------------
  useEffect(() => {
    const activeLayers = activeLayersRef.current;
    return () => {
      for (const [, layer] of activeLayers) {
        clearVisualStyle(layer);
        map.removeLayer(layer);
      }
      activeLayers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// ---------------------------------------------------------------------------
// Layer creation dispatcher
// ---------------------------------------------------------------------------

function createLayerForSublayer(
  sublayer: SublayerToRender,
  missionId: number,
  projCode: string,
  projConfig: TileGridConfig | null
): OLLayer | null {
  const input: LayerFactoryInput = {
    sublayer,
    missionId,
    projCode,
    style: sublayer.visualStyle,
    projConfig,
  };

  // COG raster sublayers are self-describing GeoTIFFs rendered via WebGLTile + GeoTIFF,
  // identified by a `.tif`/`.tiff` path (a file inside the layer's Layers/ folder).
  // A `.pmtiles` path is not matched here, so vector-tile layers still route to createOlLayer.
  if (isCogPath(sublayer.path)) {
    return createCogLayer(input);
  }

  return createOlLayer(input);
}

function isCogPath(path: string): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return lower.endsWith(".tif") || lower.endsWith(".tiff");
}

// ---------------------------------------------------------------------------
// Async PMTiles source attachment
// ---------------------------------------------------------------------------

/**
 * PMTiles vector-tile layers are created without a source (to avoid blocking
 * the initial render). This function asynchronously reads the PMTiles archive
 * metadata, builds a tile grid from the embedded ESRI config, and attaches
 * the source to the layer.
 *
 */
async function attachPmtilesSource(layer: VectorTileLayer, projCode: string): Promise<void> {
  const url = layer.get("_pmtilesUrl") as string | undefined;
  if (!url) return;

  try {
    // Reads ArcGIS vector tile cache metadata embedded in a PMTiles archive
    // and produces an OpenLayers-ready TileGrid configuration.
    const archive = new PMTiles(url);
    const metadata = (await archive.getMetadata()) as Record<string, unknown>;
    const config = parseEsriPmtilesMetadata(metadata);

    if (!config) {
      console.warn("[TileLayers] Could not parse PMTiles metadata for", url);
      return;
    }

    layer.setSource(
      new PMTilesVectorSource({
        url,
        projection: projCode,
        format: new MVT(),
        tileGrid: buildTileGrid(config),
      })
    );
  } catch (error) {
    console.warn("[TileLayers] Failed to attach PMTiles source for", url, error);
  }
}
