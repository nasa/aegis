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
  // --- State ---
  const [submenuStations, setSubmenuStations] = useState<MapSubmenuStations>(
    DEFAULT_SETTINGS.submenuStations
  );
  const [submenuPois, setSubmenuPois] = useState<MapSubmenuMarkers>(DEFAULT_SETTINGS.submenuPois);
  const [submenuActions, setSubmenuActions] = useState<MapSubmenuMarkers>(
    DEFAULT_SETTINGS.submenuActions
  );
  const [submenuPos, setSubmenuPos] = useState<MapSubmenuPos>(DEFAULT_SETTINGS.submenuPos);
  const [showArrows, setShowArrows] = useState(DEFAULT_SETTINGS.showArrows);
  const [showBearings, setShowBearings] = useState(DEFAULT_SETTINGS.showBearings);
  const [showDistances, setShowDistances] = useState(DEFAULT_SETTINGS.showDistances);
  const [showScaleBar, setShowScaleBar] = useState(DEFAULT_SETTINGS.showScaleBar);
  const [showMouseLatLon, setShowMouseLatLon] = useState(DEFAULT_SETTINGS.showMouseLatLon);
  const [showSunEarth, setShowSunEarth] = useState(DEFAULT_SETTINGS.showSunEarth);
  const [gridSpacingMode, setGridSpacingMode] = useState<GridSpacingMode>(
    DEFAULT_SETTINGS.gridSpacingMode
  );
  const [gridLabelInterval, setGridLabelInterval] = useState<GridSpacingMode>(
    DEFAULT_SETTINGS.gridLabelInterval
  );

  // --- Cookie persistence ---
  const [cookie, setCookie] = useCookies(["AEGIS_Map_Menu_Settings"]);

  // Load from cookie on mount
  useEffect(() => {
    const saved: MapMenuCookie | undefined = cookie["AEGIS_Map_Menu_Settings"];
    if (!saved) return;
    if (saved.submenuPois) setSubmenuPois(saved.submenuPois);
    if (saved.submenuStations) setSubmenuStations(saved.submenuStations);
    if (saved.submenuActions) setSubmenuActions(saved.submenuActions);
    if (saved.submenuPos) setSubmenuPos(saved.submenuPos);
    if (saved.showArrows !== undefined) setShowArrows(saved.showArrows);
    if (saved.showBearings !== undefined) setShowBearings(saved.showBearings);
    if (saved.showDistances !== undefined) setShowDistances(saved.showDistances);
    setShowScaleBar(saved.showScaleBar ?? true);
    setShowMouseLatLon(saved.showMouseLatLon ?? true);
    setShowSunEarth(saved.showSunEarth ?? false);
    if (saved.gridSpacingMode !== undefined) setGridSpacingMode(saved.gridSpacingMode);
    if (saved.gridLabelInterval !== undefined) setGridLabelInterval(saved.gridLabelInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    }),
    // State setters from useState are stable references — no deps needed

    []
  );

  return (
    <MapMenuContext.Provider value={settings}>
      <MapMenuSettersContext.Provider value={setters}>{children}</MapMenuSettersContext.Provider>
    </MapMenuContext.Provider>
  );
}
