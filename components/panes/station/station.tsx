import styles from "./station.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { IconButton } from "components/interface/_global-elements";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import {
  duplicateStation,
  setStationEditMode,
  setSelectedStationUuid,
  upsertStation,
} from "store/station";
import { animals, uniqueNamesGenerator } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";
import StationItem from "./station-item";
import _ from "lodash";

const StationEditorLeft: FunctionComponent = () => {
  const dispatch = useDispatch();
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const stationsFromDb = useAppSelector((state) => state.station.stationsFromDb, shallowEqual);
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const selectedStation = stations.find((station) => station.uuid === selectedStationUuid);
  const user: AEGISUser = useAppSelector((state) => state.user.ironSessionData?.user, shallowEqual);
  const missionId = useAppSelector((state) => state.mission.mission?.id, refEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const actionsFromDb = useAppSelector((state) => state.action.actionsFromDb, shallowEqual);

  const handleCreateStation = () => {
    const randomName: string = uniqueNamesGenerator({
      dictionaries: [animals],
      style: "capital",
    });

    const blankStation: Station = {
      ownerId: user.id,
      missionId: missionId,
      uuid: uuidv4(),
      name: "S-" + randomName,
      status: "Candidate",
      description: "",
      radius: 5,
      location: null,
    };
    dispatch(upsertStation(blankStation));
    // turn on edit mode for the new Station
    dispatch(setStationEditMode({ stationUuid: blankStation.uuid, editMode: true }));
    // select the newly created Station
    dispatch(setSelectedStationUuid(blankStation.uuid));
  };

  return (
    <>
      <div className={paneStyles.leftPanelContainer}>
        <div className={styles.container}>
          <div className={styles.body}>
            {stations.map((station) => {
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
      <div className={paneStyles.iconButtons}>
        <IconButton
          onClick={() => {
            handleCreateStation();
          }}
          label="Add"
          icon={faPlusCircle}
        ></IconButton>
        <IconButton
          onClick={() => {
            if (selectedStationUuid !== null) {
              dispatch(duplicateStation(selectedStation));
            }
          }}
          label="Duplicate"
          icon={faClone}
          enabled={selectedStationUuid !== null}
        ></IconButton>
      </div>
    </>
  );
};

export default StationEditorLeft;
