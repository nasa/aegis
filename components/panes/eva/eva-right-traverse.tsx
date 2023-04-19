import { faBan, faCircleInfo, faEdit, faFloppyDisk } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconButton, InLineEditInput } from "components/interface/_global-elements";
import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
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
import * as httpClient_Traverse from "http-client/traverse";
import { updateMapDirective } from "store/map";

const EvaRightTraverse: FunctionComponent = () => {
  const dispatch = useDispatch();
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
  const isAdmin = useAppSelector(
    (state) => state.user.ironSessionData?.user.permission.includes("admin"),
    refEqual
  );
  const [saveButtonState, setSaveButtonState] = useState<saveButtonState>("disabled");

  useEffect(() => {
    if (elevationPendingIndex > -1) {
      setSaveButtonState("pending");
    } else {
      const isModified = !_.isEqual(selectedTraverse, selectedTraverseFromDb);
      setSaveButtonState(isModified ? "enabled" : "disabled");
    }
  }, [elevationPendingIndex, selectedTraverse, selectedTraverseFromDb]);

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "Traverse Information",
      panel: <Info_Panel editMode={traversesEditing.includes(selectedEvaSequenceItemUuid)} />,
      color: "var(--eva)",
      icon: faCircleInfo,
    },
  };

  const handleSave = async () => {
    dispatch(setTraverseEditMode({ uuid: selectedEvaSequenceItemUuid, editMode: false }));

    // save to db
    const persistResponse = await httpClient_Traverse.upsertTraverse(selectedTraverse);
    if (persistResponse) {
      dispatch(upsertTraverse(persistResponse.data));
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
      dispatch(upsertTraverse(selectedTraverseFromDb));
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
            <InLineEditInput
              fieldName="Traverse Name"
              value={selectedTraverse.name}
              editing={traversesEditing.includes(selectedEvaSequenceItemUuid)}
              maxLength={255}
              styleInput={{
                width: "100%",
                marginRight: "10px",
                color: "var(--eva)",
                fontSize: "1em",
              }}
              styleValue={{ padding: 0, height: "auto" }}
              containerStyle={{ paddingLeft: 0 }}
              onChange={(val: string) => {
                dispatch(upsertTraverse({ ...selectedTraverse, name: val }));
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
                        ? paneStyles.rightIconContainerSelectedTraverse
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
                      onClick={() => dispatch(setSelectedTraverseRightNavItem(panelType))}
                    >
                      <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
                    </div>
                  </div>
                );
              })}
          </div>
          <div className={paneStyles.saveCancelContainer}>
            {!traversesEditing.includes(selectedEvaSequenceItemUuid) && isAdmin && (
              <IconButton
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
                  <IconButton
                    onClick={() => {
                      handleSave();
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
                  <IconButton
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
