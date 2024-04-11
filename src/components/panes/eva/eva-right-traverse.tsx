import {
  faBan,
  faCheck,
  faCircleInfo,
  faEdit,
  faFloppyDisk,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import _ from "lodash";
import { FunctionComponent } from "react";
import { useAppDispatch } from "utils/useAppDispatch";

import {
  setSelectedTraverseRightNavItem,
  setTraverseEditMode,
  upsertTraverses,
  upsertTraversesFromDb,
} from "store/traverse";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
import Info_Panel from "./eva-right-traverse-info";
import Report_Panel from "../report";
import * as httpClient_Traverse from "http-client/traverse";
import { getAlertColor, isModified } from "utils/component-helpers";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { RightTabs } from "components/interface/side-controls";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { getCalculatedFieldsByTraverse } from "store/processing/calculatedFields";

const EvaRightTraverse: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedTraverse = useAppSelector(
    (state) =>
      state.traverse.traverses.find((traverse) => traverse.uuid === selectedEvaSequenceItemUuid),
    deepEqual
  );
  const selectedTraverseFromDb = useAppSelector(
    (state) =>
      state.traverse.traversesFromDb.find(
        (traverse) => traverse.uuid === selectedEvaSequenceItemUuid
      ),
    deepEqual
  );
  const traversesEditing = useAppSelector((state) => state.traverse.traversesEditing, shallowEqual);
  const selectedRightNavItem = useAppSelector(
    (state) => state.traverse.selectedTraverseRightNavItem,
    refEqual
  );
  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === selectedTraverse.uuid),
    refEqual
  );

  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === selectedEvaSequenceItemUuid ? mapDirective : null;
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const isRexRunning = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.isRunning)?.isRunning,
    refEqual
  );

  const calculatedFields = useAppSelector(
    (state) =>
      getCalculatedFieldsByTraverse({
        traverseUuid: selectedEvaSequenceItemUuid,
        wholeStoreState: state,
      }),
    deepEqual
  );

  let saveButtonState: saveButtonState = "disabled";
  if (elevationPendingIndex > -1) {
    saveButtonState = "pending";
  } else {
    const modified = isModified([selectedTraverse], [selectedTraverseFromDb]);
    saveButtonState = modified ? "enabled" : "disabled";
  }

  const reportsTabIconColor = getAlertColor(calculatedFields?.reportItems) || "white";

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
    const persistResponse = await httpClient_Traverse.upsertTraverses(
      [
        {
          ...selectedTraverse,
          updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
        },
      ],
      isRexRunning
    );
    if (persistResponse) {
      dispatch(upsertTraverses([persistResponse.data[0]], true));
      dispatch(upsertTraversesFromDb([persistResponse.data[0]]));
    }

    // if there's an active traverse edit action, cancel it
    if (thisMapDirective?.mapAction === "editPolyline") {
      dispatch(
        thunkUpdateMapDirective({
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
        thunkUpdateMapDirective({
          ...thisMapDirective,
          mapAction: "cancelEditPolyline",
        })
      );
    }
    // revert to db version
    if (selectedTraverseFromDb) {
      dispatch(upsertTraverses([selectedTraverseFromDb], true));
    }
  };

  const handleEdit = async () => {
    dispatch(setTraverseEditMode({ uuid: selectedEvaSequenceItemUuid, editMode: true }));
  };

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
          <RightTabs
            selectedRightNavItem={selectedRightNavItem}
            panelTypes={panelTypes}
            dispatchFunction={setSelectedTraverseRightNavItem}
          />
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
