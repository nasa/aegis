import {
  faFloppyDisk,
  faMapLocationDot,
  faRoute,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ContentEditableTextArea,
  IconButton,
  InLineEditInput,
  LastEdited,
} from "components/interface/_global-elements";
import { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import { upsertTraverse } from "store/traverse";
import { updateMapDirective } from "store/map";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";

const EvaRightTraverseInfo: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
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

  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === selectedTraverse?.uuid ? mapDirective : null;

  const verifyNoActiveMapAction = (): boolean => {
    // if another mapAction is underway, fire an alert and return false

    if (mapDirective && mapDirective.mapAction !== null) {
      alert(
        "Another map action is underway. Please cancel or complete that action before creating a new one."
      );
      return false;
    } else {
      return true;
    }
  };

  const handleEdit = () => {
    if (verifyNoActiveMapAction()) {
      dispatch(
        updateMapDirective({
          uuid: selectedTraverse.uuid,
          mapItemType: "traverse",
          mapAction: "editPolyline",
        })
      );
    }
  };

  const handleSaveEdit = () => {
    dispatch(
      updateMapDirective({
        ...mapDirective,
        mapAction: "saveEditPolyline",
      })
    );
  };

  const handleCancelEdit = () => {
    dispatch(
      updateMapDirective({
        ...mapDirective,
        mapAction: "cancelEditPolyline",
      })
    );
  };

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Traverse Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Min Duration (mins)</div>
                <div className={paneStyles.inputField}>
                  <InLineEditInput
                    fieldName="Min Duration"
                    editing={editMode}
                    maxLength={3}
                    styleInput={{ width: "55px" }}
                    containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                    value={selectedTraverse.durationLower?.toString()}
                    onChange={(val: number) => {
                      dispatch(upsertTraverse({ ...selectedTraverse, durationLower: val }));
                    }}
                  />
                </div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Max Duration (mins)</div>
                <div className={paneStyles.inputField}>
                  <InLineEditInput
                    fieldName="Max Duration"
                    editing={editMode}
                    maxLength={3}
                    styleInput={{ width: "55px" }}
                    containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                    value={selectedTraverse.durationUpper?.toString()}
                    onChange={(val: number) => {
                      dispatch(upsertTraverse({ ...selectedTraverse, durationUpper: val }));
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Traverse Description</div>
            <ContentEditableTextArea
              html={selectedTraverse.description} // innerHTML of the editable div
              editing={editMode}
              onChange={(evt) => {
                dispatch(
                  upsertTraverse({
                    ...selectedTraverse,
                    description: evt.target.value,
                  })
                );
              }} // handle innerHTML change
            />
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Calculated Values</div>
            <div className={paneStyles.panelSectionRow} style={{ marginTop: "8px" }}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Traverse Distance</div>
                <div className={paneStyles.panelDisplayVal}>
                  {selectedTraverse.pathSegmentDistances
                    ?.reduce((accumulator, currentVal) => accumulator + currentVal, 0)
                    .toFixed(2)}
                  &nbsp;m
                </div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Traverse Total m Climbed</div>
                <div className={paneStyles.panelDisplayVal}>m</div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Traverse Total m Descended</div>
                <div className={paneStyles.panelDisplayVal}>m</div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Path</div>

            <div className={paneStyles.panelSectionRow} style={{ marginTop: "3px", gap: "5px" }}>
              <>
                {(selectedTraverse.path || editMode) && (
                  <div className={paneStyles.verticalCenter}>
                    <FontAwesomeIcon icon={faRoute} />
                  </div>
                )}
                <div className={paneStyles.verticalCenter}>
                  <div className={paneStyles.panelText}>
                    {selectedTraverse.path && <>{selectedTraverse.path.length}&nbsp;points</>}
                  </div>
                </div>
                {editMode && mapAction === null ? (
                  <>
                    <IconButton
                      onClick={() => {
                        handleEdit();
                      }}
                      icon={faRoute}
                      label="Edit Path on Map"
                      style={{ width: "135px" }}
                    />

                    <IconButton
                      onClick={() => {
                        alert("Not implemented yet");
                      }}
                      icon={faMapLocationDot}
                      label="Reset Path"
                      style={{ width: "100px" }}
                    />
                  </>
                ) : (
                  <div className={paneStyles.buttonPlaceholder}></div>
                )}
                {editMode && mapAction === "editPolyline" && (
                  <>
                    <IconButton
                      onClick={() => {
                        handleSaveEdit();
                      }}
                      icon={faFloppyDisk}
                      label="Finished"
                      style={{ width: "90px" }}
                    />

                    <IconButton
                      onClick={() => {
                        handleCancelEdit();
                      }}
                      icon={faXmark}
                      label="Cancel"
                      style={{ width: "75px" }}
                    />
                  </>
                )}

                {!editMode && !selectedTraverse.path && (
                  <div className={paneStyles.panelText}>Location not yet set</div>
                )}
              </>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Last Edited</div>
            <div className={paneStyles.verticalCenter}>
              <div className={paneStyles.panelText}>
                <LastEdited updatedAt={selectedTraverse?.updatedAt} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaRightTraverseInfo;
