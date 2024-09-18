import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faCaretRight, faCaretDown, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Dispatch, FunctionComponent, SetStateAction, useState } from "react";
import styles from "./map-menu-view.module.css";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";

export const MapViewMenu: FunctionComponent<{
  mapDisplayPois: MapDisplayMarkers;
  setMapDisplayPois: Dispatch<SetStateAction<MapDisplayMarkers>>;
  mapDisplayStations: MapDisplayStations;
  setMapDisplayStations: Dispatch<SetStateAction<MapDisplayStations>>;
  mapDisplayActions: MapDisplayMarkers;
  setMapDisplayActions: Dispatch<SetStateAction<MapDisplayMarkers>>;
  showArrows: boolean;
  setShowArrows: Dispatch<SetStateAction<boolean>>;
  mapDisplayPosMarkers: MapDisplayPos;
  setMapDisplayPosMarkers: Dispatch<SetStateAction<MapDisplayPos>>;
  showGridLabels: boolean;
  setShowGridLabels: Dispatch<SetStateAction<boolean>>;
  showScaleBar: boolean;
  setShowScaleBar: Dispatch<SetStateAction<boolean>>;
  showMouseLatLon: boolean;
  setShowMouseLatLon: Dispatch<SetStateAction<boolean>>;
  showSunEarth: boolean;
  setShowSunEarth: Dispatch<SetStateAction<boolean>>;
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
  showScaleBar,
  setShowScaleBar,
  showMouseLatLon,
  setShowMouseLatLon,
  showSunEarth,
  setShowSunEarth,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((p) => p.uuid === selectedPresetUuid),
    deepEqual
  );
  const earthMoonName = selectedPreset?.earthAsMoon ? "Moon" : "Earth";
  const sunEarthEnabled: boolean = selectedPreset?.sunEnabled || selectedPreset?.earthEnabled;

  return (
    <div className={styles.menuContainer}>
      <div
        className={`${styles.menuHeader} ${showMenu && styles.menuHeaderBorder}`}
        onClick={(e) => {
          setShowMenu(!showMenu);
          e.stopPropagation();
        }}
      >
        <div className={styles.menuHeaderEyeIcon}>
          <FontAwesomeIcon icon={faEye} size="sm" />
        </div>
        {showMenu && (
          <div className={styles.menuHeaderTitleContainer}>
            <div className={styles.menuHeaderTitle}>Map Item Visibility</div>
            <div className={styles.menuHeaderClose}>
              <FontAwesomeIcon icon={faXmark} />
            </div>
          </div>
        )}
        {!showMenu && <div className={styles.bottomTriangle} />}
        {showMenu && <div className={styles.topTriangle} />}
      </div>
      <div className={`${styles.menu} ${!showMenu && styles.hideMenu}`}>
        <div className={styles.mapDisplay}>
          <div className={styles.controlsContainer}>
            <div className={styles.menuItemTitleContainer}>
              <div
                className={styles.menuEyeIcon}
                onClick={() => {
                  setMapDisplayPois({
                    ...mapDisplayPois,
                    show: !mapDisplayPois.show,
                    showLabels: mapDisplayPois.show ? false : mapDisplayPois.showLabels,
                  });
                }}
              >
                <FontAwesomeIcon
                  icon={faEye}
                  size="sm"
                  style={{
                    marginTop: "3px",
                    width: "15px",
                    color: mapDisplayPois.show ? "var(--grey5)" : "var(--grey3)",
                    outline: "none",
                  }}
                  tabIndex={0}
                />
              </div>
              <div className={styles.menuItemTitle}>POIs</div>
              <div
                className={`${styles.toggleSingle} ${styles.center} ${
                  mapDisplayPois.showLabels && styles.toggleSelected
                }`}
                onClick={() => {
                  setMapDisplayPois({
                    ...mapDisplayPois,
                    showLabels: !mapDisplayPois.showLabels,
                    show: !mapDisplayPois.show ? true : mapDisplayPois.show,
                  });
                }}
              >
                Labels
              </div>
            </div>
            <div className={styles.menuItemTitleContainer}>
              <div
                className={styles.menuEyeIcon}
                onClick={() => {
                  setMapDisplayStations({
                    ...mapDisplayStations,
                    show: !mapDisplayStations.show,
                    showLabels: mapDisplayStations.show ? false : mapDisplayStations.showLabels,
                  });
                }}
              >
                <FontAwesomeIcon
                  icon={faEye}
                  size="sm"
                  style={{
                    marginTop: "3px",
                    width: "15px",
                    color: mapDisplayStations.show ? "var(--grey5)" : "var(--grey3)",
                    outline: "none",
                  }}
                  tabIndex={0}
                />
              </div>
              <div className={styles.menuItemTitle}>Stations</div>
              <div
                className={`${styles.toggleSingle} ${styles.center} ${
                  mapDisplayStations.showLabels && styles.toggleSelected
                }`}
                onClick={() => {
                  setMapDisplayStations({
                    ...mapDisplayStations,
                    showLabels: !mapDisplayStations.showLabels,
                    show: !mapDisplayStations.show ? true : mapDisplayStations.show,
                  });
                }}
              >
                Labels
              </div>
              <div
                className={`${styles.toggleSingle} ${styles.center} ${
                  mapDisplayStations.showWalkbacks && styles.toggleSelected
                }`}
                onClick={() => {
                  setMapDisplayStations({
                    ...mapDisplayStations,
                    showWalkbacks: !mapDisplayStations.showWalkbacks,
                    show: !mapDisplayStations.show ? true : mapDisplayStations.show,
                  });
                }}
              >
                Walkbacks
              </div>
            </div>
            <div className={styles.menuItemTitleContainer}>
              <div
                className={styles.menuEyeIcon}
                onClick={() => {
                  setMapDisplayActions({
                    ...mapDisplayActions,
                    show: !mapDisplayActions.show,
                    showLabels: mapDisplayActions.show ? false : mapDisplayActions.showLabels,
                  });
                }}
              >
                <FontAwesomeIcon
                  icon={faEye}
                  size="sm"
                  style={{
                    marginTop: "3px",
                    width: "15px",
                    color: mapDisplayActions.show ? "var(--grey5)" : "var(--grey3)",
                    outline: "none",
                  }}
                  tabIndex={0}
                />
              </div>
              <div className={styles.menuItemTitle}>Actions</div>
              <div
                className={`${styles.toggleSingle} ${styles.center} ${
                  mapDisplayActions.showLabels && styles.toggleSelected
                }`}
                onClick={() => {
                  setMapDisplayActions({
                    ...mapDisplayActions,
                    showLabels: !mapDisplayActions.showLabels,
                    show: !mapDisplayActions.show ? true : mapDisplayActions.show,
                  });
                }}
              >
                Labels
              </div>
            </div>
            <MenuItem
              title="Positions"
              selected={mapDisplayPosMarkers.show}
              setSelected={() => {
                setMapDisplayPosMarkers({
                  ...mapDisplayPosMarkers,
                  show: !mapDisplayPosMarkers.show,
                });
              }}
              collapsible={true}
            >
              <div className={`${styles.toggleMenuItemRow} ${styles.menuItemTitle}`}>
                Markers
                <div
                  className={`${styles.toggleLeft} ${styles.center} ${
                    mapDisplayPosMarkers.showOldMarkers &&
                    !mapDisplayPosMarkers.fadeOldMarkers &&
                    mapDisplayPosMarkers.showMarkers &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPosMarkers({
                      ...mapDisplayPosMarkers,
                      showOldMarkers: true,
                      fadeOldMarkers: false,
                      showMarkers: true,
                      show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                    });
                  }}
                >
                  All
                </div>
                <div
                  className={`${styles.toggleMiddle} ${styles.center} ${
                    !mapDisplayPosMarkers.showOldMarkers &&
                    !mapDisplayPosMarkers.fadeOldMarkers &&
                    mapDisplayPosMarkers.showMarkers &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPosMarkers({
                      ...mapDisplayPosMarkers,
                      showOldMarkers: false,
                      fadeOldMarkers: false,
                      showMarkers: true,
                      show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                    });
                  }}
                >
                  Latest
                </div>
                <div
                  className={`${styles.toggleMiddle} ${styles.center} ${
                    mapDisplayPosMarkers.showOldMarkers &&
                    mapDisplayPosMarkers.fadeOldMarkers &&
                    mapDisplayPosMarkers.showMarkers &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPosMarkers({
                      ...mapDisplayPosMarkers,
                      showOldMarkers: true,
                      fadeOldMarkers: true,
                      showMarkers: true,
                      show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                    });
                  }}
                >
                  Fade Past
                </div>
                <div
                  className={`${styles.toggleRight} ${styles.center} ${
                    !mapDisplayPosMarkers.showOldMarkers &&
                    !mapDisplayPosMarkers.fadeOldMarkers &&
                    !mapDisplayPosMarkers.showMarkers &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPosMarkers({
                      ...mapDisplayPosMarkers,
                      showOldMarkers: false,
                      fadeOldMarkers: false,
                      showMarkers: false,
                      show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                    });
                  }}
                >
                  None
                </div>
              </div>
              <div
                className={`${styles.toggleMenuItemRow} ${styles.menuItemTitle} ${styles.menuItemContent}`}
              >
                Labels
                <div
                  className={`${styles.toggleLeft} ${styles.center} ${
                    mapDisplayPosMarkers.showAllLabels &&
                    !mapDisplayPosMarkers.showLatestLabels &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPosMarkers({
                      ...mapDisplayPosMarkers,
                      showAllLabels: true,
                      showLatestLabels: false,
                      show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                    });
                  }}
                >
                  All
                </div>
                <div
                  className={`${styles.toggleMiddle} ${styles.center} ${
                    !mapDisplayPosMarkers.showAllLabels &&
                    mapDisplayPosMarkers.showLatestLabels &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPosMarkers({
                      ...mapDisplayPosMarkers,
                      showAllLabels: false,
                      showLatestLabels: true,
                      show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                    });
                  }}
                >
                  Latest
                </div>
                <div
                  className={`${styles.toggleRight} ${styles.center} ${
                    !mapDisplayPosMarkers.showAllLabels &&
                    !mapDisplayPosMarkers.showLatestLabels &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPosMarkers({
                      ...mapDisplayPosMarkers,
                      showAllLabels: false,
                      showLatestLabels: false,
                      show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                    });
                  }}
                >
                  None
                </div>
              </div>
              <div className={`${styles.toggleMenuItemRow} ${styles.menuItemTitle}`}>
                Paths
                <div
                  className={`${styles.toggleLeft} ${styles.center} ${
                    mapDisplayPosMarkers.showOldPaths &&
                    !mapDisplayPosMarkers.fadeOldPaths &&
                    mapDisplayPosMarkers.showPaths &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPosMarkers({
                      ...mapDisplayPosMarkers,
                      showOldPaths: true,
                      fadeOldPaths: false,
                      showPaths: true,
                      show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                    });
                  }}
                >
                  All
                </div>
                <div
                  className={`${styles.toggleMiddle} ${styles.center} ${
                    !mapDisplayPosMarkers.showOldPaths &&
                    !mapDisplayPosMarkers.fadeOldPaths &&
                    mapDisplayPosMarkers.showPaths &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPosMarkers({
                      ...mapDisplayPosMarkers,
                      showOldPaths: false,
                      fadeOldPaths: false,
                      showPaths: true,
                      show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                    });
                  }}
                >
                  Latest
                </div>
                <div
                  className={`${styles.toggleMiddle} ${styles.center} ${
                    mapDisplayPosMarkers.showOldPaths &&
                    mapDisplayPosMarkers.fadeOldPaths &&
                    mapDisplayPosMarkers.showPaths &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPosMarkers({
                      ...mapDisplayPosMarkers,
                      showOldPaths: true,
                      fadeOldPaths: true,
                      showPaths: true,
                      show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                    });
                  }}
                >
                  Fade Past
                </div>
                <div
                  className={`${styles.toggleRight} ${styles.center} ${
                    !mapDisplayPosMarkers.showOldPaths &&
                    !mapDisplayPosMarkers.fadeOldPaths &&
                    !mapDisplayPosMarkers.showPaths &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPosMarkers({
                      ...mapDisplayPosMarkers,
                      showOldPaths: false,
                      fadeOldPaths: false,
                      showPaths: false,
                      show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                    });
                  }}
                >
                  None
                </div>
              </div>
            </MenuItem>
            <div className={`${styles.toggleMenuItemRow} ${styles.menuItemTitle}`}>
              Traverse
              <div
                className={`${styles.toggleLeft} ${styles.center} ${
                  showArrows && styles.toggleSelected
                }`}
                onClick={() => {
                  setShowArrows(!showArrows);
                }}
              >
                Arrows
              </div>
              <div
                className={`${styles.toggleRight} ${styles.center} ${
                  !showArrows && styles.toggleSelected
                }`}
                onClick={() => {
                  setShowArrows(!showArrows);
                }}
              >
                Animated
              </div>
            </div>
            <div className={`${styles.toggleMenuItemRow} ${styles.menuItemTitle}`}>
              Grid
              <div
                className={`${styles.toggleSingle} ${styles.center} ${
                  showGridLabels && styles.toggleSelected
                }`}
                onClick={() => {
                  setShowGridLabels(!showGridLabels);
                }}
              >
                Labels
              </div>
            </div>
            <MenuItem
              title="Scale Bar"
              selected={showScaleBar}
              setSelected={() => {
                setShowScaleBar(!showScaleBar);
              }}
              collapsible={false}
            />
            <MenuItem
              title="Mouse Lat/Lon"
              selected={showMouseLatLon}
              setSelected={() => {
                setShowMouseLatLon(!showMouseLatLon);
              }}
              collapsible={false}
            />
            {sunEarthEnabled && (
              <MenuItem
                title={`Sun/${earthMoonName} Directions`}
                selected={showSunEarth}
                setSelected={() => {
                  setShowSunEarth(!showSunEarth);
                }}
                collapsible={false}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MenuItem: FunctionComponent<{
  title: string;
  selected: boolean;
  setSelected: Function;
  children?: JSX.Element | JSX.Element[];
  collapsible: boolean;
}> = ({ title, selected, setSelected, children, collapsible = false }) => {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div className={styles.menuItem}>
        {collapsible && (
          <div
            className={styles.menuItemIcon}
            onClick={() => {
              setOpen(!open);
            }}
          >
            <FontAwesomeIcon
              icon={open ? faCaretDown : faCaretRight}
              size="sm"
              style={{ marginTop: "3px", width: "15px", color: "var(--grey5)", outline: "none" }}
              tabIndex={0}
            />
          </div>
        )}
        <div
          className={styles.menuItemTitleContainer}
          onClick={() => {
            setSelected();
          }}
        >
          <div className={styles.menuEyeIcon}>
            <FontAwesomeIcon
              icon={faEye}
              size="sm"
              style={{
                marginTop: "3px",
                width: "15px",
                color: selected ? "var(--grey5)" : "var(--grey3)",
                outline: "none",
              }}
              tabIndex={0}
            />
          </div>
          <div className={styles.menuItemTitle}>{title}</div>
        </div>
      </div>
      <div
        className={`${styles.menuItemContent} ${!open && styles.hideContent}`}
        style={{ paddingBottom: children ? "5px" : "0px" }}
      >
        {children}
      </div>
    </div>
  );
};
