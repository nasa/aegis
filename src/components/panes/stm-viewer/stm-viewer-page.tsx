import { Fragment, FunctionComponent } from "react";
import styles from "./stm-viewer-page.module.css";
import STMListTable from "./stm-viewer-list-table";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import _ from "lodash";
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
import { actionTypes } from "utils/store";

const StmViewerPage: FunctionComponent = () => {
  const stmViewExpandTopTiers = useAppSelector(
    (state) => state.interface.stmViewExpandTopTiers,
    refEqual
  );
  const stmViewShowCrosshairs = useAppSelector(
    (state) => state.interface.stmViewShowCrosshairs,
    refEqual
  );
  const dispatch = useAppDispatch();
  return (
    <div className={styles.body}>
      <div className={styles.panel}>
        <div className={styles.panelTop}>
          <div
            className={
              stmViewExpandTopTiers ? styles.panelTopLeftExpanded : styles.panelTopLeftCollapsed
            }
          >
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
                        : {
                            width: "30px",
                            fontSize: "0.8em",
                            paddingLeft: "8px",
                          }
                    }
                    iconStyle={stmViewShowCrosshairs ? { color: "var(--grey0)" } : null}
                  />
                </div>
              </div>
            </div>
            {stmViewExpandTopTiers ? (
              <div className={styles.listTableTitlesExpanded}>
                <div className={styles.listTableTitle}>Goal</div>
                <div className={styles.listTableTitle}>Objective</div>
                <div className={styles.listTableTitle}>Investigation/Actions</div>
              </div>
            ) : (
              <div className={styles.listTableTitlesCollapsed}>
                <div className={styles.listTableTitle}>G.</div>
                <div className={styles.listTableTitle}>O.</div>
                <div className={styles.listTableTitle}>Investigation/Actions</div>
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
    const allSortedEvas = _.sortBy(state.eva.evas, "name");
    return allSortedEvas
      .filter((eva) => state.interface.stmViewSelectedEvas.includes(eva.uuid))
      .map((eva) => eva.uuid);
  }, deepEqual);
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
  const eva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === evaUuid),
    deepEqual
  );
  const numberOfStationsInEva = evaUuid
    ? eva?.sequence.filter((sequenceItem) => sequenceItem.type === "station").length || 0
    : 5;
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
            .map((_, index) => (
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
    const allSortedEvas = _.sortBy(state.eva.evas, "name");
    return allSortedEvas
      .filter((eva) => state.interface.stmViewSelectedEvas.includes(eva.uuid))
      .map((eva) => eva.uuid);
  }, deepEqual);
  const allStationsNotInASelectedEvas = useAppSelector((state) => {
    const stations = _.sortBy(state.station.stations, "name");
    const selectedEvaUuids = state.interface.stmViewSelectedEvas;
    for (const evaUuid of selectedEvaUuids) {
      const eva = state.eva.evas.find((eva) => eva.uuid === evaUuid);
      if (eva) {
        const stationUuids = eva.sequence
          .filter((sequenceItem) => sequenceItem.type === "station")
          .map((sequenceItem) => sequenceItem.uuid);
        for (const stationUuid of stationUuids) {
          const station = stations.find((station) => station.uuid === stationUuid);
          if (station) {
            stations.splice(stations.indexOf(station), 1);
          }
        }
      }
    }
    return stations;
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
    (state) => _.sortBy(state.station.stations, "name"),
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
  const evasWithStations = useAppSelector((state) => {
    const evas = _.sortBy(state.eva.evas, "name");
    // remove evas that have no stations in the sequence
    for (const eva of evas) {
      if (eva.sequence.filter((sequenceItem) => sequenceItem.type === "station").length === 0) {
        evas.splice(evas.indexOf(eva), 1);
      }
    }
    return evas;
  }, deepEqual);

  return (
    <div
      className={styles.selectionControl}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html="Contains all EVAs that have assigned stations"
    >
      <MultiSelectDropdown
        items={evasWithStations.map((eva) => ({ label: eva.name, value: eva.uuid }))}
        selectedItems={selectedEvas}
        toggleItem={(uuid) => {
          dispatch(stmViewToggleEva(uuid));
        }}
        titleLabel="Select EVAs"
        zIndex={10}
      />
    </div>
  );
};

const ActionTypesSelector: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedActionTypes = useAppSelector(
    (state) => state.interface.stmViewSelectedActionTypes,
    deepEqual
  );

  return (
    <div className={styles.selectionControl}>
      <MultiSelectDropdown
        items={_.sortBy(
          actionTypes.map((actionType) => ({
            label: titleCase(actionType),
            value: actionType,
          })),
          "label"
        )}
        selectedItems={selectedActionTypes}
        toggleItem={(actionType) => {
          dispatch(stmViewToggleSelectedActionType(actionType));
        }}
        titleLabel="Filter Action Types"
        zIndex={9}
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
