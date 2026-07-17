/**
 * MapOverlays — visible React UI components positioned on top of the OL map.
 *
 * Composes: MapMenu (eyeball), ScaleBar, MouseCoordinateDisplay, SunEarth.
 *
 * This component renders as a React subtree positioned absolutely over the
 * map canvas. It does NOT use ol/Overlay (which is for map-coordinate-anchored
 * DOM elements). These overlays are viewport-relative UI.
 */

import { useEffect, useState } from "react";

import { ScaleBar } from "./ScaleBar";
import { MouseCoordinateDisplay } from "./MouseCoordinateDisplay";
import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useMapMenuContext, useMapMenuSetters } from "../MapMenuProvider";
import { MapMenu } from "components/interface/map/overlays/map-menu";
import MapPresetMenu from "components/interface/map/overlays/map-menu-preset";
import { MapPositionMenu } from "components/interface/map/overlays/map-menu-pos";
import { MapFollowMenu } from "components/interface/map/overlays/map-follow-menu";
import { SunEarth } from "components/interface/map/overlays/map-sunearth";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { setSelectedPresetUuid } from "store/preset";

import mapStyles from "./mapOverlays.module.css";

export function MapOverlays(): JSX.Element {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];

  // On the dashboard, the menu overlays only appear while the pointer is over
  // the map — they hide when the mouse leaves the map area (matches int).
  const [mapHovered, setMapHovered] = useState(false);
  useEffect(() => {
    if (mode !== "dashboard") return;
    const el = map.getTargetElement();
    if (!el) return;
    const onEnter = () => setMapHovered(true);
    const onLeave = () => setMapHovered(false);
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [map, mode]);

  const menusHidden = mode === "dashboard" && !mapHovered;
  const display = useMapMenuContext();
  const setters = useMapMenuSetters();
  const dispatch = useAppDispatch();

  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((p) => p.uuid === state.preset.selectedPresetUuid),
    deepEqual
  );

  const presetsFromDb = useAppSelector((state) => state.preset.presets, deepEqual);

  const sectionSelected = useAppSelector((state) => state.interface.sectionSelectedLabel, refEqual);
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const selectedRex = useMissionDocSelector((m) => {
    return selectedRexUuid ? (m.rexes?.[selectedRexUuid] ?? null) : null;
  }, deepEqual);

  return (
    <>
      {/* Eyeball menu — top left */}
      <div className={`${mapStyles.mapViewDisplay} ${menusHidden ? mapStyles.hide : ""}`}>
        <MapMenu
          mapDisplayPois={display.submenuPois}
          setMapDisplayPois={setters.setSubmenuPois}
          mapDisplayStations={display.submenuStations}
          setMapDisplayStations={setters.setSubmenuStations}
          mapDisplayActions={display.submenuActions}
          setMapDisplayActions={setters.setSubmenuActions}
          showArrows={display.showArrows}
          setShowArrows={setters.setShowArrows}
          showBearings={display.showBearings}
          setShowBearings={setters.setShowBearings}
          showDistances={display.showDistances}
          setShowDistances={setters.setShowDistances}
          mapDisplayPos={display.submenuPos}
          setMapDisplayPos={setters.setSubmenuPos}
          showScaleBar={display.showScaleBar}
          setShowScaleBar={setters.setShowScaleBar}
          showMouseLatLon={display.showMouseLatLon}
          setShowMouseLatLon={setters.setShowMouseLatLon}
          showSunEarth={display.showSunEarth}
          setShowSunEarth={setters.setShowSunEarth}
        />
      </div>

      {/* Preset selector — top left, right of eyeball */}
      <div className={`${mapStyles.mapPresetDisplay} ${menusHidden ? mapStyles.hide : ""}`}>
        <MapPresetMenu
          selectedPreset={selectedPreset}
          setSelectedPreset={(preset: Preset) => {
            dispatch(setSelectedPresetUuid(preset.uuid));
          }}
          presetsFromDb={presetsFromDb}
        />
      </div>

      {/* Follow menu — top left, below eyeball/preset (dashboard only) */}
      {config.mode === "dashboard" && (
        <div className={`${mapStyles.mapFollowDisplay} ${menusHidden ? mapStyles.hide : ""}`}>
          <MapFollowMenu />
        </div>
      )}

      {/* Scale bar — bottom left */}
      {display.showScaleBar && (
        <div className={mapStyles.mapScaleDisplay}>
          <ScaleBar />
        </div>
      )}

      {/* Mouse coordinates — bottom right (editor only) */}
      {config.map.showMouseCoords && display.showMouseLatLon && (
        <div className={mapStyles.mapPositionDisplay}>
          <MouseCoordinateDisplay />
        </div>
      )}

      {/* Sun/Earth azimuth indicator */}
      {display.showSunEarth && (
        <SunEarth
          type={config.mode === "dashboard" ? "dashboard" : "editor"}
          selectedPreset={selectedPreset}
        />
      )}

      {/* POS menu — top right (editor only, when EVAs section active and a REX is selected) */}
      {config.mode === "editor" && sectionSelected === "evas" && selectedRex && <MapPositionMenu />}
    </>
  );
}
