import paneStyles from "../global-pane-styles.module.css";
import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faPersonDigging,
  faBan,
  faFloppyDisk,
  faTrashAlt,
  faEdit,
} from "@fortawesome/free-solid-svg-icons";
import { IconButton, InLineEditInput } from "components/interface/_global-elements";

import { RootState } from "store";
import {
  deleteStation,
  setSelectedStationUuid,
  setSelectedStationRightNavItem,
  setStationEditMode,
  upsertStation,
  upsertStationsFromDb,
  deleteAllStationsFromDb,
} from "store/station";
import {
  deleteAllActionsFromDb,
  upsertActionsFromDb,
  upsertActions,
  deleteActions,
  deleteActionsFromDb,
} from "store/action";

import Info_Panel from "./station-right-info";
import Poi_Panel from "./station-right-poi";
import Actions_Panel from "./station-right-actions";
import * as httpClient_station from "http-client/station";
import * as httpClient_action from "http-client/action";

const panelTypes: PanelTypes = {
  info_panel: {
    title: "Station Information",
    panel: Info_Panel,
    color: "var(--station)",
    icon: faCircleInfo,
  },
  poi_panel: {
    title: "Station POIs",
    panel: Poi_Panel,
    color: "var(--station)",
    icon: faCircleDot,
  },
  actions_panel: {
    title: "Station Actions",
    panel: Actions_Panel,
    color: "var(--station)",
    icon: faPersonDigging,
  },
};

const StationEditorRight: FunctionComponent = () => {
  const dispatch = useDispatch();
  const selectedMissionId = useSelector(
    (state: RootState) => state.mission.mission?.id,
    shallowEqual
  );
  const selectedRightNavItem = useSelector(
    (state: RootState) => state.station.selectedRightNavItem,
    shallowEqual
  );
  const selectedStationUuid = useSelector(
    (state: RootState) => state.station.selectedStationUuid,
    shallowEqual
  );
  const stationsEditing = useSelector(
    (state: RootState) => state.station.stationsEditing,
    shallowEqual
  );
  const selectedStation = useSelector(
    (state: RootState) => state.station.stations,
    shallowEqual
  ).find((station) => station.uuid === selectedStationUuid);
  const selectedStationFromDb = useSelector(
    (state: RootState) => state.station.stationsFromDb,
    shallowEqual
  ).find((station) => station.uuid === selectedStationUuid);

  const actions = useSelector((state: RootState) => state.action.actions, shallowEqual);
  const actionsFromDb = useSelector((state: RootState) => state.action.actionsFromDb, shallowEqual);

  //store the .filter actions for station in state as opposed to local const variable
  //if stored in a local const, react hooks sees the variable changing although nothing has happened
  //this is not an issue with .find
  const [stationActions, setStationActions] = useState<Action[]>(null);
  const [stationActionsFromDb, setStationActionsFromDb] = useState<Action[]>(null);
  useEffect(() => {
    if (actions) {
      setStationActions(
        actions.filter((storeAction: Action) => storeAction.stationUuid === selectedStationUuid)
      );
    }
  }, [actions, selectedStationUuid]);
  useEffect(() => {
    if (actionsFromDb) {
      const actions = actionsFromDb.filter(
        (storeAction: Action) => storeAction.stationUuid === selectedStationUuid
      );
      setStationActionsFromDb(actions);
    }
  }, [actionsFromDb, selectedStationUuid]);

  //track modified
  const [modified, setModified] = useState(false);
  useEffect(() => {
    const stationEqual = _.isEqual(selectedStation, selectedStationFromDb);
    const actionEqual = _.isEqual(
      _.sortBy(stationActions, ["uuid"]),
      _.sortBy(stationActionsFromDb, ["uuid"])
    );
    setModified(!stationEqual || !actionEqual);
  }, [selectedStation, selectedStationFromDb, stationActions, stationActionsFromDb]);

  const handleSave = async () => {
    if (selectedStation && modified) {
      // upsert the changed Station to the DB via internal API call
      const stationUpsertResponse = await httpClient_station.upsertStation(selectedStation);

      if (stationUpsertResponse.status === "success") {
        // upsert the changed Station (with new updated date) to the store
        dispatch(upsertStation(stationUpsertResponse.data));
        // update the Station in the store with a fresh copy from the DB
        const stationData = await httpClient_station.getStations(selectedMissionId);
        if (stationData.data) {
          dispatch(deleteAllStationsFromDb());
          dispatch(upsertStationsFromDb(stationData.data));
        }
      } else {
        throw new Error("Error upserting Station: " + stationUpsertResponse.message);
      }

      // find out if the actions in this station have been modified and need to be persisted
      const actionsModified = !_.isEqual(stationActions, stationActionsFromDb);
      if (actionsModified) {
        //upsert Actions to db
        const upsertedStationActions: Action[] = [];
        for (const actionToUpsert of stationActions) {
          const actionUpsertResponse = await httpClient_action.upsertAction(actionToUpsert);
          if (actionUpsertResponse.status !== "success") {
            throw new Error("Error upserting station actions " + actionUpsertResponse.message);
          } else {
            upsertedStationActions.push(actionUpsertResponse.data);
          }
        }
        // upsert the changed Action (with new updated dates) to the store
        dispatch(upsertActions(upsertedStationActions));

        // remove any deleted actions from the db
        dispatch(deleteActionsFromDb(stationActionsFromDb));
        // filter out deleted actions using local state
        const deletedStationActions: Action[] = stationActionsFromDb.filter((actionDb) => {
          const found = stationActions.some((stationAction) => {
            return stationAction.uuid === actionDb.uuid;
          });
          return !found;
        });
        // take array of deleted actions and delete them in the db
        for (const deletedAction of deletedStationActions) {
          const actionDeleteResponse = await httpClient_action.deleteAction(deletedAction.uuid);
          if (actionDeleteResponse.status !== "success") {
            throw new Error("Error deleting station actions " + actionDeleteResponse.message);
          }
        }

        // update the store copy of the db with a fresh copy from the DB
        const actionData = await httpClient_action.getActions({
          stationUuid: selectedStation.uuid,
        });
        if (actionData.data) {
          dispatch(upsertActionsFromDb(actionData.data));
        }
      }

      dispatch(setStationEditMode({ stationUuid: selectedStation.uuid, editMode: false }));
    }
  };

  const handleDelete = async () => {
    if (selectedStation) {
      // if the selected station is in stationsFromDb then delete it from the db
      if (selectedStationFromDb) {
        // delete actions from the db via internal api call
        for (const actionToDelete of stationActions) {
          const actionDeleteResponse: WrappedResponse<number> =
            await httpClient_action.deleteAction(actionToDelete.uuid);
          if (actionDeleteResponse.status !== "success") {
            throw new Error("Error deleting actions for station " + actionDeleteResponse.message);
          }
        }
        // delete actions from the store
        dispatch(deleteActions(stationActions));
        // update store copy of the db with a fresh copy of actions for this mission from the db
        const actionData = await httpClient_action.getActions({ missionId: selectedMissionId });
        if (actionData.data) {
          dispatch(deleteAllActionsFromDb());
          dispatch(upsertActionsFromDb(actionData.data));
        }

        // delete the Station from the DB via internal API call
        const deleteResponse: WrappedResponse<number> = await httpClient_station.deleteStation(
          selectedStation.uuid
        );
        if (deleteResponse.status === "success") {
          // remove the corresponding Station from the store
          dispatch(deleteStation(selectedStation));
          dispatch(setSelectedStationUuid(null));

          // get fresh copy of Stations from DB
          const stationData = await httpClient_station.getStations(selectedMissionId);
          if (stationData.data) {
            dispatch(deleteAllStationsFromDb());
            dispatch(upsertStationsFromDb(stationData.data));
          }
        } else {
          console.error("Error deleting Station: " + deleteResponse.message);
        }
      } else {
        // if the selected station is not in stationsFromDb then delete it from the store
        dispatch(deleteStation(selectedStation));
        dispatch(setSelectedStationUuid(null));
        dispatch(deleteActions(stationActions));
      }

      dispatch(setStationEditMode({ stationUuid: selectedStation.uuid, editMode: false }));
    }
  };

  const handleCancel = () => {
    if (selectedStationFromDb) {
      // station is already saved once to the db, replace it with the one from the db (undoing any changes)
      dispatch(upsertStation(selectedStationFromDb));
      dispatch(upsertActions(stationActionsFromDb));

      //delete newly added actions that user doesn't want to save
      const addedActionsToDelete: Action[] = stationActions.filter(
        // only delete actions that don't exist in the db
        (action) =>
          stationActionsFromDb.findIndex((actionDb) => actionDb.uuid === action.uuid) === -1
      );
      dispatch(deleteActions(addedActionsToDelete));
    } else {
      // station hasn't been saved to the db. delete the station and actions from the store
      dispatch(deleteStation(selectedStation));
      dispatch(setSelectedStationUuid(null));
      dispatch(deleteActions(stationActions));
    }
    dispatch(setStationEditMode({ stationUuid: selectedStation.uuid, editMode: false }));
  };

  let ActiveComponent = null;
  if (!_.isNil(panelTypes[selectedRightNavItem])) {
    ActiveComponent = panelTypes[selectedRightNavItem].panel;
  }

  return (
    selectedStation && (
      <>
        <div className={paneStyles.rightTopTitle}>
          <div className={paneStyles.rightTopTitleText} style={{ color: "var(--station)" }}>
            <InLineEditInput
              fieldName="Station"
              value={selectedStation.name}
              editing={stationsEditing.includes(selectedStationUuid)}
              maxLength={255}
              styleInput={{
                width: "100%",
                marginRight: "10px",
                color: "var(--station)",
                fontSize: "1em",
              }}
              styleValue={{ padding: 0, height: "auto" }}
              containerStyle={{ paddingLeft: 0 }}
              onChange={(val) => {
                dispatch(upsertStation({ ...selectedStation, name: val }));
              }}
            />
          </div>
        </div>
        <div className={paneStyles.rightSubTray}>
          <div className={paneStyles.rightIconRow}>
            {Object.keys(panelTypes).map((panelType) => {
              return (
                <div
                  key={panelType}
                  className={
                    selectedRightNavItem === panelType
                      ? paneStyles.rightIconContainerSelected
                      : paneStyles.rightIconContainer
                  }
                >
                  <div
                    className={paneStyles.rightIcon}
                    style={{
                      color:
                        selectedRightNavItem === panelType ? panelTypes[panelType].color : "white",
                    }}
                    title={panelTypes[panelType].title}
                    onClick={() => dispatch(setSelectedStationRightNavItem(panelType))}
                  >
                    <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className={paneStyles.saveCancelContainer}>
            {stationsEditing.includes(selectedStationUuid) && (
              <div className={paneStyles.verticalCenter}>
                <IconButton
                  icon={faTrashAlt}
                  onClick={() => {
                    handleDelete();
                  }}
                  label="Delete Station"
                  style={{ width: "115px" }}
                />
              </div>
            )}
            {!stationsEditing.includes(selectedStationUuid) && (
              <div className={paneStyles.verticalCenter}>
                <IconButton
                  icon={faEdit}
                  onClick={() => {
                    dispatch(
                      setStationEditMode({ stationUuid: selectedStation.uuid, editMode: true })
                    );
                  }}
                  label="Edit"
                  style={{ width: "75px" }}
                />
              </div>
            )}

            {stationsEditing.includes(selectedStationUuid) && (
              <>
                <div className={paneStyles.verticalCenter}>
                  <IconButton
                    onClick={() => {
                      handleSave();
                    }}
                    icon={faFloppyDisk}
                    label="Save Station"
                    enabled={modified}
                    style={{
                      width: "105px",
                      backgroundColor: modified ? "var(--alert)" : "var(--alert-disabled)",
                      color: modified ? "white" : "var(--grey4)",
                    }}
                  />
                </div>
                <div className={paneStyles.verticalCenter}>
                  <IconButton
                    onClick={() => {
                      handleCancel();
                    }}
                    icon={faBan}
                    label="Cancel"
                    style={{ width: "75px" }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        <ActiveComponent
          className={paneStyles.rightActiveWindow}
          editMode={stationsEditing.includes(selectedStationUuid)}
        />
      </>
    )
  );
};

export default StationEditorRight;
