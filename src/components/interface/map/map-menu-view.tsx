import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faCaretRight, faCaretDown, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Dispatch, FunctionComponent, SetStateAction, useState } from "react";
import styles from "./map-menu-view.module.css";

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
            <MenuItem
              title="POIs"
              selected={mapDisplayPois.show}
              setSelected={() => {
                setMapDisplayPois({
                  ...mapDisplayPois,
                  show: !mapDisplayPois.show,
                  showLabels: mapDisplayPois.show ? false : mapDisplayPois.showLabels,
                });
              }}
              collapsible={true}
            >
              <MenuItem
                title="Labels"
                selected={mapDisplayPois.showLabels}
                setSelected={() => {
                  setMapDisplayPois({
                    ...mapDisplayPois,
                    showLabels: !mapDisplayPois.showLabels,
                    show: !mapDisplayPois.show ? true : mapDisplayPois.show,
                  });
                }}
                collapsible={false}
              />
            </MenuItem>
            <MenuItem
              title="Stations"
              selected={mapDisplayStations.show}
              setSelected={() => {
                setMapDisplayStations({
                  ...mapDisplayStations,
                  show: !mapDisplayStations.show,
                  showLabels: mapDisplayStations.show ? false : mapDisplayStations.showLabels,
                });
              }}
              collapsible={true}
            >
              <MenuItem
                title="Labels"
                selected={mapDisplayStations.showLabels}
                setSelected={() => {
                  setMapDisplayStations({
                    ...mapDisplayStations,
                    showLabels: !mapDisplayStations.showLabels,
                    show: !mapDisplayStations.show ? true : mapDisplayStations.show,
                  });
                }}
                collapsible={false}
              />
            </MenuItem>
            <MenuItem
              title="Actions"
              selected={mapDisplayActions.show}
              setSelected={() => {
                setMapDisplayActions({
                  ...mapDisplayActions,
                  show: !mapDisplayActions.show,
                  showLabels: mapDisplayActions.show ? false : mapDisplayActions.showLabels,
                });
              }}
              collapsible={true}
            >
              <MenuItem
                title="Labels"
                selected={mapDisplayActions.showLabels}
                setSelected={() => {
                  setMapDisplayActions({
                    ...mapDisplayActions,
                    showLabels: !mapDisplayActions.showLabels,
                    show: !mapDisplayActions.show ? true : mapDisplayActions.show,
                  });
                }}
                collapsible={false}
              />
            </MenuItem>
            <MenuItem
              title="Position Markers"
              selected={mapDisplayPosMarkers.show}
              setSelected={() => {
                setMapDisplayPosMarkers({
                  ...mapDisplayPosMarkers,
                  show: !mapDisplayPosMarkers.show,
                });
              }}
              collapsible={true}
            >
              <MenuItem
                title="All Labels"
                selected={mapDisplayPosMarkers.showAllLabels}
                setSelected={() => {
                  setMapDisplayPosMarkers({
                    ...mapDisplayPosMarkers,
                    showAllLabels: !mapDisplayPosMarkers.showAllLabels,
                    show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                  });
                }}
                collapsible={false}
              />
              <MenuItem
                title="Latest Labels"
                selected={mapDisplayPosMarkers.showLatestLabels}
                setSelected={() => {
                  setMapDisplayPosMarkers({
                    ...mapDisplayPosMarkers,
                    showLatestLabels: !mapDisplayPosMarkers.showLatestLabels,
                    show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                  });
                }}
                collapsible={false}
              />
              <MenuItem
                title="Position Marker Paths"
                selected={mapDisplayPosMarkers.showPaths}
                setSelected={() => {
                  setMapDisplayPosMarkers({
                    ...mapDisplayPosMarkers,
                    showPaths: !mapDisplayPosMarkers.showPaths,
                    show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                  });
                }}
                collapsible={false}
              />
              <MenuItem
                title="Fade Old Marker Positions"
                selected={mapDisplayPosMarkers.fadeOldPositions}
                setSelected={() => {
                  setMapDisplayPosMarkers({
                    ...mapDisplayPosMarkers,
                    fadeOldPositions: !mapDisplayPosMarkers.fadeOldPositions,
                    show: !mapDisplayPosMarkers.show ? true : mapDisplayPosMarkers.show,
                  });
                }}
                collapsible={false}
              />
            </MenuItem>

            <MenuItem
              title="Traverse Arrows"
              selected={showArrows}
              setSelected={() => {
                setShowArrows(!showArrows);
              }}
              collapsible={false}
            />

            <MenuItem
              title="Grid Labels"
              selected={showGridLabels}
              setSelected={() => {
                setShowGridLabels(!showGridLabels);
              }}
              collapsible={false}
            />
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
