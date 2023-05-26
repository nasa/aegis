import styles from "./station.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { Button } from "components/interface/_global-elements";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import StationItem from "./station-item";
import _ from "lodash";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCreateStation, thunkDuplicateStation } from "store/thunk/thunkStation";

const StationEditorLeft: FunctionComponent = () => {
  const thunkDispatch = useAppDispatch();
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);

  const stationsFromDb = useAppSelector((state) => state.station.stationsFromDb, shallowEqual);
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const selectedStation = stations.find((station) => station.uuid === selectedStationUuid);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const actionsFromDb = useAppSelector((state) => state.action.actionsFromDb, shallowEqual);
  const isAdmin = useAppSelector(
    (state) => state.user.ironSessionData?.user.permission.includes("admin"),
    refEqual
  );

  return (
    <>
      <div className={paneStyles.leftPanelContainer}>
        <div className={styles.container}>
          <div className={styles.body}>
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
      {isAdmin && (
        <div className={paneStyles.iconButtons}>
          <Button
            onClick={() => {
              thunkDispatch(thunkCreateStation());
            }}
            label="Add"
            icon={faPlusCircle}
            style={{ width: "65px" }}
          />
          <Button
            onClick={() => {
              thunkDispatch(thunkDuplicateStation({ station: selectedStation }));
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
