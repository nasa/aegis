import styles from "./station.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { Button } from "components/interface/_global-elements";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import {
  duplicateStation,
  setStationEditMode,
  setSelectedStationUuid,
  upsertStation,
  setSelectedStationRightNavItem,
} from "store/station";
import { v4 as uuidv4 } from "uuid";
import StationItem from "./station-item";
import { generateUniqueName } from "utils/unique-name";
import { duplicateAction } from "store/action";
import _ from "lodash";
import { makeUniqueStringCopy } from "utils/duplicate";
import { setRightPanelOpen } from "store/interface";

const StationEditorLeft: FunctionComponent = () => {
  const dispatch = useDispatch();
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);

  const stationsFromDb = useAppSelector((state) => state.station.stationsFromDb, shallowEqual);
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const selectedStation = stations.find((station) => station.uuid === selectedStationUuid);
  const user: User = useAppSelector((state) => state.user.ironSessionData?.user, shallowEqual);
  const missionId = useAppSelector((state) => state.mission.mission?.id, refEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const actionsFromDb = useAppSelector((state) => state.action.actionsFromDb, shallowEqual);
  const isAdmin = useAppSelector(
    (state) => state.user.ironSessionData?.user.permission.includes("admin"),
    refEqual
  );

  const handleCreateStation = () => {
    const randomName = generateUniqueName({
      dictName: "countries",
      existingNames: stations.map((item) => item.name),
    });

    const blankStation: Station = {
      ownerId: user.id,
      missionId: missionId,
      uuid: uuidv4(),
      name: randomName,
      status: "Candidate",
      description: "",
      radius: 5,
      location: null,
      elevation: null,
      durationLower: 10,
      durationUpper: 15,
      walkbackPath: null,
      walkbackPathSegmentDistances: null,
      walkbackPathSegmentElevations: null,
      icon: null,
      poiUuids: [],
    };
    dispatch(upsertStation(blankStation));
    // turn on edit mode for the new Station
    dispatch(setStationEditMode({ stationUuid: blankStation.uuid, editMode: true }));
    // select the newly created Station
    dispatch(setSelectedStationUuid(blankStation.uuid));
    // open right panel
    dispatch(setRightPanelOpen(true));
    // set the selected tab to the info tab
    dispatch(setSelectedStationRightNavItem("info_panel"));
  };

  const handleDuplicateStation = (station: Station) => {
    if (selectedStationUuid !== null) {
      const newStation: Station = {
        ...station,
        uuid: uuidv4(),
        name: makeUniqueStringCopy(
          station.name,
          stations.map((s) => s.name)
        ),
      };
      dispatch(duplicateStation(newStation));
      const newStationActions = actions.filter((action) => action.stationUuid === station?.uuid);
      for (const action of newStationActions) {
        dispatch(
          duplicateAction({
            action: action,
            stationUuid: newStation.uuid,
          })
        );
      }
      // open right panel
      dispatch(setRightPanelOpen(true));
      // set the selected tab to the info tab
      dispatch(setSelectedStationRightNavItem("info_panel"));
    }
  };

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
              handleCreateStation();
            }}
            label="Add"
            icon={faPlusCircle}
          />
          <Button
            onClick={() => {
              handleDuplicateStation(selectedStation);
            }}
            label="Duplicate"
            icon={faClone}
            enabled={selectedStationUuid !== null}
          />
        </div>
      )}
    </>
  );
};

export default StationEditorLeft;
