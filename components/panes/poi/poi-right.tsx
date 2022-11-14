import paneStyles from "../global-pane-styles.module.css";
import _ from "lodash";
import { FunctionComponent } from "react";
import { useSelector, useDispatch } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faMagnifyingGlassChart,
  faPersonDigging,
  faBan,
  faFloppyDisk,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import { RootState } from "store";
import {
  deletePoi,
  setSelectedPoiUuid,
  setSelectedRightNavItem,
  upsertPoi,
  upsertPoisFromDb,
} from "store/poi";
import Info_Panel from "./poi-right-info-panel";
import { IconButton, ModifiedIndicator } from "components/interface/_global-elements";
import { setPOI } from "http-client/internal-api";
import * as InternalAPI from "http-client/internal-api";

const panelTypes: PanelTypes = {
  information_panel: {
    title: "POI Information",
    panel: Info_Panel,
    color: "var(--map)",
    icon: faCircleInfo,
  },
  activities_panel: {
    title: "POI Activities",
    panel: () => {},
    color: "var(--map)",
    icon: faPersonDigging,
  },
  reports_panel: {
    title: "POI reports",
    panel: () => {},
    color: "var(--map)",
    icon: faMagnifyingGlassChart,
  },
};

const PoiEditorRight: FunctionComponent = () => {
  const dispatch = useDispatch();
  const selectedMissionId = useSelector((state: RootState) => state.mission.mission?.id);
  const selectedRightNavItem = useSelector((state: RootState) => state.poi.selectedRightNavItem);
  const selectedPoiUuid = useSelector((state: RootState) => state.poi.selectedPoiUuid);
  const selectedPoi = useSelector((state: RootState) => state.poi.pois).filter(
    (poi) => poi.uuid === selectedPoiUuid
  )[0];
  const selectedPoiFromDb = useSelector((state: RootState) => state.poi.poisFromDb).filter(
    (poi) => poi.uuid === selectedPoiUuid
  )[0];

  const modified = !_.isEqual(selectedPoiFromDb, selectedPoi);

  const handleSave = async () => {
    if (selectedPoi) {
      // upsert the changed POI to the DB via internal API call
      const upsertedPOI = await setPOI(selectedPoi);

      if (upsertedPOI.status === "success") {
        // upsert the changed POI to the store
        await dispatch(upsertPoi(upsertedPOI.data));
        // update the POI in the store from the DB
        // get fresh copy of POIs from DB
        const poiData = await InternalAPI.getPOIs(selectedMissionId);
        if (poiData.data) {
          await dispatch(upsertPoisFromDb(poiData.data));
        }
      } else {
        throw new Error("Error upserting POI");
      }
    }
  };

  const handleDelete = async () => {
    if (selectedPoi) {
      // delete the POI from the DB via internal API call
      const deleteResponse = await InternalAPI.deletePOI(selectedPoi.uuid);
      if (deleteResponse.status === "success") {
        // remove the corresponding POI from the store
        await dispatch(deletePoi(selectedPoi));
        dispatch(setSelectedPoiUuid(null));

        // get fresh copy of POIs from DB
        const poiData = await InternalAPI.getPOIs(selectedMissionId);
        if (poiData.data) {
          await dispatch(upsertPoisFromDb(poiData.data));
        }
      } else {
        console.error("Error deleting POI: " + deleteResponse.message);
      }
    }
  };

  const handleCancel = () => {
    // replace the selected poi with the one retrieved originally from the db

    // if selected poi isn't in the db, delete it from the store
    if (!selectedPoiFromDb) {
      dispatch(deletePoi(selectedPoi));
      dispatch(setSelectedPoiUuid(null));
    } else {
      // if selected poi is in the db, replace it with the one from the db (undoing any changes)
      dispatch(upsertPoi(selectedPoiFromDb));
    }
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
            {selectedPoi.name}
          </div>
          <ModifiedIndicator
            obj1={selectedPoi}
            obj2={selectedPoiFromDb}
            style={{ width: "15", height: "15", cx: "10", cy: "8", r: "5", fill: "white" }}
          />

          <div className={paneStyles.saveCancelContainer}>
            <div className={paneStyles.verticalCenter}>
              <FontAwesomeIcon
                icon={faTrashAlt}
                style={{ marginRight: "5px", float: "right" }}
                onClick={() => {
                  handleDelete();
                }}
              />
            </div>
            {modified && (
              <>
                <IconButton
                  onClick={() => {
                    handleCancel();
                  }}
                  icon={faBan}
                  label="Discard"
                  style={{ width: "90px", height: "21px" }}
                />
                <IconButton
                  onClick={() => {
                    handleSave();
                  }}
                  icon={faFloppyDisk}
                  label="Save"
                  style={{ width: "70px", height: "21px" }}
                />
              </>
            )}
          </div>
        </div>

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
        <ActiveComponent className={paneStyles.rightActiveWindow} />
      </>
    )
  );
};

export default PoiEditorRight;
