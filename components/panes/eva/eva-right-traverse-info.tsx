import {
  faFloppyDisk,
  faLocationDot,
  faMapLocationDot,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ContentEditableTextArea,
  IconButton,
  InLineEditInput,
  MultiButton,
} from "components/interface/_global-elements";
import { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import { upsertTraverse } from "store/traverse";
import { upsertUserMapObject } from "store/map";
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

  const userMapObject = useAppSelector(
    (state) =>
      state.map.userMapObjects.find(
        (userMapObject) => userMapObject.uuid === selectedEvaSequenceItemUuid
      ),
    shallowEqual
  );

  const mapAction = userMapObject ? userMapObject.mapAction : null;

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Traverse Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Status</div>
            <MultiButton
              editing={editMode}
              selected={selectedTraverse.status}
              handleChange={(newStatus) => {
                console.log(newStatus);
                dispatch(upsertTraverse({ ...selectedTraverse, status: newStatus }));
              }}
            >
              <button type="button">Archived</button>
              <button type="button">Candidate</button>
              <button type="button">In Review</button>
              <button type="button">Approved</button>
            </MultiButton>
          </div>
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
                      dispatch(upsertTraverse({ ...selectedTraverse, durationUpper: val }));
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
                    value={selectedTraverse.durationLower?.toString()}
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
                <div className={paneStyles.panelDisplayVal}>m</div>
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
            <div className={paneStyles.panelSectionTitle}>Location</div>

            <div className={paneStyles.panelSectionRow} style={{ marginTop: "3px", gap: "5px" }}>
              <>
                {(selectedTraverse.location || editMode) && (
                  <div className={paneStyles.verticalCenter}>
                    <FontAwesomeIcon icon={faLocationDot} />
                  </div>
                )}
                <div className={paneStyles.verticalCenter}>
                  <div className={paneStyles.panelText}>
                    {selectedTraverse.location && (
                      <>
                        {selectedTraverse.location.map((location, index) => {
                          return (
                            <div key={index}>
                              Lat: {`${location?.lat.toFixed(6)}`}
                              <br />
                              Lng: {`${location?.lng.toFixed(6)}`}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
                {editMode && mapAction === null ? (
                  <>
                    {!selectedTraverse.location ? (
                      <>
                        <IconButton
                          onClick={() => {
                            dispatch(
                              upsertUserMapObject({
                                mapItemType: "traverse",
                                uuid: selectedTraverse.uuid,
                                createdAt: new Date().toISOString(),
                                mapAction: "create",
                              })
                            );
                          }}
                          icon={faMapLocationDot}
                          label="Create Path on Map"
                          style={{ width: "130px" }}
                        />
                      </>
                    ) : (
                      <IconButton
                        onClick={() => {
                          dispatch(
                            upsertUserMapObject({
                              mapItemType: "traverse",
                              uuid: selectedTraverse.uuid,
                              createdAt: new Date().toISOString(),
                              mapAction: "edit",
                            })
                          );
                        }}
                        icon={faMapLocationDot}
                        label="Edit Path on Map"
                        style={{ width: "135px" }}
                      />
                    )}

                    <>
                      <IconButton
                        onClick={() => {
                          alert("Not implemented yet");
                        }}
                        icon={faMapLocationDot}
                        label="Reset Path"
                        style={{ width: "100px" }}
                      />
                    </>
                  </>
                ) : (
                  <div className={paneStyles.buttonPlaceholder}></div>
                )}
                {editMode && mapAction === "edit" && (
                  <>
                    <IconButton
                      onClick={() => {
                        dispatch(
                          upsertUserMapObject({
                            mapItemType: "traverse",
                            uuid: selectedTraverse.uuid,
                            createdAt: new Date().toISOString(),
                            mapAction: "saveEdit",
                          })
                        );
                      }}
                      icon={faFloppyDisk}
                      label="Save Edit"
                      style={{ width: "90px" }}
                    />
                  </>
                )}
                {editMode && mapAction === "create" && (
                  <IconButton
                    onClick={() => {
                      dispatch(
                        upsertUserMapObject({
                          mapItemType: "traverse",
                          uuid: selectedTraverse.uuid,
                          createdAt: new Date().toISOString(),
                          mapAction: "cancelCreate",
                        })
                      );
                    }}
                    icon={faXmark}
                    label="Cancel Create"
                    style={{ width: "70px" }}
                  />
                )}
                {editMode && mapAction === "edit" && (
                  <>
                    <IconButton
                      onClick={() => {
                        dispatch(
                          upsertUserMapObject({
                            mapItemType: "traverse",
                            uuid: selectedTraverse.uuid,
                            createdAt: new Date().toISOString(),
                            mapAction: "cancelEdit",
                          })
                        );
                      }}
                      icon={faXmark}
                      label="Cancel Edit"
                      style={{ width: "95px" }}
                    />
                  </>
                )}

                {!editMode && !selectedTraverse.location && (
                  <div className={paneStyles.panelText}>Location not yet set</div>
                )}
              </>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaRightTraverseInfo;
