import { Fragment, FunctionComponent } from "react";
import styles from "./stm-viewer-indicators.module.css";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import _ from "lodash";
import { useAppDispatch } from "utils/useAppDispatch";
import { stmViewSetHoveredTopItem } from "store/interface";

export const IndicatorGridRow: FunctionComponent<{
  level3Uuid: string;
  actionType?: ActionType;
  actionUuid?: string;
}> = ({ level3Uuid, actionType, actionUuid }) => {
  const sortedEvaUuids = useAppSelector((state) => {
    const allSortedEvas = _.sortBy(state.eva.evas, [(eva) => eva.name.toLowerCase()]);
    return allSortedEvas
      .filter((eva) => state.interface.stmViewSelectedEvas.includes(eva.uuid))
      .map((eva) => eva.uuid);
  }, shallowEqual);
  const allStationsNotInASelectedEvas = useAppSelector((state) => {
    const stations = _.sortBy(state.station.stations, [(station) => station.name.toLowerCase()]);
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
    <div className={styles.indicatorGridRow}>
      {sortedEvaUuids.map((evaUuid, index) => (
        <Fragment key={evaUuid}>
          {index > 0 && <div className={styles.indicatorGridCellDivider}></div>}
          <IndicatorGridStationGroup
            level3Uuid={level3Uuid}
            evaUuid={evaUuid}
            actionType={actionType}
            actionUuid={actionUuid}
          />
        </Fragment>
      ))}
      {sortedEvaUuids.length > 0 && <div className={styles.indicatorGridCellDivider}></div>}
      {allStationsNotInASelectedEvas.map((station) => (
        <IndicatorGridCell
          key={`${station.uuid}_standalone`}
          level3Uuid={level3Uuid}
          stationUuid={station.uuid}
          actionType={actionType}
          actionUuid={actionUuid}
        />
      ))}
    </div>
  );
};

const IndicatorGridStationGroup: FunctionComponent<{
  level3Uuid: string;
  evaUuid: string;
  actionType?: ActionType;
  actionUuid?: string;
}> = ({ level3Uuid, evaUuid, actionType, actionUuid }) => {
  const allStations = useAppSelector(
    (state) => _.sortBy(state.station.stations, [(station) => station.name.toLowerCase()]),
    deepEqual
  );
  const eva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === evaUuid),
    deepEqual
  );
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

  return (
    <>
      {stations.map((station) => (
        <IndicatorGridCell
          key={`${station.uuid}_${evaUuid}`}
          level3Uuid={level3Uuid}
          stationUuid={station.uuid}
          actionType={actionType}
          actionUuid={actionUuid}
        />
      ))}
    </>
  );
};

type IndicatorStyle = {
  string: string;
  cssStyle: string;
};

const IndicatorGridCell: FunctionComponent<{
  level3Uuid: string;
  stationUuid: string;
  actionType?: ActionType;
  actionUuid?: string;
}> = ({ level3Uuid, stationUuid, actionType = null, actionUuid = null }) => {
  const dispatch = useAppDispatch();
  const stmViewHoveredTopItem = useAppSelector(
    (state) =>
      state.interface.stmViewShowCrosshairs ? state.interface.stmViewHoveredTopItem : null,
    refEqual
  );
  const indicator: IndicatorStyle = useAppSelector((state) => {
    const stationActions = state.action.actions.filter(
      (action) => action.stationUuid === stationUuid
    );
    if (stationActions.length === 0) {
      return null;
    }
    let actionsWithThisLevel3 = stationActions.filter(
      (action) => action.stmPriorities && Object.keys(action.stmPriorities).includes(level3Uuid)
    );

    // filter against stmViewSelectedActionTypes
    const selectedActionTypes = state.interface.stmViewSelectedActionTypes;
    actionsWithThisLevel3 = actionsWithThisLevel3.filter((action) =>
      selectedActionTypes.includes(action.type)
    );

    // also filter by actionType if provided
    if (actionType) {
      actionsWithThisLevel3 = actionsWithThisLevel3.filter((action) => action.type === actionType);
    }

    // also filter by actionUuid if provided
    if (actionUuid) {
      actionsWithThisLevel3 = actionsWithThisLevel3.filter((action) => action.uuid === actionUuid);
    }

    if (actionsWithThisLevel3.length === 0) {
      return null;
    }

    // hightest priority has the lowest numerical value
    let lowestLevelPriority = 3;
    actionsWithThisLevel3.forEach((action) => {
      const priority = action.stmPriorities[level3Uuid];
      if (priority < lowestLevelPriority) {
        lowestLevelPriority = priority;
      }
    });
    switch (lowestLevelPriority) {
      case 1:
        return { string: "H", cssStyle: styles.indicatorHigh };
      case 2:
        return { string: "M", cssStyle: styles.indicatorMedium };
      case 3:
        return { string: "L", cssStyle: styles.indicatorLow };
      default:
        return null;
    }
  }, shallowEqual);

  return (
    <div
      className={styles.indicatorGridCell}
      onMouseEnter={() => {
        dispatch(stmViewSetHoveredTopItem(stationUuid));
      }}
      style={
        stmViewHoveredTopItem === stationUuid ? { backgroundColor: "var(--stmTableHover)" } : null
      }
    >
      {indicator && (
        <div className={`${styles.indicatorGridCellIndicator} ${indicator.cssStyle}`}>
          <div className={`${styles.indicatorGridCellIndicatorText} `}>{indicator.string}</div>
        </div>
      )}
    </div>
  );
};
