import { faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Dispatch, FunctionComponent, SetStateAction, useState } from "react";
import styles from "./map-menu-view.module.css";
import { Checkbox } from "../form/globalFields";

export const MapViewMenu: FunctionComponent<{
  mapDisplayPois: MapMarkersDisplay;
  setMapDisplayPois: Dispatch<SetStateAction<MapMarkersDisplay>>;
  mapDisplayStations: MapMarkersDisplay;
  setMapDisplayStations: Dispatch<SetStateAction<MapMarkersDisplay>>;
  mapDisplayActions: MapMarkersDisplay;
  setMapDisplayActions: Dispatch<SetStateAction<MapMarkersDisplay>>;
  showArrows: boolean;
  setShowArrows: Dispatch<SetStateAction<boolean>>;
  mapDisplayPosMarkers: MapPosDisplay;
  setMapDisplayPosMarkers: Dispatch<SetStateAction<MapPosDisplay>>;
  showGridLabels: boolean;
  setShowGridLabels: Dispatch<SetStateAction<boolean>>;
}> = ({
  mapDisplayPois,
  setMapDisplayPois,
  mapDisplayStations,
  setMapDisplayStations,
  mapDisplayActions,
  setMapDisplayActions,
  showArrows,
  setShowArrows,
  mapDisplayPosMarkers,
  setMapDisplayPosMarkers,
  showGridLabels,
  setShowGridLabels,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className={styles.menuContainer}>
      <div
        className={styles.menuIcon}
        onClick={(e) => {
          setShowMenu(!showMenu);
          e.stopPropagation();
        }}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html="Map View Settings"
      >
        <FontAwesomeIcon
          icon={faEye}
          size="sm"
          style={{ marginTop: "3px", width: "15px", color: "var(--grey5)", outline: "none" }}
          tabIndex={0}
        />
        <div className={styles.bottomTriangle} />
      </div>

      <div className={`${styles.menu} ${!showMenu && styles.hideMenu}`}>
        <div className={styles.mapDisplay}>
          <div className={styles.controlsContainer}>
            <div className={styles.controlContainer}>
              <div className={styles.control}>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayPois.show}
                    onChange={(e) => {
                      setMapDisplayPois({
                        ...mapDisplayPois,
                        show: e.target.checked,
                      });
                    }}
                    toolTip="Toggle POIs on map"
                    label="POIs"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHidePoi"
                  />
                </div>
              </div>
              <div className={styles.subControl}>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayPois.showLabels}
                    onChange={(e) => {
                      setMapDisplayPois({
                        ...mapDisplayPois,
                        showLabels: e.target.checked,
                        ...(e.target.checked && { show: true }),
                      });
                    }}
                    toolTip="Toggle POI labels on map"
                    label="Labels"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHidePoiLabels"
                  />
                </div>
              </div>
            </div>
            <div className={styles.controlContainer}>
              <div className={styles.control}>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayStations.show}
                    onChange={(e) => {
                      setMapDisplayStations({
                        ...mapDisplayStations,
                        show: e.target.checked,
                      });
                    }}
                    toolTip="Toggle all Stations on map"
                    label="Stations"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHideStations"
                  />
                </div>
              </div>
              <div className={styles.subControl}>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayStations.showLabels}
                    onChange={(e) => {
                      setMapDisplayStations({
                        ...mapDisplayStations,
                        showLabels: e.target.checked,
                        ...(e.target.checked && { show: true }),
                      });
                    }}
                    toolTip="Toggle Station labels on map"
                    label="Labels"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHideStationLabels"
                  />
                </div>
              </div>
            </div>
            <div className={styles.controlContainer}>
              <div className={styles.control}>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayActions.show}
                    onChange={(e) => {
                      setMapDisplayActions({
                        ...mapDisplayActions,
                        show: e.target.checked,
                      });
                    }}
                    toolTip="Toggle Actions on map"
                    label="Actions"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHideActions"
                  />
                </div>
              </div>
              <div className={styles.subControl}>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayActions.showLabels}
                    onChange={(e) => {
                      setMapDisplayActions({
                        ...mapDisplayActions,
                        showLabels: e.target.checked,
                        ...(e.target.checked && { show: true }),
                      });
                    }}
                    toolTip="Toggle Actions labels on map"
                    label="Labels"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHideActionLabels"
                  />
                </div>
              </div>
            </div>
            <div className={styles.controlContainer}>
              <div className={styles.control}>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayPosMarkers.show}
                    onChange={(e) => {
                      setMapDisplayPosMarkers({
                        ...mapDisplayPosMarkers,
                        show: e.target.checked,
                      });
                    }}
                    toolTip="Toggle position markers on map"
                    label="Position Markers"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHidePos"
                  />
                </div>
              </div>
              <div className={styles.subControl}>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayPosMarkers.showAllLabels}
                    onChange={(e) => {
                      setMapDisplayPosMarkers({
                        ...mapDisplayPosMarkers,
                        showAllLabels: e.target.checked,
                        ...(e.target.checked && { show: true }),
                      });
                    }}
                    toolTip="Toggle position marker timers on map for position markers"
                    label="All Labels"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHidePosAllLabels"
                  />
                </div>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayPosMarkers.showLatestLabels}
                    onChange={(e) => {
                      setMapDisplayPosMarkers({
                        ...mapDisplayPosMarkers,
                        showLatestLabels: e.target.checked,
                        ...(e.target.checked && { show: true }),
                      });
                    }}
                    toolTip="Toggle position marker labels on map for latest position markers"
                    label="Latest Labels"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHidePosLatestLabels"
                  />
                </div>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayPosMarkers.showPaths}
                    onChange={(e) => {
                      setMapDisplayPosMarkers({
                        ...mapDisplayPosMarkers,
                        showPaths: e.target.checked,
                        ...(e.target.checked && { show: true }),
                      });
                    }}
                    toolTip="Toggle position markers on map"
                    label="Pos Marker Paths"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHidePosPaths"
                  />
                </div>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayPosMarkers.fadeOldPositions}
                    onChange={(e) => {
                      setMapDisplayPosMarkers({
                        ...mapDisplayPosMarkers,
                        fadeOldPositions: e.target.checked,
                        ...(e.target.checked && { show: true }),
                      });
                    }}
                    toolTip="Toggle fading old crew positions on map"
                    label="Fade Old Pos"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="fadeOldPositions"
                  />
                </div>
              </div>
            </div>
            <div className={styles.controlContainer}>
              <div className={styles.subControl}>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={showArrows}
                    onChange={(e) => {
                      setShowArrows(e.target.checked);
                    }}
                    toolTip="Toggle arrows on traverses"
                    label="Traverse Arrows"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHideArrows"
                  />
                </div>
              </div>
            </div>
            <div className={styles.controlContainer}>
              <div className={styles.subControl}>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={showGridLabels}
                    onChange={(e) => {
                      setShowGridLabels(e.target.checked);
                    }}
                    toolTip="Toggle labels on grid layers"
                    label="Grid Labels"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHideGridLabels"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
