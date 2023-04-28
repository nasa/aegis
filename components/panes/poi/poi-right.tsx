import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faPersonDigging,
  faBan,
  faFloppyDisk,
  faTrashAlt,
  faEdit,
  faTriangleExclamation,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { IconButton, InLineEditInput } from "components/interface/_global-elements";
import { setSelectedPOIRightNavItem, setPoiEditMode, upsertPoi } from "store/poi";

import Info_Panel from "./poi-right-info";
import Actions_Panel from "./poi-right-actions";
import { decodeEmoji } from "utils/formatting";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkSavePoi } from "store/thunk/poi/thunkSavePoi";
import { thunkDeletePoi } from "store/thunk/poi/thunkDeletePoi";
import { thunkPoiCancel } from "store/thunk/poi/thunkPoiCancel";
import { selectPoiActions } from "store/selectors";
import Report_Panel from "../report";
import { getAlertColor } from "utils/component-helpers";

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

  const poiActions = useAppSelector(selectPoiActions(selectedPoiUuid), shallowEqual);
  const poiActionsFromDb = useAppSelector(
    (state) =>
      state.action.actionsFromDb.filter((storeAction) => storeAction.poiUuid === selectedPoiUuid),
    shallowEqual
  );
  const isAdmin = useAppSelector(
    (state) => state.user.ironSessionData?.user.permission.includes("admin"),
    refEqual
  );

  const calculatedFields = useAppSelector(
    (state) => state.poi.calculatedFields.find((calculated) => calculated.uuid === selectedPoiUuid),
    shallowEqual
  );

  const [modified, setModified] = useState(false);
  const [reportsTabIconColor, setReportsTabIconColor] = useState<string>("var(--station)");

  useEffect(() => {
    const poiEqual = _.isEqual(selectedPoi, selectedPoiFromDb);
    const actionEqual = _.isEqual(
      _.sortBy(poiActions, ["uuid"]),
      _.sortBy(poiActionsFromDb, ["uuid"])
    );
    setModified(!poiEqual || !actionEqual);
  }, [selectedPoi, selectedPoiFromDb, poiActions, poiActionsFromDb]);

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "POI Information",
      panel: (
        <Info_Panel
          editMode={poisEditing.includes(selectedPoiUuid)}
          totalPoiTime={calculatedFields?.totalTime}
          actionCount={calculatedFields?.actionCount}
        />
      ),
      selectedColor: "var(--poi)",
      icon: faCircleInfo,
    },
    actions_panel: {
      title: "POI Actions",
      panel: <Actions_Panel editMode={poisEditing.includes(selectedPoiUuid)} />,
      selectedColor: "var(--poi)",
      icon: faPersonDigging,
    },
    report_panel: {
      title: "Station Report",
      panel: (
        <Report_Panel reportItems={calculatedFields?.reportItems} reportTitle={"Station Report"} />
      ),
      selectedColor: !_.isNull(reportsTabIconColor) ? reportsTabIconColor : "var(--station)",
      unselectedColor: reportsTabIconColor,
      icon: calculatedFields?.reportItems.length > 0 ? faTriangleExclamation : faCheck,
    },
  };

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

  // set reports tab icon color
  useEffect(() => {
    setReportsTabIconColor(getAlertColor(calculatedFields?.reportItems));
  }, [calculatedFields]);

  let activeComponent = null;
  if (!_.isNil(panelTypes[selectedRightNavItem])) {
    activeComponent = panelTypes[selectedRightNavItem].panel;
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
              const unselectedColor = _.has(panelTypes[panelType], "unselectedColor")
                ? panelTypes[panelType].unselectedColor
                : "white";
              return (
                <div
                  key={panelType}
                  className={
                    selectedRightNavItem === panelType
                      ? paneStyles.rightIconContainerSelectedPoi
                      : paneStyles.rightIconContainer
                  }
                >
                  <div
                    className={paneStyles.rightIcon}
                    style={{
                      color:
                        selectedRightNavItem === panelType
                          ? panelTypes[panelType].selectedColor
                          : unselectedColor,
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
        {activeComponent}
      </>
    )
  );
};

export default PoiEditorRight;
