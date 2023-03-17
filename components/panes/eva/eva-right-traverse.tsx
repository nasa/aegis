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

  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === selectedEvaSequenceItemUuid ? mapDirective : null;
  const isAdmin = useAppSelector(
    (state) => state.user.ironSessionData?.user.permission.includes("admin"),
    refEqual
  );
  const [modified, setModified] = useState(false);
  useEffect(() => {
    setModified(!_.isEqual(selectedTraverse, selectedTraverseFromDb));
  }, [selectedTraverse, selectedTraverseFromDb]);

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
                        ? paneStyles.rightIconContainerSelected
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
              <div className={paneStyles.verticalCenter}>
                <IconButton
                  icon={faEdit}
                  onClick={() => {
                    handleEdit();
                  }}
                  label="Edit Traverse"
                  style={{ width: "110px" }}
                />
              </div>
            )}

            {traversesEditing.includes(selectedEvaSequenceItemUuid) && (
              <>
                <div className={paneStyles.verticalCenter}>
                  <IconButton
                    onClick={() => {
                      handleSave();
                    }}
                    icon={faFloppyDisk}
                    label="Save Traverse"
                    enabled={modified}
                    style={{
                      width: "115px",
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

        {activeComponent}
      </>
    )
  );
};

export default EvaRightTraverse;
