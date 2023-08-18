import {
  faBan,
  faCheck,
  faCircleInfo,
  faEdit,
  faFloppyDisk,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "components/interface/form/globalFields";
import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";

import {
  setSelectedTraverseRightNavItem,
  setTraverseEditMode,
  upsertTraverse,
  upsertTraverseFromDb,
} from "store/traverse";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
import Info_Panel from "./eva-right-traverse-info";
import Report_Panel from "../report";
import * as httpClient_Traverse from "http-client/traverse";
import { updateMapDirective } from "store/map";
import { getAlertColor, isModified } from "utils/component-helpers";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";

const EvaRightTraverse: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedTraverse = useAppSelector(
    (state) =>
      state.traverse.traverses.find((traverse) => traverse.uuid === selectedEvaSequenceItemUuid),
    shallowEqual
  );
  const selectedTraverseFromDb = useAppSelector(
    (state) =>
      state.traverse.traversesFromDb.find(
        (traverse) => traverse.uuid === selectedEvaSequenceItemUuid
      ),
    shallowEqual
  );
  const traversesEditing = useAppSelector((state) => state.traverse.traversesEditing, shallowEqual);
  const selectedRightNavItem = useAppSelector(
    (state) => state.traverse.selectedTraverseRightNavItem,
    shallowEqual
  );
  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === selectedTraverse.uuid),
    refEqual
  );

  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === selectedEvaSequenceItemUuid ? mapDirective : null;
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const calculatedFields = useAppSelector(
    (state) =>
      state.traverse.calculatedFields.find(
        (calculated) => calculated.uuid === selectedTraverse.uuid
      ),
    shallowEqual
  );

  const [saveButtonState, setSaveButtonState] = useState<saveButtonState>("disabled");

  useEffect(() => {
    if (elevationPendingIndex > -1) {
      setSaveButtonState("pending");
    } else {
      const modified = isModified([selectedTraverse], [selectedTraverseFromDb]);
      setSaveButtonState(modified ? "enabled" : "disabled");
    }
  }, [elevationPendingIndex, selectedTraverse, selectedTraverseFromDb]);

  const [reportsTabIconColor, setReportsTabIconColor] = useState<string>("white");

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "Traverse Information",
      panel: <Info_Panel editMode={traversesEditing.includes(selectedEvaSequenceItemUuid)} />,
      selectedColor: "white",
      icon: faCircleInfo,
    },
    report_panel: {
      title: "Reports",
      panel: (
        <Report_Panel reportItems={calculatedFields.reportItems} reportTitle={"Traverse Report"} />
      ),
      selectedColor: !_.isNull(reportsTabIconColor) ? reportsTabIconColor : "white",
      unselectedColor: reportsTabIconColor,
      icon: calculatedFields.reportItems.length > 0 ? faTriangleExclamation : faCheck,
    },
  };

  const handleSave = async () => {
    dispatch(setTraverseEditMode({ uuid: selectedEvaSequenceItemUuid, editMode: false }));

    // save to db
    const persistResponse = await httpClient_Traverse.upsertTraverse({
      ...selectedTraverse,
      updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
    });
    if (persistResponse) {
      dispatch(upsertTraverse(persistResponse.data, true));
      dispatch(upsertTraverseFromDb(persistResponse.data));
    }

    // if there's an active traverse edit action, cancel it
    if (thisMapDirective?.mapAction === "editPolyline") {
      dispatch(
        updateMapDirective({
          ...thisMapDirective,
          mapAction: "saveEditPolyline",
        })
      );
    }
  };

  const handleCancel = async () => {
    dispatch(setTraverseEditMode({ uuid: selectedEvaSequenceItemUuid, editMode: false }));

    // if there's an active traverse edit action, cancel it
    if (thisMapDirective?.mapAction === "editPolyline") {
      dispatch(
        updateMapDirective({
          ...thisMapDirective,
          mapAction: "cancelEditPolyline",
        })
      );
    }
    // revert to db version
    if (selectedTraverseFromDb) {
      dispatch(upsertTraverse(selectedTraverseFromDb, true));
    }
  };

  const handleEdit = async () => {
    dispatch(setTraverseEditMode({ uuid: selectedEvaSequenceItemUuid, editMode: true }));
  };

  // set reports tab icon color
  useEffect(() => {
    setReportsTabIconColor(getAlertColor(calculatedFields?.reportItems));
  }, [calculatedFields]);

  let activeComponent: FunctionComponent = null;
  if (!_.isNil(panelTypes[selectedRightNavItem])) {
    activeComponent = panelTypes[selectedRightNavItem].panel;
  }

  return (
    selectedTraverse && (
      <>
        <div className={paneStyles.rightTopTitle}>
          <div className={paneStyles.rightTopTitleText} style={{ color: "var(--eva)" }}>
            {selectedTraverse.name}
          </div>
        </div>
        <div className={paneStyles.rightSubTray}>
          <div className={paneStyles.rightIconRow}>
            {panelTypes &&
              Object.keys(panelTypes).map((panelType) => {
                const unselectedColor = _.has(panelTypes[panelType], "unselectedColor")
                  ? panelTypes[panelType].unselectedColor
                  : "white";
                return (
                  <div
                    key={panelType}
                    className={
                      selectedRightNavItem === panelType
                        ? paneStyles.rightIconContainerSelectedTraverse
                        : paneStyles.rightIconContainer
                    }
                    onClick={() => dispatch(setSelectedTraverseRightNavItem(panelType))}
                  >
                    <div
                      className={paneStyles.rightIcon}
                      style={{
                        color:
                          selectedRightNavItem === panelType
                            ? panelTypes[panelType].selectedColor
                            : unselectedColor,
                      }}
                      data-tooltip-id="aegis-tooltip"
                      data-tooltip-html={panelTypes[panelType].title}
                    >
                      <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
                    </div>
                  </div>
                );
              })}
          </div>
          <div className={paneStyles.saveCancelContainer}>
            {!traversesEditing.includes(selectedEvaSequenceItemUuid) && editPerms && (
              <Button
                icon={faEdit}
                onClick={() => {
                  handleEdit();
                }}
                label="Edit"
                toolTip="Edit Traverse"
                style={{ width: "60px", fontSize: "0.9em" }}
                labelStyle={{ marginTop: "2px" }}
              />
            )}

            {traversesEditing.includes(selectedEvaSequenceItemUuid) ? (
              saveButtonState === "pending" ? (
                <>
                  <span className={evaStyles.statusLoading} />
                </>
              ) : (
                <>
                  <Button
                    onClick={() => {
                      if (saveButtonState === "enabled") {
                        handleSave();
                      }
                    }}
                    icon={faFloppyDisk}
                    toolTip={`Save Traverse${
                      saveButtonState === "enabled" ? "" : " (nothing to save)"
                    }`}
                    enabled={saveButtonState === "enabled"}
                    style={{
                      width: "30px",
                      backgroundColor:
                        saveButtonState === "enabled" ? "var(--alert)" : "var(--alert-disabled)",
                      color: saveButtonState === "enabled" ? "white" : "var(--grey4)",
                      fontSize: "0.9em",
                      paddingLeft: "10px",
                    }}
                  />
                  <Button
                    onClick={() => {
                      handleCancel();
                    }}
                    icon={faBan}
                    toolTip="Cancel Edit"
                    style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
                  />
                </>
              )
            ) : (
              <></>
            )}
          </div>
        </div>

        {activeComponent}
      </>
    )
  );
};

export default EvaRightTraverse;
