import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faCaretRight, faCaretDown, faXmark } from "@fortawesome/free-solid-svg-icons";
import type { Dispatch, FunctionComponent, SetStateAction } from "react";
import { useEffect, useState } from "react";
import styles from "./map-menu.module.css";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getGridBaseSpacingMeters } from "utils/mapping/grid";
import { useResolvedMissionGrid } from "../hooks/useResolvedMissionGrid";
import { useMissionDockview } from "components/interface/dockview/MissionDockviewContext";
import { useMapMenuContext, useMapMenuSetters } from "../MapMenuProvider";

const GRID_SPACING_OPTIONS: { label: string; value: GridSpacingMode }[] = [
  { label: "Auto", value: "auto" },
  { label: "10m", value: 10 },
  { label: "100m", value: 100 },
  { label: "1km", value: 1000 },
];

export function getCompatibleGridLabelInterval(
  gridSpacingMode: GridSpacingMode,
  gridLabelInterval: GridSpacingMode
): GridSpacingMode {
  if (gridSpacingMode === "auto") return "auto";
  if (
    typeof gridSpacingMode === "number" &&
    typeof gridLabelInterval === "number" &&
    gridLabelInterval < gridSpacingMode
  ) {
    return gridSpacingMode;
  }
  return gridLabelInterval;
}

export const MapMenuPosSourceSync: FunctionComponent = () => {
  const { setSubmenuPos } = useMapMenuSetters();
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const selectedRexPosSources = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return undefined;
    const selectedRex = mission.rexes[selectedRexUuid];
    const runningRex = Object.values(mission.rexes).find((rex) => rex.isRunning);
    return selectedRex?.posSources || runningRex?.posSources;
  }, deepEqual);

  useEffect(() => {
    if (!selectedRexPosSources) return;
    const taskPosSourceUuid = selectedRexPosSources.find((source) => source.abbr === "T")?.uuid;
    const crewPosSourceUuid = selectedRexPosSources.find((source) => source.abbr === "C")?.uuid;
    setSubmenuPos((current) => ({
      ...current,
      sourceUuids: [taskPosSourceUuid, crewPosSourceUuid].filter((uuid) => uuid !== undefined),
    }));
  }, [selectedRexPosSources, setSubmenuPos]);

  return null;
};

interface MapMenuProps {
  mapDisplayPois: MapSubmenuMarkers;
  setMapDisplayPois: Dispatch<SetStateAction<MapSubmenuMarkers>>;
  mapDisplayStations: MapSubmenuStations;
  setMapDisplayStations: Dispatch<SetStateAction<MapSubmenuStations>>;
  mapDisplayActions: MapSubmenuMarkers;
  setMapDisplayActions: Dispatch<SetStateAction<MapSubmenuMarkers>>;
  showArrows: boolean;
  setShowArrows: Dispatch<SetStateAction<boolean>>;
  showBearings: boolean;
  setShowBearings: Dispatch<SetStateAction<boolean>>;
  showDistances: boolean;
  setShowDistances: Dispatch<SetStateAction<boolean>>;
  mapDisplayPos: MapSubmenuPos;
  setMapDisplayPos: Dispatch<SetStateAction<MapSubmenuPos>>;
  showScaleBar: boolean;
  setShowScaleBar: Dispatch<SetStateAction<boolean>>;
  showMouseLatLon: boolean;
  setShowMouseLatLon: Dispatch<SetStateAction<boolean>>;
  showSunEarth: boolean;
  setShowSunEarth: Dispatch<SetStateAction<boolean>>;
  gridSpacingMode: GridSpacingMode;
  setGridSpacingMode: Dispatch<SetStateAction<GridSpacingMode>>;
  gridLabelInterval: GridSpacingMode;
  setGridLabelInterval: Dispatch<SetStateAction<GridSpacingMode>>;
  floating?: boolean;
  onClose?: () => void;
}

export const MapMenu: FunctionComponent<MapMenuProps> = ({
  mapDisplayPois,
  setMapDisplayPois,
  mapDisplayStations,
  setMapDisplayStations,
  mapDisplayActions,
  setMapDisplayActions,
  showArrows,
  setShowArrows,
  showBearings,
  setShowBearings,
  showDistances,
  setShowDistances,
  mapDisplayPos,
  setMapDisplayPos,
  showScaleBar,
  setShowScaleBar,
  showMouseLatLon,
  setShowMouseLatLon,
  showSunEarth,
  setShowSunEarth,
  gridSpacingMode,
  setGridSpacingMode,
  gridLabelInterval,
  setGridLabelInterval,
  floating = false,
  onClose,
}) => {
  const [showMenu, setShowMenu] = useState(floating);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((p) => p.uuid === selectedPresetUuid),
    deepEqual
  );
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const selectedRexPosSources = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return undefined;
    const selectedRex = mission.rexes[selectedRexUuid];
    const runningRex = Object.values(mission.rexes).find((r) => r.isRunning);
    return selectedRex?.posSources || runningRex?.posSources;
  }, deepEqual);
  const earthMoonName = selectedPreset?.earthAsMoon ? "Moon" : "Earth";
  const sunEarthEnabled: boolean = selectedPreset?.sunEnabled || selectedPreset?.earthEnabled;

  // Base grid spacing (metres) drives which fixed-spacing options are selectable.
  // Derived from the loaded grid geometry so it always matches what's drawn.
  const planetRadius = useMissionDocSelector((m) => m.planetRadius, refEqual);
  const resolvedGrid = useResolvedMissionGrid();
  let baseGridSpacing = 0;
  if (resolvedGrid.kind === "dynamic-lgrs") {
    baseGridSpacing = 10;
  } else if (resolvedGrid.kind === "server-file") {
    baseGridSpacing = getGridBaseSpacingMeters(resolvedGrid.grid, planetRadius);
  }

  return (
    <div className={styles.menuContainer}>
      <div
        className={`${styles.menuHeader} ${showMenu && styles.menuHeaderBorder}`}
        onClick={(e) => {
          if (floating) return;
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
            <div
              className={styles.menuHeaderClose}
              onClick={(event) => {
                if (!floating) return;
                event.stopPropagation();
                onClose?.();
              }}
            >
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
              <div
                className={`${styles.toggleSingle} ${styles.center} ${
                  mapDisplayStations.showCircles && styles.toggleSelected
                }`}
                onClick={() => {
                  setMapDisplayStations({
                    ...mapDisplayStations,
                    showCircles: !mapDisplayStations.showCircles,
                    show: !mapDisplayStations.show ? true : mapDisplayStations.show,
                  });
                }}
              >
                Circles
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
              selected={mapDisplayPos.show}
              setSelected={() => {
                setMapDisplayPos({
                  ...mapDisplayPos,
                  show: !mapDisplayPos.show,
                });
              }}
              collapsible={true}
            >
              <div className={`${styles.toggleMenuItemRow} ${styles.menuItemTitle}`}>
                Sources
                <div
                  className={`${styles.toggleLeft} ${styles.center} ${
                    mapDisplayPos.sourceUuids?.length === 0 && styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPos({
                      ...mapDisplayPos,
                      sourceUuids: [],
                    });
                  }}
                >
                  All
                </div>
                {selectedRexPosSources?.map((posSource, index) => {
                  let toggleStyle = styles.toggleMiddle;
                  if (index === selectedRexPosSources.length - 1) {
                    toggleStyle = styles.toggleRight;
                  }
                  return (
                    <div
                      key={posSource.uuid}
                      className={`${toggleStyle} ${styles.center} ${
                        mapDisplayPos.sourceUuids.includes(posSource.uuid) && styles.toggleSelected
                      }`}
                      onClick={() => {
                        if (mapDisplayPos.sourceUuids.includes(posSource.uuid)) {
                          setMapDisplayPos({
                            ...mapDisplayPos,
                            sourceUuids: mapDisplayPos.sourceUuids.filter(
                              (s) => s !== posSource.uuid
                            ),
                          });
                        } else {
                          setMapDisplayPos({
                            ...mapDisplayPos,
                            sourceUuids: [...mapDisplayPos.sourceUuids, posSource.uuid],
                          });
                        }
                      }}
                      data-tooltip-id="aegis-tooltip"
                      data-tooltip-content={posSource.name}
                    >
                      {posSource.abbr}
                    </div>
                  );
                })}
              </div>
              <div className={`${styles.toggleMenuItemRow} ${styles.menuItemTitle}`}>
                Markers
                <div
                  className={`${styles.toggleLeft} ${styles.center} ${
                    mapDisplayPos.showOldMarkers &&
                    !mapDisplayPos.fadeOldMarkers &&
                    mapDisplayPos.showMarkers &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPos({
                      ...mapDisplayPos,
                      showOldMarkers: true,
                      fadeOldMarkers: false,
                      showMarkers: true,
                      show: !mapDisplayPos.show ? true : mapDisplayPos.show,
                    });
                  }}
                >
                  All
                </div>
                <div
                  className={`${styles.toggleMiddle} ${styles.center} ${
                    !mapDisplayPos.showOldMarkers &&
                    !mapDisplayPos.fadeOldMarkers &&
                    mapDisplayPos.showMarkers &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPos({
                      ...mapDisplayPos,
                      showOldMarkers: false,
                      fadeOldMarkers: false,
                      showMarkers: true,
                      show: !mapDisplayPos.show ? true : mapDisplayPos.show,
                    });
                  }}
                >
                  Latest
                </div>
                <div
                  className={`${styles.toggleMiddle} ${styles.center} ${
                    mapDisplayPos.showOldMarkers &&
                    mapDisplayPos.fadeOldMarkers &&
                    mapDisplayPos.showMarkers &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPos({
                      ...mapDisplayPos,
                      showOldMarkers: true,
                      fadeOldMarkers: true,
                      showMarkers: true,
                      show: !mapDisplayPos.show ? true : mapDisplayPos.show,
                    });
                  }}
                >
                  Fade Past
                </div>
                <div
                  className={`${styles.toggleRight} ${styles.center} ${
                    !mapDisplayPos.showOldMarkers &&
                    !mapDisplayPos.fadeOldMarkers &&
                    !mapDisplayPos.showMarkers &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPos({
                      ...mapDisplayPos,
                      showOldMarkers: false,
                      fadeOldMarkers: false,
                      showMarkers: false,
                      show: !mapDisplayPos.show ? true : mapDisplayPos.show,
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
                    mapDisplayPos.showAllLabels &&
                    !mapDisplayPos.showLatestLabels &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPos({
                      ...mapDisplayPos,
                      showAllLabels: true,
                      showLatestLabels: false,
                      show: !mapDisplayPos.show ? true : mapDisplayPos.show,
                    });
                  }}
                >
                  All
                </div>
                <div
                  className={`${styles.toggleMiddle} ${styles.center} ${
                    !mapDisplayPos.showAllLabels &&
                    mapDisplayPos.showLatestLabels &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPos({
                      ...mapDisplayPos,
                      showAllLabels: false,
                      showLatestLabels: true,
                      show: !mapDisplayPos.show ? true : mapDisplayPos.show,
                    });
                  }}
                >
                  Latest
                </div>
                <div
                  className={`${styles.toggleRight} ${styles.center} ${
                    !mapDisplayPos.showAllLabels &&
                    !mapDisplayPos.showLatestLabels &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPos({
                      ...mapDisplayPos,
                      showAllLabels: false,
                      showLatestLabels: false,
                      show: !mapDisplayPos.show ? true : mapDisplayPos.show,
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
                    mapDisplayPos.showOldPaths &&
                    !mapDisplayPos.fadeOldPaths &&
                    mapDisplayPos.showPaths &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPos({
                      ...mapDisplayPos,
                      showOldPaths: true,
                      fadeOldPaths: false,
                      showPaths: true,
                      show: !mapDisplayPos.show ? true : mapDisplayPos.show,
                    });
                  }}
                >
                  All
                </div>
                <div
                  className={`${styles.toggleMiddle} ${styles.center} ${
                    !mapDisplayPos.showOldPaths &&
                    !mapDisplayPos.fadeOldPaths &&
                    mapDisplayPos.showPaths &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPos({
                      ...mapDisplayPos,
                      showOldPaths: false,
                      fadeOldPaths: false,
                      showPaths: true,
                      show: !mapDisplayPos.show ? true : mapDisplayPos.show,
                    });
                  }}
                >
                  Latest
                </div>
                <div
                  className={`${styles.toggleMiddle} ${styles.center} ${
                    mapDisplayPos.showOldPaths &&
                    mapDisplayPos.fadeOldPaths &&
                    mapDisplayPos.showPaths &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPos({
                      ...mapDisplayPos,
                      showOldPaths: true,
                      fadeOldPaths: true,
                      showPaths: true,
                      show: !mapDisplayPos.show ? true : mapDisplayPos.show,
                    });
                  }}
                >
                  Fade Past
                </div>
                <div
                  className={`${styles.toggleRight} ${styles.center} ${
                    !mapDisplayPos.showOldPaths &&
                    !mapDisplayPos.fadeOldPaths &&
                    !mapDisplayPos.showPaths &&
                    styles.toggleSelected
                  }`}
                  onClick={() => {
                    setMapDisplayPos({
                      ...mapDisplayPos,
                      showOldPaths: false,
                      fadeOldPaths: false,
                      showPaths: false,
                      show: !mapDisplayPos.show ? true : mapDisplayPos.show,
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
                className={`${styles.toggleMiddle} ${styles.center} ${
                  showBearings && styles.toggleSelected
                }`}
                onClick={() => {
                  setShowBearings(!showBearings);
                }}
              >
                Bearings
              </div>
              <div
                className={`${styles.toggleRight} ${styles.center} ${
                  showDistances && styles.toggleSelected
                }`}
                onClick={() => {
                  setShowDistances(!showDistances);
                }}
              >
                Distances
              </div>
            </div>
            <div className={`${styles.toggleMenuItemRow} ${styles.menuItemTitle}`}>
              Grid
              {GRID_SPACING_OPTIONS.map((opt, idx) => {
                const disabled =
                  opt.value !== "auto" && baseGridSpacing > 0 && opt.value < baseGridSpacing;
                const selected = gridSpacingMode === opt.value;
                const positionClass =
                  idx === 0
                    ? styles.toggleLeft
                    : idx === GRID_SPACING_OPTIONS.length - 1
                      ? styles.toggleRight
                      : styles.toggleMiddle;
                return (
                  <div
                    key={String(opt.value)}
                    className={`${positionClass} ${styles.center} ${
                      selected ? styles.toggleSelected : ""
                    }`}
                    style={disabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                    data-tooltip-id={disabled ? "aegis-tooltip" : undefined}
                    data-tooltip-content={
                      disabled ? `Grid resolution is ${Math.round(baseGridSpacing)} m` : undefined
                    }
                    onClick={() => {
                      if (!disabled) {
                        setGridSpacingMode(opt.value);
                        setGridLabelInterval(
                          getCompatibleGridLabelInterval(opt.value, gridLabelInterval)
                        );
                      }
                    }}
                  >
                    {opt.label}
                  </div>
                );
              })}
            </div>
            <div className={`${styles.toggleMenuItemRow} ${styles.menuItemTitle}`}>
              Grid Labels
              {GRID_SPACING_OPTIONS.map((opt, idx) => {
                // The label interval only applies when the grid spacing is fixed,
                // and can't be finer than the grid lines or the grid resolution.
                const disabled =
                  gridSpacingMode === "auto" ||
                  (opt.value !== "auto" &&
                    ((baseGridSpacing > 0 && opt.value < baseGridSpacing) ||
                      (typeof gridSpacingMode === "number" && opt.value < gridSpacingMode)));
                const selected = gridLabelInterval === opt.value;
                const positionClass =
                  idx === 0
                    ? styles.toggleLeft
                    : idx === GRID_SPACING_OPTIONS.length - 1
                      ? styles.toggleRight
                      : styles.toggleMiddle;
                return (
                  <div
                    key={String(opt.value)}
                    className={`${positionClass} ${styles.center} ${
                      selected ? styles.toggleSelected : ""
                    }`}
                    style={disabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                    data-tooltip-id={gridSpacingMode === "auto" ? "aegis-tooltip" : undefined}
                    data-tooltip-content={
                      gridSpacingMode === "auto" ? "Set a fixed grid spacing first" : undefined
                    }
                    onClick={() => {
                      if (!disabled) setGridLabelInterval(opt.value);
                    }}
                  >
                    {opt.label}
                  </div>
                );
              })}
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

export const MapMenuLauncher: FunctionComponent = () => {
  const { openMapMenu } = useMissionDockview();

  return (
    <button
      className={styles.menuLauncher}
      onClick={(event) => {
        event.stopPropagation();
        openMapMenu();
      }}
      aria-label="Open map item visibility"
      data-testid="map-menu-launcher"
      type="button"
    >
      <FontAwesomeIcon icon={faEye} size="sm" />
      <div className={styles.bottomTriangle} />
    </button>
  );
};

export const MapMenuPanel: FunctionComponent = () => {
  const display = useMapMenuContext();
  const setters = useMapMenuSetters();
  const { closeMapMenu } = useMissionDockview();

  return (
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
      gridSpacingMode={display.gridSpacingMode}
      setGridSpacingMode={setters.setGridSpacingMode}
      gridLabelInterval={display.gridLabelInterval}
      setGridLabelInterval={setters.setGridLabelInterval}
      floating={true}
      onClose={closeMapMenu}
    />
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
