import styles from "./station.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { Button } from "components/interface/form/globalFields";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import StationItem from "./station-item";
import _ from "lodash";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCreateStation, thunkDuplicateStation } from "store/thunk/thunkStation";

const StationEditorLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const stations = useAppSelector((state) => state.station.stations, deepEqual);

  const stationsFromDb = useAppSelector((state) => state.station.stationsFromDb, deepEqual);
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const actions = useAppSelector((state) => state.action.actions, deepEqual);
  const actionsFromDb = useAppSelector((state) => state.action.actionsFromDb, deepEqual);
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  return (
    <>
      <div className={paneStyles.leftPanelContainer}>
        <div className={styles.container}>
          <div className={styles.body} aria-label="stationList">
            {_.sortBy(stations, "name").map((station) => {
              const stationFromDb = stationsFromDb.find(
                (stationFromDb) => stationFromDb.uuid === station.uuid
              );
              const stationActions = actions.filter(
                (action) => action.stationUuid === station.uuid
              );
              const stationActionsFromDb = actionsFromDb.filter(
                (action) => action.stationUuid === station.uuid
              );

              return (
                <StationItem
                  key={station.uuid}
                  selectedStationUuid={selectedStationUuid}
                  station={station}
                  stationFromDb={stationFromDb}
                  stationActions={stationActions}
                  stationActionsFromDb={stationActionsFromDb}
                />
              );
            })}
          </div>
        </div>
      </div>
      {editPerms && (
        <div className={paneStyles.iconButtons}>
          <Button
            ariaLabel="addStation"
            onClick={() => {
              dispatch(thunkCreateStation());
            }}
            label="Add"
            icon={faPlusCircle}
            style={{ width: "65px" }}
          />
          <Button
            ariaLabel="duplicateStation"
            onClick={() => {
              dispatch(thunkDuplicateStation({ stationUuid: selectedStationUuid }));
            }}
            label="Duplicate"
            icon={faClone}
            enabled={selectedStationUuid !== null}
            style={{ width: "95px" }}
          />
        </div>
      )}
    </>
  );
};

export default StationEditorLeft;
