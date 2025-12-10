import { Fragment, FunctionComponent } from "react";
import styles from "./stm-viewer-page.module.css";
import STMListTable from "./stm-viewer-list-table";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { abbreviateString, titleCase } from "utils/formatting";
import { Button, MultiSelectDropdown } from "components/interface/form/globalFields";
import {
  faArrowLeft,
  faArrowRight,
  faArrowsDownToLine,
  faArrowsUpToLine,
  faCrosshairs,
  faFilterCircleXmark,
} from "@fortawesome/free-solid-svg-icons";
import { thunkCollapseAllLevel3s, thunkExpandAllLevel3s } from "store/thunk/thunkInterface";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  stmViewSetHoveredTopItem,
  stmViewSetHoveredLeftItem,
  stmViewToggleEva,
  stmViewToggleExpandTopTiers,
  stmViewToggleSelectedActionType,
  setSectionSelected,
  stmViewToggleCrosshairs,
} from "store/interface";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setSelectedStationUuid } from "store/station";
import { actionTypes } from "store/storeUtils/store";
import sortBy from "lodash/sortBy";
import { selectAsPlannedStations } from "store/selectors";

const StmViewerPage: FunctionComponent = () => {
  const stmViewExpandTopTiers = useAppSelector(
    (state) => state.interface.stmViewExpandTopTiers,
    refEqual
  );
  const stmViewShowCrosshairs = useAppSelector(
    (state) => state.interface.stmViewShowCrosshairs,
    refEqual
  );
  const stmLevel1Enabled = useAppSelector(
    (state) => state.mission.mission.stmLevel1Enabled,
    refEqual
  );
  const mission = useAppSelector((state) => state.mission.mission, deepEqual);
  const dispatch = useAppDispatch();

  const expandedClass = stmLevel1Enabled
    ? styles.panelTopLeftExpanded
    : styles.panelTopLeftExpanded2Tier;
  const collapsedClass = stmLevel1Enabled
    ? styles.panelTopLeftCollapsed
    : styles.panelTopLeftCollapsed2Tier;

  return (
    <div className={styles.body}>
      <div className={styles.panel}>
        <div className={styles.panelTop}>
          <div className={stmViewExpandTopTiers ? expandedClass : collapsedClass}>
            <div className={styles.selectionControls}>
              <div className={styles.selectionControlsLeft}>
                <EvaSelector />
                <ActionTypesSelector />
                <div className={styles.buttonsContainer}>
                  <Button
                    icon={stmViewExpandTopTiers ? faArrowLeft : faArrowRight}
                    onClick={() => {
                      dispatch(stmViewToggleExpandTopTiers());
                    }}
                    toolTip="Expand/Collapse First two STM tiers"
                    style={{ width: "30px", fontSize: "0.8em", paddingLeft: "8px" }}
                  />
                  <Button
                    icon={faArrowsDownToLine}
                    onClick={() => {
                      // expand all level3s
                      dispatch(thunkExpandAllLevel3s());
                    }}
                    toolTip="Show all action types"
                    style={{ width: "30px", fontSize: "0.8em", paddingLeft: "8px" }}
                  />
                  <Button
                    icon={faArrowsUpToLine}
                    onClick={() => {
                      // collapse all level3s
                      dispatch(thunkCollapseAllLevel3s());
                    }}
                    toolTip="Hide all action types"
                    style={{ width: "30px", fontSize: "0.8em", paddingLeft: "8px" }}
                  />
                  <Button
                    icon={faCrosshairs}
                    onClick={() => {
                      dispatch(stmViewToggleCrosshairs());
                    }}
                    toolTip="Show/Hide Row/Column highlights"
                    style={
                      stmViewShowCrosshairs
                        ? {
                            width: "30px",
                            fontSize: "0.8em",
                            paddingLeft: "8px",
                            backgroundColor: "var(--grey5)",
                          }
                        : { width: "30px", fontSize: "0.8em", paddingLeft: "8px" }
                    }
                    iconStyle={stmViewShowCrosshairs ? { color: "var(--grey0)" } : null}
                  />
                </div>
              </div>
            </div>
            {stmViewExpandTopTiers ? (
              <div
                className={
                  mission.stmLevel1Enabled
                    ? styles.listTableTitlesExpanded
                    : styles.listTableTier1DisabledTitlesExpanded
                }
              >
                {mission.stmLevel1Enabled && (
                  <div className={styles.listTableTitle}>{`${mission.stmLevel1Name}s`}</div>
                )}
                <div className={styles.listTableTitle}>{mission.stmLevel2Name}s</div>
                <div className={styles.listTableTitle}>{mission.stmLevel3Name}s</div>
              </div>
            ) : (
              <div
                className={
                  mission.stmLevel1Enabled
                    ? styles.listTableTitlesCollapsed
                    : styles.listTableTier1DisabledTitlesCollapsed
                }
              >
                {mission.stmLevel1Enabled && (
                  <div className={styles.listTableTitle}>
                    {mission.stmLevel1Name.substring(0, 1)}.
                  </div>
                )}
                <div className={styles.listTableTitle}>
                  {mission.stmLevel2Name.substring(0, 1)}.
                </div>
                <div className={styles.listTableTitle}>{mission.stmLevel3Name}s</div>
              </div>
            )}
          </div>
          <div className={styles.panelTopRight}>
            <StationGroupTitles />
            <StationNameGroups />
          </div>
        </div>
        <div
          className={styles.panelBottom}
          onMouseLeave={() => {
            dispatch(stmViewSetHoveredTopItem(null));
            dispatch(stmViewSetHoveredLeftItem(null));
          }}
        >
          <STMListTable />
        </div>
      </div>
    </div>
  );
};

export default StmViewerPage;

const StationGroupTitles: FunctionComponent = () => {
  const sortedEvaUuids = useAppSelector((state) => {
    const allRexEvasUuids = state.rex.rexesFromDb.map((rex) => rex.evaUuid);
    const sortedAsPlannedEvas = sortBy(
      state.eva.evas.filter((eva) => !allRexEvasUuids.includes(eva.uuid)),
      [(eva) => eva.name?.toLowerCase()]
    );
    return sortedAsPlannedEvas
      .filter((eva) => state.interface.stmViewSelectedEvas.includes(eva.uuid))
      .map((eva) => eva.uuid);
  }, shallowEqual);
  return (
    <div className={styles.stationGroupTitles}>
      {sortedEvaUuids.map((evaUuid, index) => (
        <div key={evaUuid}>
          {index > 0 && <div className={styles.gridStationGroupDivider}></div>}
          <StationGroupTitle evaUuid={evaUuid} />
        </div>
      ))}
      <StationGroupTitle />
    </div>
  );
};

const StationGroupTitle: FunctionComponent<{ evaUuid?: string }> = ({ evaUuid }) => {
  const allStations = useAppSelector(
    (state) => sortBy(state.station.stations, [(station) => station.name.toLowerCase()]),
    deepEqual
  );
  const eva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === evaUuid),
    deepEqual
  );
  // filter stations by evaUuid
  let stations: Station[] = [];
  if (eva) {
    // filter stations by evaUuid
    const stationUuids = eva.sequence
      .filter((sequenceItem) => sequenceItem.type === "station")
      .map((sequenceItem) => sequenceItem.uuid);
    // preserve the order of stationUuids because this is the sequence order
    for (const stationUuid of stationUuids) {
      const station = allStations.find((station) => station.uuid === stationUuid);
      if (station) {
        stations.push(station);
      }
    }
  } else {
    stations = allStations;
  }

  const numberOfStationsInEva = evaUuid ? stations.length : 5;
  return (
    <div className={styles.stationGroupTitleContainer}>
      <div
        className={styles.stationGroupTitle}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html={eva?.name}
        style={{ width: `${(numberOfStationsInEva + 1) * 22}px` }}
      >
        {eva && abbreviateString(eva.name, 3 * numberOfStationsInEva)}
      </div>
      {evaUuid ? (
        <div className={styles.stationGroupTitleStyling}>
          {Array(numberOfStationsInEva)
            .fill(0)
            .map((__, index) => (
              <div key={index} className={styles.stationGroupTitleStylingItem}>
                <div className={styles.evaCircle}></div>
                <div className={styles.evaLine}></div>
              </div>
            ))}
        </div>
      ) : (
        <div className={styles.stationRemaining}>Remaining Stations</div>
      )}
    </div>
  );
};

const StationNameGroups: FunctionComponent = () => {
  const sortedEvaUuids = useAppSelector((state) => {
    const allRexEvasUuids = state.rex.rexesFromDb.map((rex) => rex.evaUuid);
    const sortedAsPlannedEvas = sortBy(
      state.eva.evas.filter((eva) => !allRexEvasUuids.includes(eva.uuid)),
      [(eva) => eva.name?.toLowerCase()]
    );
    return sortedAsPlannedEvas
      .filter((eva) => state.interface.stmViewSelectedEvas.includes(eva.uuid))
      .map((eva) => eva.uuid);
  }, shallowEqual);
  const allStationsNotInASelectedEvas = useAppSelector((state) => {
    const sortedAsPlannedStations = selectAsPlannedStations(state);
    const selectedEvaUuids = state.interface.stmViewSelectedEvas;
    for (const evaUuid of selectedEvaUuids) {
      const eva = state.eva.evas.find((eva) => eva.uuid === evaUuid);
      if (eva) {
        const stationUuids = eva.sequence
          .filter((sequenceItem) => sequenceItem.type === "station")
          .map((sequenceItem) => sequenceItem.uuid);
        for (const stationUuid of stationUuids) {
          const station = sortedAsPlannedStations.find((station) => station.uuid === stationUuid);
          if (station) {
            sortedAsPlannedStations.splice(sortedAsPlannedStations.indexOf(station), 1);
          }
        }
      }
    }
    return sortedAsPlannedStations;
  }, deepEqual);

  return (
    <div className={styles.gridStationNames}>
      {sortedEvaUuids.map((evaUuid, index) => (
        <Fragment key={evaUuid}>
          {index > 0 && <div className={styles.gridStationNamesDivider}></div>}
          <StationNames key={evaUuid} evaUuid={evaUuid} />
        </Fragment>
      ))}
      {sortedEvaUuids.length > 0 && <div className={styles.gridStationNamesDivider}></div>}
      {allStationsNotInASelectedEvas.map((station) => (
        <StationName key={`${station.uuid}_standalone`} station={station} />
      ))}
    </div>
  );
};

const StationNames: FunctionComponent<{ evaUuid?: string }> = ({ evaUuid }) => {
  const allStations = useAppSelector(
    (state) => sortBy(state.station.stations, [(station) => station.name.toLowerCase()]),
    deepEqual
  );
  const stations = useAppSelector((state) => {
    const eva = state.eva.evas.find((eva) => eva.uuid === evaUuid);
    if (eva) {
      const stationUuids = eva.sequence
        .filter((sequenceItem) => sequenceItem.type === "station")
        .map((sequenceItem) => sequenceItem.uuid);
      const stations: Station[] = [];
      for (const stationUuid of stationUuids) {
        const station = allStations.find((station) => station.uuid === stationUuid);
        if (station) {
          stations.push(station);
        }
      }
      return stations;
    } else {
      return allStations;
    }
  }, deepEqual);

  return (
    <>
      {stations.map((station) => (
        <StationName key={`${station.uuid}_${evaUuid}`} station={station} />
      ))}
    </>
  );
};

const StationName: FunctionComponent<{ station: Station }> = ({ station }) => {
  const dispatch = useAppDispatch();
  const stmViewHoveredTopItem = useAppSelector(
    (state) =>
      state.interface.stmViewShowCrosshairs ? state.interface.stmViewHoveredTopItem : null,
    refEqual
  );
  return (
    <div
      className={styles.gridStationNameContainer}
      style={
        stmViewHoveredTopItem === station.uuid ? { backgroundColor: "var(--stmTableHover)" } : null
      }
      onClick={() => {
        dispatch(setSelectedStationUuid(station.uuid));
        dispatch(setSectionSelected("station"));
      }}
      onMouseOver={() => {
        dispatch(stmViewSetHoveredTopItem(station.uuid));
      }}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={station.name}
      data-tooltip-place="left-start"
    >
      <div className={styles.gridStationNameText}>{abbreviateString(station.name, 12)}</div>
    </div>
  );
};

const EvaSelector: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedEvas = useAppSelector((state) => state.interface.stmViewSelectedEvas, deepEqual);
  const asPlannedEvaWithStations = useAppSelector((state) => {
    const allRexEvasUuids = state.rex.rexesFromDb.map((rex) => rex.evaUuid);
    const asPlannedEvasWithStations = state.eva.evas.filter(
      (eva) =>
        !allRexEvasUuids.includes(eva.uuid) && // not in a rex
        eva.sequence.filter((sequenceItem) => sequenceItem.type === "station").length > 0 // has a station
    );
    const sortedEvas = sortBy(asPlannedEvasWithStations, [(eva) => eva.name.toLowerCase()]);
    return sortedEvas;
  }, deepEqual);

  return (
    <div
      className={styles.selectionControl}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html="Contains all EVAs that have assigned stations"
    >
      <MultiSelectDropdown
        items={asPlannedEvaWithStations.map((eva) => ({ label: eva.name, value: eva.uuid }))}
        selectedItemsValues={selectedEvas}
        toggleItem={(uuid) => {
          dispatch(stmViewToggleEva(uuid));
        }}
        titleLabel="Select As-Planned EVAs"
        containerStyle={{ zIndex: 10 }}
        containerClassName={styles.multiselectDropdownContainer}
        headerClassName={styles.multiselectDropdownHeader}
      />
    </div>
  );
};

const ActionTypesSelector: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedActionTypes = useAppSelector(
    (state) => state.interface.stmViewSelectedActionTypes,
    shallowEqual
  );

  return (
    <div className={styles.selectionControl}>
      <MultiSelectDropdown
        items={sortBy(
          actionTypes.map((actionType) => ({ label: titleCase(actionType), value: actionType })),
          "label"
        )}
        selectedItemsValues={selectedActionTypes}
        toggleItem={(actionType) => {
          dispatch(stmViewToggleSelectedActionType(actionType as ActionType));
        }}
        titleLabel="Filter Action Types"
        containerStyle={{ zIndex: 9 }}
        containerClassName={styles.multiselectDropdownContainer}
        headerClassName={styles.multiselectDropdownHeader}
      />
      {selectedActionTypes.length !== actionTypes.length && (
        <FontAwesomeIcon
          icon={faFilterCircleXmark}
          className={styles.filterIndicator}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html="Show all action types"
          onClick={() => {
            // recheck all actionTypes
            for (const actionType of actionTypes) {
              if (!selectedActionTypes.includes(actionType)) {
                dispatch(stmViewToggleSelectedActionType(actionType));
              }
            }
          }}
        />
      )}
    </div>
  );
};
