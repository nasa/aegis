import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faMagnifyingGlassChart,
  faPersonDigging,
  faBan,
  faFloppyDisk,
  faTrashAlt,
  faEdit,
} from "@fortawesome/free-solid-svg-icons";
import { IconButton, InLineEditInput } from "components/interface/_global-elements";
import {
  deletePoi,
  setSelectedPoiUuid,
  setSelectedRightNavItem,
  setPoiEditMode,
  upsertPoi,
  upsertPoisFromDb,
  deleteAllPoisFromDb,
} from "store/poi";
import {
  deleteActions,
  deleteActionsFromDb,
  deleteAllActionsFromDb,
  upsertActions,
  upsertActionsFromDb,
} from "store/action";

import Info_Panel from "./poi-right-info";
import Actions_Panel from "./poi-right-actions";
import Reports_Panel from "./poi-right-reports";
import * as InternalAPI from "http-client/internal-api";
import * as httpClient_action from "http-client/action";
import { upsertUserMapObject } from "store/map";

const panelTypes: PanelTypes = {
  info_panel: {
    title: "POI Information",
    panel: Info_Panel,
    color: "var(--poi)",
    icon: faCircleInfo,
  },
  actions_panel: {
    title: "POI Actions",
    panel: Actions_Panel,
    color: "var(--poi)",
    icon: faPersonDigging,
  },
  reports_panel: {
    title: "POI Reports",
    panel: Reports_Panel,
    color: "var(--poi)",
    icon: faMagnifyingGlassChart,
  },
};

const PoiEditorRight: FunctionComponent = () => {
  const dispatch = useDispatch();
  const selectedMissionId = useAppSelector((state) => state.mission.mission?.id, refEqual);
  const selectedRightNavItem = useAppSelector((state) => state.poi.selectedRightNavItem, refEqual);
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === selectedPoiUuid),
    shallowEqual
  );
  const poisEditing = useAppSelector((state) => state.poi.poisEditing, shallowEqual);
  const selectedPoiFromDb = useAppSelector(
    (state) => state.poi.poisFromDb.find((poi) => poi.uuid === selectedPoiUuid),
    shallowEqual
  );
  const userMapObjects = useAppSelector((state) => state.map.userMapObjects, shallowEqual);
  const poiActions = useAppSelector(
    (state) =>
      state.action.actions.filter((storeAction: Action) => storeAction.poiUuid === selectedPoiUuid),
    shallowEqual
  );
  const poiActionsFromDb = useAppSelector(
    (state) =>
      state.action.actionsFromDb.filter((storeAction) => storeAction.poiUuid === selectedPoiUuid),
    shallowEqual
  );

  const [modified, setModified] = useState(false);
  useEffect(() => {
    const poiEqual = _.isEqual(selectedPoi, selectedPoiFromDb);
    const actionEqual = _.isEqual(
      _.sortBy(poiActions, ["uuid"]),
      _.sortBy(poiActionsFromDb, ["uuid"])
    );
    setModified(!poiEqual || !actionEqual);
  }, [selectedPoi, selectedPoiFromDb, poiActions, poiActionsFromDb]);

  const handleSave = async () => {
    if (selectedPoi && modified) {
      // upsert the changed POI to the DB via internal API call
      const poiUpsertResponse = await InternalAPI.setPOI(selectedPoi);

      if (poiUpsertResponse.status === "success") {
        // upsert the changed POI to the store
        dispatch(upsertPoi(poiUpsertResponse.data));
        // update the POI in the store with a  fresh copy of POIs from DB
        const poiData = await InternalAPI.getPOIs(selectedMissionId);
        if (poiData.data) {
          dispatch(deleteAllPoisFromDb());
          dispatch(upsertPoisFromDb(poiData.data));
        }
      } else {
        throw new Error("Error upserting POI: " + poiUpsertResponse.message);
      }

      // find out if the actions in this poi have been modified and need to be persisted
      const actionsModified = !_.isEqual(poiActions, poiActionsFromDb);
      if (actionsModified) {
        //upsert Actions to db
        const upsertedPoiActions: Action[] = [];
        for (const actionToUpsert of poiActions) {
          const actionUpsertResponse = await httpClient_action.upsertAction(actionToUpsert);
          if (actionUpsertResponse.status !== "success") {
            throw new Error("Error upserting poi actions " + actionUpsertResponse.message);
          } else {
            upsertedPoiActions.push(actionUpsertResponse.data);
          }
        }
        // upsert the changed Action (with new updated dates) to the store
        dispatch(upsertActions(upsertedPoiActions));

        // clear the store copy of the db
        dispatch(deleteActionsFromDb(poiActionsFromDb));
        // filter out deleted actions using local state
        const deletedStationActions: Action[] = poiActionsFromDb.filter((actionDb) => {
          const found = poiActions.some((poiAction) => {
            return poiAction.uuid === actionDb.uuid;
          });
          return !found;
        });
        // take array of deleted actions and delete them in the db
        for (const deletedAction of deletedStationActions) {
          const actionDeleteResponse = await httpClient_action.deleteAction(deletedAction.uuid);
          if (actionDeleteResponse.status !== "success") {
            throw new Error("Error deleting poi actions " + actionDeleteResponse.message);
          }
        }

        // update the store copy of the db with a fresh copy from the DB
        const actionData = await httpClient_action.getActions({
          poiUuid: selectedPoi.uuid,
        });
        if (actionData.data?.length > 0) {
          dispatch(upsertActionsFromDb(actionData.data));
        }
      }

      dispatch(setPoiEditMode({ poiUuid: selectedPoiUuid, editMode: false }));
    }
  };

  const handleDelete = async () => {
    if (selectedPoi) {
      // if the selected poi is in poisFromDb then delete it from the db
      if (selectedPoiFromDb) {
        // delete actions from the db via internal api call
        for (const actionToDelete of poiActions) {
          const actionDeleteResponse: WrappedResponse<number> =
            await httpClient_action.deleteAction(actionToDelete.uuid);
          if (actionDeleteResponse.status !== "success") {
            throw new Error("Error deleting actions for poi " + actionDeleteResponse.message);
          }
        }
        // delete actions from the store
        dispatch(deleteActions(poiActions));
        // update store copy of the db with a fresh copy of actions for this mission from the db
        const actionData = await httpClient_action.getActions({ missionId: selectedMissionId });
        if (actionData.data) {
          dispatch(deleteAllActionsFromDb());
          dispatch(upsertActionsFromDb(actionData.data));
        }

        // delete the POI from the DB via internal API call
        const deleteResponse = await InternalAPI.deletePOI(selectedPoi.uuid);
        if (deleteResponse.status === "success") {
          // remove the corresponding POI from the store
          dispatch(deletePoi(selectedPoi));
          dispatch(setSelectedPoiUuid(null));

          // get fresh copy of POIs from DB
          const poiData = await InternalAPI.getPOIs(selectedMissionId);
          if (poiData.data) {
            dispatch(deleteAllPoisFromDb());
            dispatch(upsertPoisFromDb(poiData.data));
          }
        } else {
          console.error("Error deleting POI: " + deleteResponse.message);
        }
      } else {
        // if the selected poi is not in poisFromDb then delete it from the store
        dispatch(deletePoi(selectedPoi));
        dispatch(setSelectedPoiUuid(null));
        dispatch(deleteActions(poiActions));
      }

      // find out if this poi is already on the map
      const existingUserMapObject = userMapObjects.find(
        (userMapObject) => userMapObject.uuid === selectedPoi.uuid
      );
      // if the poi is on the map (is in userMapObjects), delete it
      if (existingUserMapObject) {
        dispatch(
          upsertUserMapObject({
            ...existingUserMapObject,
            mapAction: "delete",
          })
        );
      }
      dispatch(setPoiEditMode({ poiUuid: selectedPoiUuid, editMode: false }));
    }
  };

  const handleCancel = () => {
    // find out if this poi is already on the map
    const existingUserMapObject = userMapObjects.find(
      (userMapObject) => userMapObject.uuid === selectedPoi.uuid
    );
    if (selectedPoiFromDb) {
      // if selected poi is in the db, replace it with the one from the db (undoing any changes)
      dispatch(upsertPoi(selectedPoiFromDb));
      dispatch(upsertActions(poiActionsFromDb));

      //delete newly added actions that user doesn't want to save
      const addedActionsToDelete: Action[] = poiActions.filter(
        // only delete actions that don't exist in the db
        (action) => poiActionsFromDb.findIndex((actionDb) => actionDb.uuid === action.uuid) === -1
      );
      dispatch(deleteActions(addedActionsToDelete));

      // if the poi is on the map (is in userMapObjects), update its location
      if (existingUserMapObject) {
        dispatch(
          upsertUserMapObject({
            ...existingUserMapObject,
            mapAction: "refreshLocation",
          })
        );
      }
    } else {
      // if selected poi isn't in the db, delete it from the store
      dispatch(deletePoi(selectedPoi));
      dispatch(setSelectedPoiUuid(null));
      dispatch(deleteActions(poiActions));

      // if the poi is on the map (is in userMapObjects), delete it
      if (existingUserMapObject) {
        dispatch(
          upsertUserMapObject({
            ...existingUserMapObject,
            mapAction: "delete",
          })
        );
      }
    }
    dispatch(setPoiEditMode({ poiUuid: selectedPoiUuid, editMode: false }));
  };

  let ActiveComponent = null;
  if (!_.isNil(panelTypes[selectedRightNavItem])) {
    ActiveComponent = panelTypes[selectedRightNavItem].panel;
  }

  return (
    selectedPoi && (
      <>
        <div className={paneStyles.rightTopTitle}>
          <div className={paneStyles.rightTopTitleText} style={{ color: "var(--poi)" }}>
            <InLineEditInput
              fieldName="POI"
              value={selectedPoi.name}
              editing={poisEditing.includes(selectedPoiUuid)}
              maxLength={255}
              styleInput={{
                width: "100%",
                marginRight: "10px",
                color: "var(--poi)",
                fontSize: "1em",
              }}
              containerStyle={{ paddingLeft: 0 }}
              onChange={(val) => {
                dispatch(upsertPoi({ ...selectedPoi, name: val }));
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
                    onClick={() => dispatch(setSelectedRightNavItem(panelType))}
                  >
                    <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className={paneStyles.saveCancelContainer}>
            {poisEditing.includes(selectedPoiUuid) && (
              <div className={paneStyles.verticalCenter}>
                <IconButton
                  icon={faTrashAlt}
                  onClick={() => {
                    handleDelete();
                  }}
                  label="Delete POI"
                  style={{ width: "95px" }}
                />
              </div>
            )}
            {!poisEditing.includes(selectedPoiUuid) && (
              <div className={paneStyles.verticalCenter}>
                <IconButton
                  icon={faEdit}
                  onClick={() => {
                    dispatch(setPoiEditMode({ poiUuid: selectedPoiUuid, editMode: true }));
                  }}
                  label="Edit"
                  style={{ width: "65px" }}
                />
              </div>
            )}

            {poisEditing.includes(selectedPoiUuid) && (
              <>
                <div className={paneStyles.verticalCenter}>
                  <IconButton
                    onClick={() => {
                      handleSave();
                    }}
                    icon={faFloppyDisk}
                    label="Save POI"
                    enabled={modified}
                    style={{
                      width: "85px",
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
          editMode={poisEditing.includes(selectedPoiUuid)}
        />
      </>
    )
  );
};

export default PoiEditorRight;
