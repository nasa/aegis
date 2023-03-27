import paneStyles from "../global-pane-styles.module.css";
import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faPersonDigging,
  faBan,
  faFloppyDisk,
  faTrashAlt,
  faEdit,
  faFlask,
} from "@fortawesome/free-solid-svg-icons";
import { IconButton, InLineEditInput } from "components/interface/_global-elements";
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
import STM_Panel from "../stm-coverage";
import * as httpClient_station from "http-client/station";
import * as httpClient_action from "http-client/action";
import { updateMapDirective } from "store/map";
import { decodeEmoji } from "utils/formatting";

const StationEditorRight: FunctionComponent = () => {
  const dispatch = useDispatch();
  const selectedMissionId = useAppSelector((state) => state.mission.mission?.id, shallowEqual);
  const selectedRightNavItem = useAppSelector(
    (state) => state.station.selectedRightNavItem,
    shallowEqual
  );
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    shallowEqual
  );
  const stationsEditing = useAppSelector((state) => state.station.stationsEditing, shallowEqual);
  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === selectedStationUuid ? mapDirective : null;

  const selectedStation = useAppSelector(
    (state) => state.station.stations.find((station) => station.uuid === selectedStationUuid),
    shallowEqual
  );
  const selectedStationFromDb = useAppSelector(
    (state) => state.station.stationsFromDb.find((station) => station.uuid === selectedStationUuid),
    shallowEqual
  );
  const stationActions = useAppSelector(
    (state) =>
      state.action.actions.filter((storeAction) => storeAction.stationUuid === selectedStationUuid),
    shallowEqual
  );
  const stationActionsFromDb = useAppSelector(
    (state) =>
      state.action.actionsFromDb.filter(
        (storeAction) => storeAction.stationUuid === selectedStationUuid
      ),
    shallowEqual
  );
  const evasUsingThisStation = useAppSelector((state) => {
    const evasUsingThisStation = [];
    state.eva.evas.forEach((eva) => {
      eva.sequence.forEach((sequenceItem) => {
        if (sequenceItem.uuid === selectedStation?.uuid) {
          evasUsingThisStation.push(eva);
        }
      });
    });
    return evasUsingThisStation;
  }, shallowEqual);
  const isAdmin = useAppSelector(
    (state) => state.user.ironSessionData?.user.permission.includes("admin"),
    refEqual
  );
  const panelTypes: PanelTypes = {
    info_panel: {
      title: "Station Information",
      panel: <Info_Panel editMode={stationsEditing.includes(selectedStationUuid)} />,
      color: "var(--station)",
      icon: faCircleInfo,
    },
    poi_panel: {
      title: "Station POIs",
      panel: <Poi_Panel editMode={stationsEditing.includes(selectedStationUuid)} />,
      color: "var(--station)",
      icon: faCircleDot,
    },
    actions_panel: {
      title: "Station Actions",
      panel: <Actions_Panel editMode={stationsEditing.includes(selectedStationUuid)} />,
      color: "var(--station)",
      icon: faPersonDigging,
    },
    stm_panel: {
      title: "Station STM Coverage",
      panel: (
        <STM_Panel
          actions={stationActions}
          mini={false}
          horizontal={false}
          uniqueKey={selectedStationUuid}
        />
      ),
      color: "var(--station)",
      icon: faFlask,
    },
  };

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

  const cancelMarkerMapDirective = () => {
    // if there's an active create or edit action, cancel it
    if (thisMapDirective?.mapAction === "createMarker") {
      dispatch(
        updateMapDirective({
          ...thisMapDirective,
          mapAction: "cancelCreateMarker",
        })
      );
    } else if (thisMapDirective?.mapAction === "editMarker") {
      dispatch(
        updateMapDirective({
          ...thisMapDirective,
          mapAction: "cancelEditMarker",
        })
      );
    }
  };

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

      // if the walkback is in edit mode, save the walkback
      if (thisMapDirective?.mapAction === "editPolyline") {
        // handle walkback edit state
        dispatch(
          updateMapDirective({
            ...thisMapDirective,
            mapAction: "saveEditPolyline",
          })
        );
      }
      cancelMarkerMapDirective();
      dispatch(setStationEditMode({ stationUuid: selectedStation.uuid, editMode: false }));
    }
  };

  const handleDelete = async () => {
    if (selectedStation) {
      if (evasUsingThisStation.length > 0) {
        alert("Cannot delete a station that is being used by an EVA");
        return;
      }

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
      cancelMarkerMapDirective();
      dispatch(setStationEditMode({ stationUuid: selectedStation.uuid, editMode: false }));
    }
  };

  const handleCancel = () => {
    // find out if this station is already on the map

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

    // if the walkback is in edit mode, save the walkback
    if (thisMapDirective?.mapAction === "editPolyline") {
      // handle walkback edit state
      dispatch(
        updateMapDirective({
          ...thisMapDirective,
          mapAction: "cancelEditPolyline",
        })
      );
    }
    cancelMarkerMapDirective();
    dispatch(setStationEditMode({ stationUuid: selectedStation.uuid, editMode: false }));
  };

  let activeComponent: FunctionComponent = null;
  if (!_.isNil(panelTypes[selectedRightNavItem])) {
    activeComponent = panelTypes[selectedRightNavItem].panel;
  }

  return (
    selectedStation && (
      <>
        <div className={paneStyles.rightTopTitle}>
          {selectedStation.icon && (
            <div className={paneStyles.rightTopTitleIcon}>{decodeEmoji(selectedStation.icon)}</div>
          )}
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
            {panelTypes &&
              Object.keys(panelTypes).map((panelType) => {
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
                          selectedRightNavItem === panelType
                            ? panelTypes[panelType].color
                            : "white",
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
              <IconButton
                icon={faTrashAlt}
                onClick={() => {
                  handleDelete();
                }}
                toolTip="Delete Station"
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
              />
            )}
            {!stationsEditing.includes(selectedStationUuid) && isAdmin && (
              <IconButton
                icon={faEdit}
                onClick={() => {
                  dispatch(
                    setStationEditMode({ stationUuid: selectedStation.uuid, editMode: true })
                  );
                }}
                label="Edit"
                toolTip="Edit Station"
                style={{ width: "60px", fontSize: "0.9em" }}
                labelStyle={{ marginTop: "2px" }}
              />
            )}

            {stationsEditing.includes(selectedStationUuid) && (
              <>
                <IconButton
                  onClick={() => {
                    handleSave();
                  }}
                  icon={faFloppyDisk}
                  toolTip={`Save Station${modified ? "" : " (nothing to save)"}`}
                  enabled={modified}
                  style={{
                    width: "30px",
                    backgroundColor: modified ? "var(--alert)" : "var(--alert-disabled)",
                    color: modified ? "white" : "var(--grey4)",
                    fontSize: "0.9em",
                    paddingLeft: "10px",
                  }}
                />
                <IconButton
                  onClick={() => {
                    handleCancel();
                  }}
                  icon={faBan}
                  toolTip="Cancel Edit"
                  style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
                />
              </>
            )}
          </div>
        </div>
        {activeComponent}
      </>
    )
  );
};

export default StationEditorRight;
