/**
 * AssetMarkers — behavior component for asset markers on the OL map.
 *
 * Draws every placed, visible asset (see `getVisibleMapAssets`) on the shared assetSource,
 * in every editor section and on the dashboard and minimap — gated by
 * `MODE_CONFIGS[mode].asset.show`, which is false on the minimap so the behaviors stay mounted
 * but draw nothing there. On the editor, an open in-edit
 * session replaces its saved values under the same feature id, so `editMarker` has exactly
 * one target and there is never a duplicate marker.
 *
 * Returns null — headless behavior component.
 */

import { useEffect, useMemo, useRef } from "react";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { MapBrowserEvent } from "ol";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";
import { EMPTY_DOC_LIST } from "store/selectors";
import { setHoverAssetUuid } from "store/hover";
import { thunkMarkerOnClick } from "store/thunk/thunkMap";
import { getAssetRadiusColor, getVisibleMapAssets } from "utils/assets";

import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useFeatureSourcesContext } from "../FeatureSourcesProvider";
import { useMapMenuContext } from "../MapMenuProvider";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { reconcileFeatures, type FeatureDescriptor } from "../utils/featureReconciler";
import { buildAssetStyleFunction } from "../utils/styles/markers";
import { Z_INDEX } from "../utils/zIndex";

/** Visible assets for this map, with the in-edit session applied. */
export function useVisibleMapAssets(): AssetMapItem[] {
  const { mode } = useMapContext();
  const { submenuAssets } = useMapMenuContext();
  const assets = useMissionDocSelector((m) => Object.values(m.assets ?? {}), deepEqual);
  const folders: Folder[] =
    useMissionDocSelector((m) => Object.values(m.folders ?? {}), deepEqual) ?? EMPTY_DOC_LIST;
  const inEdit = useAppSelector((s) => (mode === "editor" ? s.asset.inEdit : null), refEqual);

  return useMemo(
    () =>
      getVisibleMapAssets({
        assets: assets ?? [],
        folders,
        inEdit,
        showAssets: submenuAssets.show,
      }),
    [assets, folders, inEdit, submenuAssets.show]
  );
}

export function AssetMarkers(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const dispatch = useAppDispatch();
  const { assetSource } = useFeatureSourcesContext();
  const { toMapCoord } = useCoordConverters();
  const showAssets = config.asset.show;

  const visibleAssets = useVisibleMapAssets();
  const selectedAssetUuid = useAppSelector(
    (s) => (mode === "editor" ? s.asset.selectedAssetUuid : null),
    refEqual
  );
  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);
  // Reference markers are non-interactive while any directive is active.
  const editActive = !!mapDirective;

  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);

  // --- Layer setup ---
  useEffect(() => {
    if (!showAssets) return;
    const layer = new VectorLayer({ source: assetSource, zIndex: Z_INDEX.ASSETS });
    map.addLayer(layer);
    layerRef.current = layer;
    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, assetSource, showAssets]);

  // --- Reconcile features ---
  useEffect(() => {
    // Skipped entirely when hidden: the source is shared across sibling maps, so a
    // minimap-side reconcile-to-empty would wipe the dashboard's features.
    if (!showAssets) return;
    const mapper = (asset: AssetMapItem): FeatureDescriptor => ({
      id: asset.uuid,
      geometry: new Point(toMapCoord(asset.location)),
      properties: {
        emoji: asset.icon,
        hasRadius: getAssetRadiusColor(asset) !== null,
        name: asset.name,
        mapItemType: "asset",
      },
    });
    reconcileFeatures(assetSource, visibleAssets, mapper);
    // Force repaint so property changes (e.g. icon) are picked up by style functions
    assetSource.changed();
  }, [visibleAssets, assetSource, toMapCoord, showAssets]);

  // --- Style function ---
  useEffect(() => {
    if (!showAssets) return;
    layerRef.current?.setStyle(buildAssetStyleFunction(selectedAssetUuid, config.asset.iconSize));
  }, [selectedAssetUuid, config.asset.iconSize, showAssets]);

  // --- Click handler ---
  useEffect(() => {
    if (!config.asset.clickable || editActive) return;

    const handleClick = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === layerRef.current,
      });
      if (!hit) return;
      evt.stopPropagation();
      dispatch(thunkMarkerOnClick({ markerUuid: hit.getId() as string, mapItemType: "asset" }));
    };

    map.on("click", handleClick);
    return () => map.un("click", handleClick);
  }, [map, config.asset.clickable, editActive, dispatch]);

  // --- Hover handler ---
  useEffect(() => {
    if (!config.asset.hoverable || editActive) return;

    let isHovering = false;
    const handlePointerMove = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === layerRef.current,
        hitTolerance: 8,
      });
      const el = map.getTargetElement();
      if (hit) {
        dispatch(setHoverAssetUuid(hit.getId() as string));
        if (el) el.style.cursor = "pointer";
        isHovering = true;
      } else if (isHovering) {
        dispatch(setHoverAssetUuid(null));
        if (el) el.style.cursor = "";
        isHovering = false;
      }
    };

    map.on("pointermove", handlePointerMove);
    return () => {
      map.un("pointermove", handlePointerMove);
      if (isHovering) dispatch(setHoverAssetUuid(null));
      const el = map.getTargetElement();
      if (el) el.style.cursor = "";
    };
  }, [map, config.asset.hoverable, editActive, dispatch]);

  return null;
}
