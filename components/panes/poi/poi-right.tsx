import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  // faMagnifyingGlassChart,
  faPersonDigging,
  faBan,
  faFloppyDisk,
  faTrashAlt,
  faEdit,
} from "@fortawesome/free-solid-svg-icons";
import { IconButton, InLineEditInput } from "components/interface/_global-elements";
import { setSelectedPOIRightNavItem, setPoiEditMode, upsertPoi } from "store/poi";

import Info_Panel from "./poi-right-info";
import Actions_Panel from "./poi-right-actions";
// import Reports_Panel from "./poi-right-reports";
import { decodeEmoji } from "utils/formatting";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkSavePoi } from "store/thunk/poi/thunkSavePoi";
import { thunkDeletePoi } from "store/thunk/poi/thunkDeletePoi";
import { thunkPoiCancel } from "store/thunk/poi/thunkPoiCancel";

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
  // reports_panel: {
  //   title: "POI Reports",
  //   panel: Reports_Panel,
  //   color: "var(--poi)",
  //   icon: faMagnifyingGlassChart,
  // },
};

const PoiEditorRight: FunctionComponent = () => {
  const dispatch = useAppDispatch();
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
  const isAdmin = useAppSelector(
    (state) => state.user.ironSessionData?.user.permission.includes("admin"),
    refEqual
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
      dispatch(
        thunkSavePoi({
          selectedPoi,
          poiActions,
          poiActionsFromDb,
          selectedPoiUuid,
        })
      );
    }
  };

  const handleDelete = async () => {
    if (selectedPoi) {
      dispatch(
        thunkDeletePoi({
          selectedPoi,
          selectedPoiFromDb,
          poiActions,
          selectedPoiUuid,
        })
      );
    }
  };

  const handleCancel = () => {
    dispatch(
      thunkPoiCancel({
        selectedPoi,
        selectedPoiFromDb,
        poiActions,
        poiActionsFromDb,
        selectedPoiUuid,
      })
    );
  };

  let ActiveComponent = null;
  if (!_.isNil(panelTypes[selectedRightNavItem])) {
    ActiveComponent = panelTypes[selectedRightNavItem].panel;
  }

  return (
    selectedPoi && (
      <>
        <div className={paneStyles.rightTopTitle}>
          {selectedPoi.icon && (
            <div className={paneStyles.rightTopTitleIcon}>{decodeEmoji(selectedPoi.icon)}</div>
          )}
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
              styleValue={{ padding: 0, height: "auto" }}
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
                    onClick={() => dispatch(setSelectedPOIRightNavItem(panelType))}
                  >
                    <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className={paneStyles.saveCancelContainer}>
            {poisEditing.includes(selectedPoiUuid) && (
              <IconButton
                icon={faTrashAlt}
                onClick={() => {
                  handleDelete();
                }}
                toolTip="Delete POI"
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
              />
            )}
            {!poisEditing.includes(selectedPoiUuid) && isAdmin && (
              <IconButton
                icon={faEdit}
                onClick={() => {
                  dispatch(setPoiEditMode({ poiUuid: selectedPoiUuid, editMode: true }));
                }}
                label="Edit"
                toolTip="Edit POI"
                style={{ width: "60px", fontSize: "0.9em" }}
                labelStyle={{ marginTop: "2px" }}
              />
            )}

            {poisEditing.includes(selectedPoiUuid) && (
              <>
                <IconButton
                  onClick={() => {
                    handleSave();
                  }}
                  icon={faFloppyDisk}
                  toolTip={`Save POI${modified ? "" : " (nothing to save)"}`}
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
        <ActiveComponent
          className={paneStyles.rightActiveWindow}
          editMode={poisEditing.includes(selectedPoiUuid)}
        />
      </>
    )
  );
};

export default PoiEditorRight;
