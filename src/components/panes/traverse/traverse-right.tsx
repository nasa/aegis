import {
  faBan,
  faCheck,
  faCircleInfo,
  faEdit,
  faFloppyDisk,
  faPersonDigging,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import { FunctionComponent } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import { setSelectedTraverseRightNavItem, setTraverseEditMode } from "store/traverse";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import traverseStyles from "./traverse.module.css";
import Info_Panel from "./traverse-right-info";
import Report_Panel from "../report";
import Actions_Panel from "./traverse-right-actions";
import { getAlertColor, isModified } from "utils/component-helpers";
import { RightTabs } from "components/interface/side-controls";
import { getCalculatedFieldsByTraverse } from "store/processing/calculatedFields";
import isNull from "lodash/isNull";
import { thunkCancelTraverse, thunkSaveTraverse } from "store/thunk/thunkTraverse";

const TraverseEditorRight: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.traverse.selectedTraverseRightNavItem,
    refEqual
  );
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const traversesEditing = useAppSelector((state) => state.traverse.traversesEditing, shallowEqual);
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

  const traverseActions = useAppSelector(
    (state) =>
      state.action.actions
        .filter((storeAction) => storeAction.traverseUuid === selectedTraverse.uuid)
        .map((sa) => {
          return { uuid: sa.uuid, updatedAt: sa.updatedAt };
        }),
    deepEqual
  );
  const traverseActionsFromDb = useAppSelector(
    (state) =>
      state.action.actionsFromDb
        .filter((storeAction) => storeAction.traverseUuid === selectedTraverse.uuid)
        .map((sa) => {
          return { uuid: sa.uuid, updatedAt: sa.updatedAt };
        }),
    deepEqual
  );

  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === selectedTraverse.uuid),
    refEqual
  );

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const calculatedFields = useAppSelector(
    (state) =>
      getCalculatedFieldsByTraverse({
        traverseUuid: selectedEvaSequenceItemUuid,
        traverses: state.traverse.traverses,
        mission: state.mission.mission,
        evas: state.eva.evas,
        actions: state.action.actions,
      }),
    deepEqual
  );

  //track modified
  let saveButtonState: saveButtonState = "disabled";
  if (elevationPendingIndex > -1) {
    saveButtonState = "pending";
  } else {
    const traverseModified = isModified([selectedTraverse], [selectedTraverseFromDb]);
    const actionModified = isModified(traverseActions, traverseActionsFromDb);
    const modified = traverseModified || actionModified;
    saveButtonState = modified ? "enabled" : "disabled";
  }

  // set reports tab icon color
  const reportsTabIconColor = getAlertColor(calculatedFields?.reportItems) || "white";

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "Traverse Information",
      panel: Info_Panel,
      panelProps: {
        editMode: traversesEditing.includes(selectedEvaSequenceItemUuid),
      },
      selectedColor: "white",
      icon: faCircleInfo,
    },
    actions_panel: {
      title: "Traverse Actions",
      panel: Actions_Panel,
      panelProps: {
        editMode: traversesEditing.includes(selectedEvaSequenceItemUuid),
      },
      selectedColor: "white",
      icon: faPersonDigging,
    },
    report_panel: {
      title: "Reports",
      panel: Report_Panel,
      panelProps: {
        reportItems: calculatedFields.reportItems,
        reportTitle: "Traverse Report",
      },
      selectedColor: !isNull(reportsTabIconColor) ? reportsTabIconColor : "white",
      unselectedColor: reportsTabIconColor,
      icon: calculatedFields.reportItems.length > 0 ? faTriangleExclamation : faCheck,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ActiveComponent: FunctionComponent<any> = panelTypes[selectedRightNavItem]?.panel;

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
                  dispatch(
                    setTraverseEditMode({ uuid: selectedEvaSequenceItemUuid, editMode: true })
                  );
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
                  <span className={traverseStyles.statusLoading} />
                </>
              ) : (
                <>
                  <Button
                    onClick={() => {
                      if (saveButtonState === "enabled") {
                        dispatch(
                          thunkSaveTraverse({
                            traverseUuid: selectedTraverse.uuid,
                          })
                        );
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
                      dispatch(thunkCancelTraverse({ traverseUuid: selectedTraverse.uuid }));
                    }}
                    icon={faBan}
                    toolTip="Cancel Edit"
                    style={{ width: "30px", fontSize: "0.9em", paddingLeft: "9px" }}
                  />
                </>
              )
            ) : (
              <></>
            )}
          </div>
        </div>

        <ActiveComponent {...panelTypes[selectedRightNavItem]?.panelProps} />
      </>
    )
  );
};

export default TraverseEditorRight;
