import isNil from "lodash/isNil";
import styles from "./side-controls.module.css";
import type { FunctionComponent } from "react";
import { useEffect } from "react";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  setBottomPanelIsOpen,
  setBottomSectionSelected,
  setLeftPanelIsOpen,
  setAutoRightPanelOpen,
  setRightPanelIsOpen,
  setSectionSelected,
  setAutoBottomPanelOpen,
} from "store/interface";

import { getPaneTypes } from "components/interface/_paneTypes";
import NavTimeline from "components/interface/timeline/timeline";
import { isModified } from "utils/component-helpers";
import paneStyles from "../panes/global-pane-styles.module.css";
import {
  faChartArea,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faRuler,
} from "@fortawesome/free-solid-svg-icons";
import Measure from "./measure/measure";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import FontFaceObserver from "fontfaceobserver";
import { setSelectedStationUuid } from "store/station";
import { selectAsPlannedStations } from "store/selectors";
import { useMissionDocSelector } from "utils/useDocSelector";

/* This control sits at the left side of the screen and loads the selected component based on the NavGutter icon selected */
export const LeftControlPanel: FunctionComponent = () => {
  const leftPanelOpen = useAppSelector((state) => state.interface.leftPanelIsOpen, refEqual);
  const interfaceStateLabel = useAppSelector(
    (state) => state.interface.sectionSelectedLabel,
    refEqual
  );

  const actionSystemVersion = useMissionDocSelector(
    (mission) => mission.actionSystemVersion,
    refEqual
  );

  const paneTypes = getPaneTypes(actionSystemVersion);

  let ActiveComponent = null;
  const paneType: PaneType = paneTypes[interfaceStateLabel as keyof PaneTypes];
  if (!isNil(paneType)) {
    ActiveComponent = paneType.leftPane;
  }

  return (
    <>
      {leftPanelOpen && (
        <div className={styles.activeComponent}>
          <ActiveComponent />
        </div>
      )}
    </>
  );
};

export const BottomControlPanel: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const bottomPanelOpen = useAppSelector((state) => state.interface.bottomPanelIsOpen, refEqual);
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedBottomNavItem = useAppSelector(
    (state) => state.interface.bottomSectionSelectedLabel,
    refEqual
  );
  const autoBottomPanelOpen = useAppSelector(
    (state) => state.interface.autoBottomPanelOpen,
    refEqual
  );

  (async () => {
    const font = new FontFaceObserver("Inter");
    await font.load();
  })();

  useEffect(() => {
    if (!autoBottomPanelOpen) return;
    if (selectedEvaUuid) {
      dispatch(setBottomPanelIsOpen(true));
    } else {
      dispatch(setBottomPanelIsOpen(false));
    }
  }, [selectedEvaUuid, dispatch, autoBottomPanelOpen]);

  return (
    <>
      {bottomPanelOpen && (
        <div className={styles.activeComponentBottom}>
          <BottomGutter />
          {selectedBottomNavItem === "timeline" ? <NavTimeline /> : <Measure />}
        </div>
      )}
    </>
  );
};

/* This control sits at the right side of the screen and displays the active pane for that position */
export const RightControlPanel: FunctionComponent = () => {
  const interfaceStateLabel = useAppSelector(
    (state) => state.interface.sectionSelectedLabel,
    refEqual
  );
  const rightPanelOpen = useAppSelector((state) => state.interface.rightPanelIsOpen, refEqual);

  // get the mission automerge document so we can get actionSystemVersion
  const actionSystemVersion = useMissionDocSelector(
    (mission) => mission.actionSystemVersion,
    refEqual
  );

  const paneTypes = getPaneTypes(actionSystemVersion);

  let ActiveComponent = null;
  const paneType: PaneType = paneTypes[interfaceStateLabel as keyof PaneTypes];
  if (!isNil(paneType)) {
    ActiveComponent = paneType.rightPane;
  }

  return (
    <>
      {rightPanelOpen && (
        <div className={styles.rightControl}>
          <div className={styles.activeComponentRight}>
            <ActiveComponent />
          </div>
        </div>
      )}
    </>
  );
};

export const LeftDrawerTab: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const leftPanelOpen = useAppSelector((state) => state.interface.leftPanelIsOpen, refEqual);

  return (
    <div className={styles.drawerLeft} onClick={() => dispatch(setLeftPanelIsOpen(!leftPanelOpen))}>
      <div className={styles.drawerLeftTab}>
        <FontAwesomeIcon
          className={styles.drawerLeftIcon}
          color="white"
          icon={leftPanelOpen ? faChevronLeft : faChevronRight}
        />
        <div className={styles.drawerLeftSvg}>
          <img src="/images/drawerNub.svg" alt="Open/Close Left Panel" />
        </div>
      </div>
    </div>
  );
};

export const BottomDrawerTab: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const bottomPanelOpen = useAppSelector((state) => state.interface.bottomPanelIsOpen, refEqual);

  return (
    <div
      className={styles.drawerBottom}
      onClick={() => {
        dispatch(setBottomPanelIsOpen(!bottomPanelOpen));
        dispatch(setAutoBottomPanelOpen(false));
      }}
    >
      <div className={styles.drawerBottomTab}>
        <FontAwesomeIcon
          className={styles.drawerBottomIcon}
          color="white"
          icon={bottomPanelOpen ? faChevronDown : faChevronUp}
        />
        <div className={styles.drawerBottomSvg}>
          <img src="/images/drawerNub.svg" alt="Open/Close Bottom Panel" />
        </div>
      </div>
    </div>
  );
};

export const RightDrawerTab: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const rightPanelOpen = useAppSelector((state) => state.interface.rightPanelIsOpen, refEqual);

  return (
    <div
      className={styles.drawerRight}
      onClick={() => {
        dispatch(setRightPanelIsOpen(!rightPanelOpen));
        dispatch(setAutoRightPanelOpen(false));
      }}
    >
      <div className={styles.drawerRightTab}>
        <FontAwesomeIcon
          className={styles.drawerRightIcon}
          color="white"
          icon={rightPanelOpen ? faChevronRight : faChevronLeft}
        />
        <div className={styles.drawerRightSvg}>
          <img src="/images/drawerNub.svg" alt="Open/Close Right Panel" />
        </div>
      </div>
    </div>
  );
};

const BottomGutter: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedBottomNavItem = useAppSelector(
    (state) => state.interface.bottomSectionSelectedLabel,
    refEqual
  );
  const bottomPanelOpen = useAppSelector((state) => state.interface.bottomPanelIsOpen, refEqual);
  let timelineIconContainerStyle = styles.iconContainer;
  let measureIconContainerStyle = styles.iconContainer;
  if (bottomPanelOpen) {
    timelineIconContainerStyle =
      selectedBottomNavItem === "timeline" ? styles.iconContainerSelected : styles.iconContainer;
    measureIconContainerStyle =
      selectedBottomNavItem === "measure" ? styles.iconContainerSelected : styles.iconContainer;
  }

  return (
    <div className={styles.bottomGutter}>
      <div className={timelineIconContainerStyle}>
        <div
          className={styles.icon}
          style={{ color: "var(--grey5)" }}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-content={"Timeline"}
          onClick={() => {
            if (!bottomPanelOpen) dispatch(setBottomPanelIsOpen(true));
            dispatch(setBottomSectionSelected("timeline"));
          }}
        >
          <FontAwesomeIcon icon={faChartArea} size="lg" />
        </div>
      </div>
      <div className={measureIconContainerStyle}>
        <div
          className={styles.icon}
          style={{ color: "var(--grey5)" }}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-content={"Measurements"}
          onClick={() => {
            if (!bottomPanelOpen) dispatch(setBottomPanelIsOpen(true));
            dispatch(setBottomSectionSelected("measure"));
          }}
        >
          <FontAwesomeIcon icon={faRuler} size="lg" />
        </div>
      </div>
    </div>
  );
};

export const NavGutter: FunctionComponent<{ selectedNavItem: InterfaceSection }> = ({
  selectedNavItem,
}) => {
  const dispatch = useAppDispatch();
  const bottomPanelOpen = useAppSelector((state) => state.interface.bottomPanelIsOpen, refEqual);
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const presets = useAppSelector(
    (state) =>
      state.preset.presets.map((p) => {
        return { uuid: p.uuid, updatedAt: p.updatedAt };
      }),
    deepEqual
  );
  const presetsFromDb = useAppSelector(
    (state) =>
      state.preset.presetsFromDb.map((p) => {
        return { uuid: p.uuid, updatedAt: p.updatedAt };
      }),
    deepEqual
  );
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const asPlannedStationUuids = useMissionDocSelector(
    (mission) => selectAsPlannedStations(mission).map((s) => s.uuid),
    deepEqual
  );
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const actionSystemVersion = useMissionDocSelector(
    (mission) => mission.actionSystemVersion,
    refEqual
  );

  const paneTypes = getPaneTypes(actionSystemVersion);

  const selectedPaneType: PaneType = paneTypes[selectedNavItem as keyof PaneTypes];

  return (
    <div className={styles.iconGutterContainer}>
      <div className={styles.iconGutter}>
        {/* Loop through all of the paneTypes and draw them on the gutter */}
        {Object.keys(paneTypes).map((interfaceSection: InterfaceSection) => {
          let itemModified = false;
          if (interfaceSection === "preset") {
            itemModified = isModified(presets, presetsFromDb);
          }

          const pane: PaneType = paneTypes[interfaceSection as keyof PaneTypes];
          return (
            <div
              key={interfaceSection}
              className={
                selectedNavItem === interfaceSection
                  ? styles.iconContainerSelected
                  : styles.iconContainer
              }
              aria-label={`${interfaceSection} Section`}
            >
              <div
                className={styles.icon}
                style={{ color: pane.color }}
                data-tooltip-id="aegis-tooltip"
                data-tooltip-content={pane.title}
                onClick={() => {
                  dispatch(setLeftPanelIsOpen(true));
                  dispatch(setSectionSelected(interfaceSection));
                  switch (interfaceSection) {
                    case "mission":
                      dispatch(thunkSetRightPanelIsOpenIfAuto(true));
                      break;
                    case "preset":
                      dispatch(thunkSetRightPanelIsOpenIfAuto(selectedPresetUuid !== null));
                      break;
                    case "poi":
                      dispatch(thunkSetRightPanelIsOpenIfAuto(selectedPoiUuid !== null));
                      break;
                    case "station":
                      // scenario: executed station is selected in eva section. tab to station section.
                      //  need to update right station panel to be blank because executed station is not in station section
                      if (!asPlannedStationUuids.includes(selectedStationUuid)) {
                        dispatch(setSelectedStationUuid(null));
                        dispatch(thunkSetRightPanelIsOpenIfAuto(false));
                      } else {
                        dispatch(thunkSetRightPanelIsOpenIfAuto(selectedStationUuid !== null));
                      }

                      break;
                    case "evas":
                      dispatch(
                        thunkSetRightPanelIsOpenIfAuto(
                          !!selectedEvaUuid || !!selectedEvaSequenceItemUuid
                        )
                      );
                      // scenario: as-planned station is selected in station section. tab to eva section where a executed-station was previously selected
                      //  need to update right station panel to show sequence item station
                      if (selectedEvaSequenceItemUuid) {
                        dispatch(setSelectedStationUuid(selectedEvaSequenceItemUuid));
                      }
                      break;
                  }
                }}
              >
                {pane.icon && <FontAwesomeIcon icon={pane.icon} size="lg" />}
                {pane.svgComponent &&
                  (() => {
                    const SvgComponent = pane.svgComponent;
                    return (
                      <SvgComponent
                        fill={pane.color}
                        className={paneStyles.iconSvg}
                        style={
                          {
                            width: "30px",
                            height: "30px",
                            color: pane.color,
                          } as React.CSSProperties
                        }
                      />
                    );
                  })()}
                {itemModified && (
                  <svg height="6" width="6" style={{ position: "absolute", top: "31", left: "31" }}>
                    <circle cx="3" cy="3" r="3" fill="#ff0000" />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!bottomPanelOpen && !selectedPaneType.fullScreen && <BottomGutter />}
    </div>
  );
};

export const RightTabs: FunctionComponent<{
  selectedRightNavItem: string;
  panelTypes: PanelTypes;
  dispatchFunction: Function;
}> = ({ selectedRightNavItem, panelTypes, dispatchFunction }) => {
  const dispatch = useAppDispatch();
  return (
    <div className={paneStyles.rightIconRow}>
      {Object.keys(panelTypes).map((panelType) => {
        return (
          <div
            key={panelType}
            className={
              selectedRightNavItem === panelType
                ? paneStyles.rightIconContainerSelectedTab
                : paneStyles.rightIconContainer
            }
            aria-label={panelType}
            onClick={() => dispatch(dispatchFunction(panelType))}
          >
            <div
              className={paneStyles.rightIcon}
              style={{
                color:
                  selectedRightNavItem === panelType
                    ? panelTypes[panelType].selectedColor
                    : panelTypes[panelType].unselectedColor || "white",
              }}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-content={panelTypes[panelType].title}
            >
              {panelTypes[panelType].icon && (
                <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
              )}
              {panelTypes[panelType].svgComponent &&
                (() => {
                  // render the svg component provided
                  const SvgComponent = panelTypes[panelType].svgComponent;
                  return (
                    <SvgComponent
                      fill={
                        selectedRightNavItem === panelType
                          ? panelTypes[panelType].selectedColor
                          : panelTypes[panelType].unselectedColor || "white"
                      }
                      className={paneStyles.iconSvg}
                    />
                  );
                })()}
            </div>
          </div>
        );
      })}
    </div>
  );
};
