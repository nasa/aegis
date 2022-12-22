import paneStyles from "../global-pane-styles.module.css";
import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
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
import { RootState } from "store";
import {
  deletePoi,
  setSelectedPoiUuid,
  setSelectedRightNavItem,
  setPoiEditMode,
  upsertPoi,
  upsertPoisFromDb,
  deleteAllPoisFromDb,
} from "store/poi";
import Info_Panel from "./poi-right-info";
import Actions_Panel from "./poi-right-actions";
import { IconButton, InLineEditInput } from "components/interface/_global-elements";
import { setPOI } from "http-client/internal-api";
import * as InternalAPI from "http-client/internal-api";
import Reports_Panel from "./poi-right-reports";

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
  const poisFromDb = useSelector((state: RootState) => state.poi.poisFromDb);
  const selectedMissionId = useSelector((state: RootState) => state.mission.mission?.id);
  const selectedRightNavItem = useSelector((state: RootState) => state.poi.selectedRightNavItem);
  const selectedPoiUuid = useSelector((state: RootState) => state.poi.selectedPoiUuid);
  const selectedPoi = useSelector((state: RootState) => state.poi.pois).filter(
    (poi) => poi.uuid === selectedPoiUuid
  )[0];
  const poisEditing = useSelector((state: RootState) => state.poi.poisEditing);
  const selectedPoiFromDb = useSelector((state: RootState) => state.poi.poisFromDb).filter(
    (poi) => poi.uuid === selectedPoiUuid
  )[0];

  const [modified, setModified] = useState(false);
  useEffect(() => {
    setModified(!_.isEqual(selectedPoi, selectedPoiFromDb));
  }, [selectedPoi, selectedPoiFromDb]);

  const handleSave = async () => {
    if (selectedPoi && modified) {
      // find out if the actions in this poi have been modified and need to be persisted
      const actionsModified = !_.isEqual(selectedPoi.actions, selectedPoiFromDb?.actions);

      // upsert the changed POI to the DB via internal API call
      const upsertReponse = await setPOI(selectedPoi, actionsModified);

      if (upsertReponse.status === "success") {
        // upsert the changed POI to the store
        await dispatch(upsertPoi(upsertReponse.data));
        // update the POI in the store from the DB
        // get fresh copy of POIs from DB
        const poiData = await InternalAPI.getPOIs(selectedMissionId);
        if (poiData.data) {
          await dispatch(deleteAllPoisFromDb());
          await dispatch(upsertPoisFromDb(poiData.data));
        }
      } else {
        throw new Error("Error upserting POI: " + upsertReponse.message);
      }
      dispatch(setPoiEditMode({ poi: selectedPoi, editMode: false }));
    }
  };

  const handleDelete = async () => {
    if (selectedPoi) {
      // if the selected poi is in poisFromDb then delete it from the db

      // find the selected POI in poisFromDb
      const selectedPoiFromDb = poisFromDb.filter((poi) => poi.uuid === selectedPoi.uuid)[0];
      if (selectedPoiFromDb) {
        // delete the POI from the DB via internal API call
        const deleteResponse = await InternalAPI.deletePOI(selectedPoi.uuid);
        if (deleteResponse.status === "success") {
          // remove the corresponding POI from the store
          await dispatch(deletePoi(selectedPoi));
          dispatch(setSelectedPoiUuid(null));

          // get fresh copy of POIs from DB
          const poiData = await InternalAPI.getPOIs(selectedMissionId);
          if (poiData.data) {
            await dispatch(deleteAllPoisFromDb());
            await dispatch(upsertPoisFromDb(poiData.data));
          }
        } else {
          console.error("Error deleting POI: " + deleteResponse.message);
        }
      } else {
        // if the selected poi is not in poisFromDb then delete it from the store
        await dispatch(deletePoi(selectedPoi));
        dispatch(setSelectedPoiUuid(null));
      }
      dispatch(setPoiEditMode({ poi: selectedPoi, editMode: false }));
    }
  };

  const handleCancel = () => {
    // if selected poi isn't in the db, delete it from the store
    if (!selectedPoiFromDb) {
      dispatch(deletePoi(selectedPoi));
      dispatch(setSelectedPoiUuid(null));
    } else {
      // if selected poi is in the db, replace it with the one from the db (undoing any changes)
      dispatch(upsertPoi(selectedPoiFromDb));
    }
    dispatch(setPoiEditMode({ poi: selectedPoi, editMode: false }));
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
              style={{ width: "100%", marginRight: "10px", color: "var(--poi)", fontSize: "1em" }}
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
                    dispatch(setPoiEditMode({ poi: selectedPoi, editMode: true }));
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
