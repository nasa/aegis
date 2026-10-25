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

function projectionConfigIsUsable(
  config:
    | {
        projIsCustom?: boolean;
        projProj4String?: string | null;
      }
    | null
    | undefined,
  landerLocation: AEGISPoint | null | undefined
): boolean {
  if (!config?.projIsCustom) return true;
  if (!config.projProj4String) return false;

  try {
    const projection = new proj4.Proj(config.projProj4String);
    if (Number.isFinite(landerLocation?.lat) && Number.isFinite(landerLocation?.lng)) {
      const point = proj4("EPSG:4326", projection, [
        landerLocation.lng as number,
        landerLocation.lat as number,
      ]);
      return point.every(Number.isFinite);
    }
    return true;
  } catch {
    return false;
  }
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
  const projConfigRaw = useMissionDocSelector((doc) => {
    const hasCustomProjection = Boolean(doc.projIsCustom && doc.projProj4String && doc.projEpsg);
    return {
      id: doc.id,
      projIsCustom: hasCustomProjection,
      projEpsg: hasCustomProjection ? doc.projEpsg : undefined,
      projProj4String: hasCustomProjection ? doc.projProj4String : undefined,
      projResUnitsPerPixel: hasCustomProjection ? doc.projResUnitsPerPixel : undefined,
      projResZoomLevel: hasCustomProjection ? doc.projResZoomLevel : undefined,
      projOriginX: hasCustomProjection ? doc.projOriginX : undefined,
      projOriginY: hasCustomProjection ? doc.projOriginY : undefined,
      projBoundsMinX: hasCustomProjection ? doc.projBoundsMinX : undefined,
      projBoundsMinY: hasCustomProjection ? doc.projBoundsMinY : undefined,
      projBoundsMaxX: hasCustomProjection ? doc.projBoundsMaxX : undefined,
      projBoundsMaxY: hasCustomProjection ? doc.projBoundsMaxY : undefined,
    };
  }, deepEqual);
  const initialViewConfig = useMissionDocSelector(
    (doc) => ({ landerLocation: doc.landerLocation, initialZoom: doc.initialZoom }),
    deepEqual
  );
  const initialViewConfigRef = useRef(initialViewConfig);
  const [acceptedProjectionConfig, setAcceptedProjectionConfig] = useState(() => {
    if (
      projectionConfigIsUsable(projConfigRaw, initialViewConfig?.landerLocation) ||
      !projConfigRaw
    ) {
      return projConfigRaw;
    }
    return {
      ...projConfigRaw,
      projIsCustom: false,
      projEpsg: undefined,
      projProj4String: undefined,
      projResUnitsPerPixel: undefined,
      projResZoomLevel: undefined,
      projOriginX: undefined,
      projOriginY: undefined,
      projBoundsMinX: undefined,
      projBoundsMinY: undefined,
      projBoundsMaxX: undefined,
      projBoundsMaxY: undefined,
    };
  });

  useEffect(() => {
    initialViewConfigRef.current = initialViewConfig;
  }, [initialViewConfig]);

  useEffect(() => {
    if (!projectionConfigIsUsable(projConfigRaw, initialViewConfig?.landerLocation)) return;
    setAcceptedProjectionConfig((current) =>
      deepEqual(current, projConfigRaw) ? current : projConfigRaw
    );
  }, [initialViewConfig?.landerLocation, projConfigRaw]);

  // The map's projection and view are fixed at construction, so rebuild it
  // when mission projection settings change instead of retaining stale state.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !acceptedProjectionConfig) return;
    const projConfig = acceptedProjectionConfig;

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
    const viewConfig = initialViewConfigRef.current;
    let center: [number, number] = [0, 0];
    if (viewConfig?.landerLocation?.lat != null && viewConfig.landerLocation?.lng != null) {
      center = proj4("EPSG:4326", projCode, [
        viewConfig.landerLocation.lng,
        viewConfig.landerLocation.lat,
      ]) as [number, number];
    }

    // --- View -------------------------------------------------------------
    const view = new View({
      projection: projCode,
      center,
      zoom: viewConfig?.initialZoom ?? 2,
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

    setMapInstance(map);

    if (import.meta.env.DEV) {
      el.dispatchEvent(
        new CustomEvent("aegis:map-ready", { detail: { map, mode }, bubbles: true })
      );
    }

    const ro = new ResizeObserver(() => map.updateSize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.setTarget(undefined);
      map.dispose();
    };
  }, [acceptedProjectionConfig, containerRef, mode]);

  if (!mapInstance) return null;

  return <MapContext.Provider value={{ map: mapInstance, mode }}>{children}</MapContext.Provider>;
}
