/**
 * MapMenuProvider — context for map menu "eyeball menu" settings.
 *
 * Owns local state for all eyeball-menu toggles, persisted to
 * `AEGIS_Map_Menu_Settings` cookie. Provides both current values AND setters
 * so that `MapMenu` (the eyeball menu) and behavior components can read
 * and update display settings without prop drilling.
 *
 * Usage:
 *   MapMenuProvider > AegisMap > StationMarkers (reads via useMapMenu())
 *                                > MapOverlays (renders MapMenu via useMapMenuSetters())
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useCookies } from "react-cookie";

export interface MapMenuSettings {
  submenuStations: MapSubmenuStations;
  submenuPois: MapSubmenuMarkers;
  submenuActions: MapSubmenuMarkers;
  submenuPos: MapSubmenuPos;
  showArrows: boolean;
  showBearings: boolean;
  showDistances: boolean;
  showScaleBar: boolean;
  showMouseLatLon: boolean;
  showSunEarth: boolean;
  gridSpacingMode: GridSpacingMode;
  gridLabelInterval: GridSpacingMode;
}

export interface MapMenuSetters {
  setSubmenuStations: Dispatch<SetStateAction<MapSubmenuStations>>;
  setSubmenuPois: Dispatch<SetStateAction<MapSubmenuMarkers>>;
  setSubmenuActions: Dispatch<SetStateAction<MapSubmenuMarkers>>;
  setSubmenuPos: Dispatch<SetStateAction<MapSubmenuPos>>;
  setShowArrows: Dispatch<SetStateAction<boolean>>;
  setShowBearings: Dispatch<SetStateAction<boolean>>;
  setShowDistances: Dispatch<SetStateAction<boolean>>;
  setShowScaleBar: Dispatch<SetStateAction<boolean>>;
  setShowMouseLatLon: Dispatch<SetStateAction<boolean>>;
  setShowSunEarth: Dispatch<SetStateAction<boolean>>;
  setGridSpacingMode: Dispatch<SetStateAction<GridSpacingMode>>;
  setGridLabelInterval: Dispatch<SetStateAction<GridSpacingMode>>;
  /** Applies the default position-source selection once, only when no cookie existed on load. */
  applyDefaultSourceUuids: (sourceUuids: string[]) => void;
}

const DEFAULT_SETTINGS: MapMenuSettings = {
  submenuStations: { show: true, showLabels: false, showWalkbacks: true, showCircles: true },
  submenuPois: { show: true, showLabels: false },
  submenuActions: { show: true, showLabels: false },
  submenuPos: {
    show: true,
    showAllLabels: false,
    showLatestLabels: true,
    showPaths: true,
    showOldPaths: true,
    fadeOldPaths: true,
    showMarkers: true,
    showOldMarkers: true,
    fadeOldMarkers: true,
    sourceUuids: [],
    pathMode: "merged",
  },
  showArrows: true,
  showBearings: true,
  showDistances: true,
  showScaleBar: true,
  showMouseLatLon: true,
  showSunEarth: false,
  gridSpacingMode: "auto",
  gridLabelInterval: "auto",
};

const GRID_SPACING_MODES: GridSpacingMode[] = ["auto", 10, 100, 1000];

/**
 * Fill every setting missing from the saved cookie (including fields inside the
 * submenu objects) with its default. Returns all defaults when there is no cookie.
 */
function mergeCookieWithDefaults(saved: Partial<MapMenuCookie> | undefined): MapMenuSettings {
  const merged = { ...DEFAULT_SETTINGS };
  if (!saved || typeof saved !== "object") return merged;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof MapMenuSettings)[]) {
    const savedValue = saved[key];
    if (savedValue === undefined || savedValue === null) continue;
    const defaultValue = DEFAULT_SETTINGS[key];
    if (typeof defaultValue === "object" && typeof savedValue === "object") {
      const mergedSubmenu: Record<string, unknown> = { ...defaultValue };
      for (const [field, value] of Object.entries(savedValue)) {
        if (field in defaultValue && value !== undefined && value !== null) {
          mergedSubmenu[field] = value;
        }
      }
      (merged as Record<string, unknown>)[key] = mergedSubmenu;
    } else if (key === "gridSpacingMode" || key === "gridLabelInterval") {
      if (GRID_SPACING_MODES.includes(savedValue as GridSpacingMode)) {
        merged[key] = savedValue as GridSpacingMode;
      }
    } else if (typeof savedValue === typeof defaultValue) {
      (merged as Record<string, unknown>)[key] = savedValue;
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

const MapMenuContext = createContext<MapMenuSettings | null>(null);
const MapMenuSettersContext = createContext<MapMenuSetters | null>(null);

export function useMapMenuContext(): MapMenuSettings {
  const ctx = useContext(MapMenuContext);
  if (!ctx) throw new Error("useMapMenu must be used inside <MapMenuProvider>");
  return ctx;
}

export function useMapMenuSetters(): MapMenuSetters {
  const ctx = useContext(MapMenuSettersContext);
  if (!ctx) throw new Error("useMapMenuSetters must be used inside <MapMenuProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface MapMenuProviderProps {
  children: ReactNode;
}

export function MapMenuProvider({ children }: MapMenuProviderProps): JSX.Element {
  // --- Cookie persistence ---
  const [cookie, setCookie] = useCookies(["AEGIS_Map_Menu_Settings"]);

  // Read the cookie once, during the first render, so every setting starts from the saved
  // value (or its default when missing). The persist effect below then writes the complete
  // settings back, creating the cookie or filling in any missing values.
  const [savedCookie] = useState<Partial<MapMenuCookie> | undefined>(
    () => cookie["AEGIS_Map_Menu_Settings"]
  );
  const [initialSettings] = useState(() => mergeCookieWithDefaults(savedCookie));

  // --- State ---
  const [submenuStations, setSubmenuStations] = useState<MapSubmenuStations>(
    initialSettings.submenuStations
  );
  const [submenuPois, setSubmenuPois] = useState<MapSubmenuMarkers>(initialSettings.submenuPois);
  const [submenuActions, setSubmenuActions] = useState<MapSubmenuMarkers>(
    initialSettings.submenuActions
  );
  const [submenuPos, setSubmenuPos] = useState<MapSubmenuPos>(initialSettings.submenuPos);
  const [showArrows, setShowArrows] = useState(initialSettings.showArrows);
  const [showBearings, setShowBearings] = useState(initialSettings.showBearings);
  const [showDistances, setShowDistances] = useState(initialSettings.showDistances);
  const [showScaleBar, setShowScaleBar] = useState(initialSettings.showScaleBar);
  const [showMouseLatLon, setShowMouseLatLon] = useState(initialSettings.showMouseLatLon);
  const [showSunEarth, setShowSunEarth] = useState(initialSettings.showSunEarth);
  const [gridSpacingMode, setGridSpacingMode] = useState<GridSpacingMode>(
    initialSettings.gridSpacingMode
  );
  const [gridLabelInterval, setGridLabelInterval] = useState<GridSpacingMode>(
    initialSettings.gridLabelInterval
  );

  // The default source selection depends on the REX's source uuids, so it can't be part of
  // DEFAULT_SETTINGS. It is applied once, only when the cookie had no saved selection.
  const sourceUuidsSettledRef = useRef(Array.isArray(savedCookie?.submenuPos?.sourceUuids));
  const applyDefaultSourceUuids = useCallback((sourceUuids: string[]) => {
    if (sourceUuidsSettledRef.current) return;
    sourceUuidsSettledRef.current = true;
    setSubmenuPos((current) => ({ ...current, sourceUuids }));
  }, []);

  // Persist to cookie on change
  useEffect(() => {
    setCookie(
      "AEGIS_Map_Menu_Settings",
      JSON.stringify({
        submenuPois,
        submenuStations,
        submenuActions,
        submenuPos,
        showArrows,
        showBearings,
        showDistances,
        showSunEarth,
        showScaleBar,
        showMouseLatLon,
        gridSpacingMode,
        gridLabelInterval,
      } satisfies MapMenuCookie),
      // maxAge (1 year, in seconds) makes this a persistent cookie — without an
      // expiry it defaults to a session cookie and is dropped when the browser closes.
      { path: "/", maxAge: 60 * 60 * 24 * 365 }
    );
  }, [
    setCookie,
    submenuPois,
    submenuStations,
    submenuActions,
    submenuPos,
    showArrows,
    showBearings,
    showDistances,
    showSunEarth,
    showScaleBar,
    showMouseLatLon,
    gridSpacingMode,
    gridLabelInterval,
  ]);

  // --- Context values ---
  const settings: MapMenuSettings = useMemo(
    () => ({
      submenuStations,
      submenuPois,
      submenuActions,
      submenuPos,
      showArrows,
      showBearings,
      showDistances,
      showScaleBar,
      showMouseLatLon,
      showSunEarth,
      gridSpacingMode,
      gridLabelInterval,
    }),
    [
      submenuStations,
      submenuPois,
      submenuActions,
      submenuPos,
      showArrows,
      showBearings,
      showDistances,
      showScaleBar,
      showMouseLatLon,
      showSunEarth,
      gridSpacingMode,
      gridLabelInterval,
    ]
  );

  const setters: MapMenuSetters = useMemo(
    () => ({
      setSubmenuStations,
      setSubmenuPois,
      setSubmenuActions,
      setSubmenuPos,
      setShowArrows,
      setShowBearings,
      setShowDistances,
      setShowScaleBar,
      setShowMouseLatLon,
      setShowSunEarth,
      setGridSpacingMode,
      setGridLabelInterval,
      applyDefaultSourceUuids,
    }),
    // State setters from useState and the empty-deps callback are stable references
    [applyDefaultSourceUuids]
  );

  return (
    <MapMenuContext.Provider value={settings}>
      <MapMenuSettersContext.Provider value={setters}>{children}</MapMenuSettersContext.Provider>
    </MapMenuContext.Provider>
  );
}
