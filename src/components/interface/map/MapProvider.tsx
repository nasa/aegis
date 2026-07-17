/**
 * MapProvider — OL Map Context + initialization
 *
 * Creates a single `ol/Map` instance, binds it to a DOM container via ref,
 * sets up the projection/view from mission config, and provides the Map
 * instance + mode to descendant behavior components via React Context.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Map from "ol/Map";
import View from "ol/View";
import { Zoom } from "ol/control";
import { register } from "ol/proj/proj4";
import { get as getProjection } from "ol/proj";
import proj4 from "proj4";

import { buildLegacyResolutions } from "./utils/parsers/leafletShim";
import { useMissionDocSelector } from "utils/useDocSelector";
import { deepEqual } from "utils/useAppSelector";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface MapContextValue {
  /** The OpenLayers Map instance */
  map: Map;
  /** Which map variant this is */
  mode: MapMode;
}

/**
 * Exported so tests can wrap children in a stub MapContext.Provider with a
 * hand-rolled `Map` instance — avoids needing the full Automerge mission doc
 * setup that the real MapProvider requires.
 */
export const MapContext = createContext<MapContextValue | null>(null);

/** Access the OL Map instance and current mode. Must be called inside `<MapProvider>`. */
export function useMapContext(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useMap() must be used within <MapProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface MapProviderProps {
  /** Container ref — the div the OL Map will render into */
  containerRef: RefObject<HTMLDivElement | null>;
  mode: MapMode;
  children: ReactNode;
}

/**
 * Initializes an OL Map from mission config (projection, extent, resolutions,
 * center, zoom) and provides it to children via Context.
 */
export function MapProvider({
  containerRef,
  mode,
  children,
}: MapProviderProps): JSX.Element | null {
  const [mapInstance, setMapInstance] = useState<Map | null>(null);

  // Pull only the projection-related fields from the mission doc
  const projConfigRaw = useMissionDocSelector(
    (doc) => ({
      id: doc.id,
      projIsCustom: doc.projIsCustom,
      projEpsg: doc.projEpsg,
      projProj4String: doc.projProj4String,
      projResUnitsPerPixel: doc.projResUnitsPerPixel,
      projResZoomLevel: doc.projResZoomLevel,
      projOriginX: doc.projOriginX,
      projOriginY: doc.projOriginY,
      projBoundsMinX: doc.projBoundsMinX,
      projBoundsMinY: doc.projBoundsMinY,
      projBoundsMaxX: doc.projBoundsMaxX,
      projBoundsMaxY: doc.projBoundsMaxY,
      landerLocation: doc.landerLocation,
      initialZoom: doc.initialZoom,
    }),
    deepEqual
  );

  // Ref that holds the live map + resize observer. The map is created once
  // (when projConfig is first available) and only disposed on unmount.
  const mapRef = useRef<Map | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  // --- One-shot initialization effect ------------------------------------
  // Deps include projConfigRaw so the effect re-runs when it arrives, BUT
  // the mapRef guard ensures we only create the map once.  There is
  // intentionally NO cleanup here — the map must survive re-renders and
  // dependency changes.  Disposal happens in the separate unmount effect.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current || !projConfigRaw) return;
    const projConfig = projConfigRaw;

    // --- Projection setup -------------------------------------------------
    let projCode = "EPSG:3857";
    let extent: [number, number, number, number] | undefined;
    let resolutions: number[] | undefined;

    if (projConfig.projIsCustom && projConfig.projProj4String && projConfig.projEpsg) {
      projCode =
        projConfig.projEpsg === "EPSG:3857"
          ? `AEGIS:${projConfig.id ?? "custom"}`
          : projConfig.projEpsg;

      proj4.defs(projCode, projConfig.projProj4String);
      register(proj4);

      const projection = getProjection(projCode);

      if (
        projConfig.projBoundsMinX != null &&
        projConfig.projBoundsMinY != null &&
        projConfig.projBoundsMaxX != null &&
        projConfig.projBoundsMaxY != null
      ) {
        extent = [
          projConfig.projBoundsMinX,
          projConfig.projBoundsMinY,
          projConfig.projBoundsMaxX,
          projConfig.projBoundsMaxY,
        ];
        projection?.setExtent(extent);
      }

      if (projConfig.projResUnitsPerPixel != null) {
        const zoomLevel = projConfig.projResZoomLevel ?? 0;
        resolutions = buildLegacyResolutions(projConfig.projResUnitsPerPixel, zoomLevel, 32);
      }
    }

    // --- Centre on lander -------------------------------------------------
    let center: [number, number] = [0, 0];
    if (projConfig.landerLocation?.lat != null && projConfig.landerLocation?.lng != null) {
      center = proj4("EPSG:4326", projCode, [
        projConfig.landerLocation.lng,
        projConfig.landerLocation.lat,
      ]) as [number, number];
    }

    // --- View -------------------------------------------------------------
    const view = new View({
      projection: projCode,
      center,
      zoom: projConfig.initialZoom ?? 2,
      resolutions,
      extent,
      constrainResolution: false,
      smoothResolutionConstraint: true,
    });

    // --- Map --------------------------------------------------------------
    // Only editor mode shows zoom controls — mirrors `showZoomControls` in
    // modeConfig.ts (not imported here to avoid a circular dep with useMap).
    const controls = mode === "editor" ? [new Zoom()] : [];
    const map = new Map({
      target: el,
      layers: [],
      view,
      controls,
    });

    mapRef.current = map;
    setMapInstance(map);

    const ro = new ResizeObserver(() => map.updateSize());
    ro.observe(el);
    roRef.current = ro;
  }, [containerRef, projConfigRaw, mode]);

  // --- Cleanup on unmount only ---
  useEffect(() => {
    return () => {
      roRef.current?.disconnect();
      mapRef.current?.setTarget(undefined);
      mapRef.current?.dispose();
      mapRef.current = null;
      roRef.current = null;
    };
  }, []);

  if (!mapInstance) return null;

  return <MapContext.Provider value={{ map: mapInstance, mode }}>{children}</MapContext.Provider>;
}
