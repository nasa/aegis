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
  mapDisplayCrewPos: MapCrewPosDisplay;
  setMapDisplayCrewPos: Dispatch<SetStateAction<MapCrewPosDisplay>>;
}> = ({
  mapDisplayPois,
  setMapDisplayPois,
  mapDisplayStations,
  setMapDisplayStations,
  mapDisplayActions,
  setMapDisplayActions,
  showArrows,
  setShowArrows,
  mapDisplayCrewPos,
  setMapDisplayCrewPos,
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
                    toolTip="Toggle Stations on map"
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
                        showLabels: false,
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
                    checked={mapDisplayCrewPos.show}
                    onChange={(e) => {
                      setMapDisplayCrewPos({
                        ...mapDisplayCrewPos,
                        show: e.target.checked,
                      });
                    }}
                    toolTip="Toggle crew positions on map"
                    label="Crew Pos"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHideCrewPos"
                  />
                </div>
              </div>
              <div className={styles.subControl}>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayCrewPos.showAllLabels}
                    onChange={(e) => {
                      setMapDisplayCrewPos({
                        ...mapDisplayCrewPos,
                        showAllLabels: e.target.checked,
                        ...(e.target.checked && { show: true }),
                      });
                    }}
                    toolTip="Toggle crew position timers on map for all crew positions"
                    label="All Labels"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHideCrewPosAllLabels"
                  />
                </div>
                <div className={styles.controlCheckbox}>
                  <Checkbox
                    checked={mapDisplayCrewPos.showLatestLabels}
                    onChange={(e) => {
                      setMapDisplayCrewPos({
                        ...mapDisplayCrewPos,
                        showLatestLabels: e.target.checked,
                        ...(e.target.checked && { show: true }),
                      });
                    }}
                    toolTip="Toggle crew position labels on map for latest crew positions"
                    label="Latest Labels"
                    labelStyle={{ alignSelf: "center" }}
                    uniqueId="showHideCrewPosLatestLabels"
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
          </div>
        </div>
      </div>
    </div>
  );
};
