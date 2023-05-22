import {
  faFloppyDisk,
  faLightbulb,
  faMessage,
  faRoute,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  InLineEditInput,
  LastEdited,
  SubpanelHeading,
} from "components/interface/_global-elements";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { upsertTraverse } from "store/traverse";
import { updateMapDirective } from "store/map";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkResetTraverse } from "store/thunk/thunkTraverse";
import { formatNumberWithCommas } from "utils/formatting";
import { WysiwygTextArea } from "components/interface/_wysiwyg";

const EvaRightTraverseInfo: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const appDispatch = useAppDispatch();
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedTraverse = useAppSelector(
    (state) =>
      state.traverse.traverses.find((traverse) => traverse.uuid === selectedEvaSequenceItemUuid),
    shallowEqual
  );

  const missionTraverseRate = useAppSelector(
    (state) => state.mission.mission?.traverseSpeed,
    refEqual
  );
  const selectedEvaTraverseRate = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid)?.traverseRate,
    refEqual
  );

  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === selectedTraverse.uuid),
    refEqual
  );

  const calculatedFields = useAppSelector(
    (state) =>
      state.traverse.calculatedFields.find(
        (calculated) => calculated.uuid === selectedTraverse.uuid
      ),
    shallowEqual
  );

  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === selectedTraverse?.uuid ? mapDirective : null;

  const [saveButtonState, setSaveButtonState] = useState<saveButtonState>("disabled");

  useEffect(() => {
    if (elevationPendingIndex > -1) {
      setSaveButtonState("pending");
    } else {
      setSaveButtonState("enabled");
    }
  }, [elevationPendingIndex]);

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

  const handlePathEdit = () => {
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

  const handlePathFinished = async () => {
    dispatch(
      updateMapDirective({
        ...mapDirective,
        mapAction: "saveEditPolyline",
      })
    );
  };

  const handleCancelPathEdit = () => {
    dispatch(
      updateMapDirective({
        ...mapDirective,
        mapAction: "cancelEditPolyline",
      })
    );
  };

  const handlePathReset = async () => {
    //reset path to stations endpoints
    appDispatch(thunkResetTraverse({ traverseUuid: selectedTraverse.uuid }));
  };

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Traverse Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
            </div>
            <div className={paneStyles.descriptionContainer}>
              <WysiwygTextArea
                value={selectedTraverse.description}
                editing={editMode}
                onChange={(value) => {
                  dispatch(
                    upsertTraverse({
                      ...selectedTraverse,
                      description: value,
                    })
                  );
                }} // handle innerHTML change
              />
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "4px" }}>
              <SubpanelHeading icon={faLightbulb}>Predicted Values</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>Nominal Duration (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          fieldName="Nominal Duration"
                          editing={editMode}
                          maxLength={3}
                          styleInput={{ width: "55px" }}
                          containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                          value={selectedTraverse.predictedDurationLower?.toString()}
                          onChange={(val) => {
                            dispatch(
                              upsertTraverse({
                                ...selectedTraverse,
                                predictedDurationLower: parseFloat(val),
                              })
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div
                        className={paneStyles.inputFieldLabel}
                        title={`${selectedEvaTraverseRate ? "EVA" : "Mission"} Default: ${
                          selectedEvaTraverseRate || missionTraverseRate
                        } km/hr`}
                      >
                        Traverse Rate (km/hr):
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          fieldName="Traverse Rate"
                          editing={editMode}
                          maxLength={3}
                          styleInput={{ width: "55px" }}
                          containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                          value={selectedTraverse.traverseRate?.toString()}
                          onChange={(val: number) => {
                            dispatch(
                              upsertTraverse({
                                ...selectedTraverse,
                                traverseRate: val,
                              })
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>Max Duration (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          fieldName="Max Duration"
                          editing={editMode}
                          maxLength={3}
                          styleInput={{ width: "55px" }}
                          containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                          value={selectedTraverse.predictedDurationUpper?.toString()}
                          onChange={(val) => {
                            dispatch(
                              upsertTraverse({
                                ...selectedTraverse,
                                predictedDurationUpper: parseFloat(val),
                              })
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faRoute}>Path</SubpanelHeading>
            </div>

            {editMode ? (
              <div className={`${paneStyles.panelSectionRow} ${paneStyles.sectionButtonRow}`}>
                <>
                  {editMode && mapAction === null ? (
                    <>
                      <Button
                        onClick={() => {
                          handlePathEdit();
                        }}
                        label="Edit Path on Map"
                        style={{ width: "115px" }}
                      />

                      <Button
                        onClick={() => {
                          handlePathReset();
                        }}
                        label="Reset Path"
                        style={{ width: "85px" }}
                      />
                    </>
                  ) : (
                    <div className={paneStyles.buttonPlaceholder} />
                  )}
                  {editMode && mapAction === "editPolyline" ? (
                    saveButtonState === "pending" ? (
                      <>
                        <span className={evaStyles.statusLoading} />
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() => {
                            handlePathFinished();
                          }}
                          icon={faFloppyDisk}
                          label="Finished"
                          style={{ width: "90px" }}
                        />

                        <Button
                          onClick={() => {
                            handleCancelPathEdit();
                          }}
                          icon={faXmark}
                          label="Cancel"
                          style={{ width: "75px" }}
                        />
                      </>
                    )
                  ) : (
                    <></>
                  )}
                </>
              </div>
            ) : (
              <div className={paneStyles.sectionButtonRowEmpty} />
            )}
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Distance (m):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {formatNumberWithCommas(calculatedFields.distanceMeters)}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Duration (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {calculatedFields.durationMinutes.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Total Ascent (m):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {calculatedFields.ascentDescent.totalMetersClimbed.toFixed(0)}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Total Descent (m):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {calculatedFields.ascentDescent.totalMetersDescended.toFixed(0)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSection2Column}>
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>
                      <LastEdited updatedAt={selectedTraverse?.updatedAt} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaRightTraverseInfo;
