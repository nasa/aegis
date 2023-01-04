import styles from "./station.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { IconButton } from "components/interface/_global-elements";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import {
  duplicateStation,
  setStationEditMode,
  setSelectedStationUuid,
  // setSelectedStationRightNavItem,
  upsertStation,
} from "store/station";
import { animals, uniqueNamesGenerator } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";
import StationLeft from "./station-station";

const StationEditorLeft: FunctionComponent = () => {
  const dispatch = useDispatch();
  const stations: Station[] = useSelector(
    (state: RootState) => state.station.stations,
    shallowEqual
  );
  const stationsFromDb: Station[] = useSelector(
    (state: RootState) => state.station.stationsFromDb,
    shallowEqual
  );
  // const selectedRightNavItem = useSelector(
  //   (state: RootState) => state.station.selectedRightNavItem,
  //   shallowEqual
  // );
  const selectedStationUuid = useSelector(
    (state: RootState) => state.station.selectedStationUuid,
    shallowEqual
  );
  const selectedStation: Station = stations.find(
    (station: Station) => station.uuid === selectedStationUuid
  );
  const user: AEGISUser = useSelector(
    (state: RootState) => state.user.ironSessionData?.user,
    shallowEqual
  );
  const mission = useSelector((state: RootState) => state.mission.mission, shallowEqual);
  const actions: Action[] = useSelector((state: RootState) => state.action.actions, shallowEqual);
  const actionsFromDb: Action[] = useSelector(
    (state: RootState) => state.action.actionsFromDb,
    shallowEqual
  );

  const handleCreateStation = () => {
    const randomName: string = uniqueNamesGenerator({
      dictionaries: [animals],
      style: "capital",
    });

    const blankStation: Station = {
      ownerId: user.id,
      missionId: mission.id,
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

              return (
                <StationLeft
                  key={station.uuid}
                  station={station}
                  stationFromDb={stationFromDb}
                  selectedStationUuid={selectedStationUuid}
                  actions={actions}
                  actionsFromDb={actionsFromDb}
                />
              );
              // const stationSelected =
              //   station.uuid === selectedStationUuid ? styles.nameSelected : null;
              // const stationFromDb = stationsFromDb.find(
              //   (stationFromDb) => stationFromDb.uuid === station.uuid
              // );
              // const stationActions = actions.filter(
              //   (storeAction) => storeAction.stationUuid === station.uuid
              // );
              // const stationActionsFromDb = actionsFromDb.filter(
              //   (storeAction) => storeAction.stationUuid === station.uuid
              // );
              // return (
              //   <div
              //     className={styles.stationItem}
              //     key={station.uuid}
              //     onClick={() => {
              //       if (selectedStationUuid === station.uuid) {
              //         dispatch(setSelectedStationUuid(null));
              //       } else {
              //         dispatch(setSelectedStationUuid(station.uuid));
              //         if (!selectedRightNavItem)
              //           dispatch(setSelectedStationRightNavItem("info_panel"));
              //       }
              //     }}
              //   >
              //     <div className={`${styles.name} ${stationSelected}`}>
              //       <div>{station.name}</div>
              //       <ModifiedIndicator
              //         obj1={station}
              //         obj2={stationFromDb}
              //         svgStyle={{
              //           width: "15",
              //           height: "12",
              //           cx: "5",
              //           cy: "9",
              //           r: "3",
              //           fill: "#ff0000",
              //         }}
              //       />
              //       <ModifiedIndicator
              //         obj1={stationActions}
              //         obj2={stationActionsFromDb}
              //         svgStyle={{
              //           width: "15",
              //           height: "12",
              //           cx: "5",
              //           cy: "9",
              //           r: "3",
              //           fill: "#ff0000",
              //         }}
              //       />
              //       <div className={styles.stationRightSpacer}></div>
              //     </div>
              //   </div>
              // );
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
