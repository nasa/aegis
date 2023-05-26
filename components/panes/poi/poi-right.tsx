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
import { Button, IconDropdown, InLineEditInput } from "components/interface/_global-elements";
import { setSelectedPOIRightNavItem, setPoiEditMode, upsertPoi } from "store/poi";
import Info_Panel from "./poi-right-info";
import Actions_Panel from "./poi-right-actions";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkSavePoi, thunkDeletePoi, thunkPoiCancel } from "store/thunk/thunkPoi";
import { selectPoiActions } from "store/selectors";
import Report_Panel from "../report";
import { getAlertColor } from "utils/component-helpers";
import { useDispatch } from "react-redux";

const PoiEditorRight: FunctionComponent = () => {
  const dispatch = useDispatch();
  const thunkDispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector((state) => state.poi.selectedRightNavItem, refEqual);
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === selectedPoiUuid),
    shallowEqual
  );
  const poisEditing = useAppSelector((state) => state.poi.poisEditing, shallowEqual);
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

  //these selectors from the store are only used to calculate modified. refactor?
  const poiActions = useAppSelector(selectPoiActions(selectedPoiUuid), shallowEqual);
  const poiActionsFromDb = useAppSelector(
    (state) =>
      state.action.actionsFromDb.filter((storeAction) => storeAction.poiUuid === selectedPoiUuid),
    shallowEqual
  );
  const selectedPoiFromDb = useAppSelector(
    (state) => state.poi.poisFromDb.find((poi) => poi.uuid === selectedPoiUuid),
    shallowEqual
  );
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
      selectedColor: "white",
      icon: faCircleInfo,
    },
    actions_panel: {
      title: "POI Actions",
      panel: <Actions_Panel editMode={poisEditing.includes(selectedPoiUuid)} />,
      selectedColor: "white",
      icon: faPersonDigging,
    },
    report_panel: {
      title: "Station Report",
      panel: (
        <Report_Panel reportItems={calculatedFields?.reportItems} reportTitle={"Station Report"} />
      ),
      selectedColor: !_.isNull(reportsTabIconColor) ? reportsTabIconColor : "white",
      unselectedColor: reportsTabIconColor,
      icon: calculatedFields?.reportItems.length > 0 ? faTriangleExclamation : faCheck,
    },
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
          <IconDropdown
            selected={selectedPoi.icon}
            editing={poisEditing.includes(selectedPoiUuid)}
            setSelected={(value) => {
              dispatch(upsertPoi({ ...selectedPoi, icon: value }));
            }}
            items={["1F534", "1F535", "1F7E2", "1F7E1", "1F7E3", "1F7E0", "1F7E4", "26AB", "26AA"]}
          />

          <div className={paneStyles.rightTopTitleText} style={{ color: "var(--poi)" }}>
            <InLineEditInput
              fieldName="POI"
              value={selectedPoi.name}
              editing={poisEditing.includes(selectedPoiUuid)}
              styleInput={{
                width: "100%",
                marginRight: "10px",
                color: "var(--poi)",
                fontSize: "1em",
              }}
              styleValue={{ padding: 0, height: "auto" }}
              onSubmit={(val: string) => {
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
              <Button
                icon={faTrashAlt}
                onClick={() => {
                  if (selectedPoi) {
                    thunkDispatch(
                      thunkDeletePoi({
                        poi: selectedPoi,
                      })
                    );
                  }
                }}
                toolTip="Delete POI"
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
              />
            )}
            {!poisEditing.includes(selectedPoiUuid) && isAdmin && (
              <Button
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
                <Button
                  onClick={() => {
                    if (selectedPoi && modified) {
                      thunkDispatch(
                        thunkSavePoi({
                          poi: selectedPoi,
                        })
                      );
                    }
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
                <Button
                  onClick={() => {
                    thunkDispatch(
                      thunkPoiCancel({
                        poi: selectedPoi,
                      })
                    );
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
