import {
  faFloppyDisk,
  faLightbulb,
  faMessage,
  faRoute,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { upsertTraverse } from "store/traverse";
import { updateMapDirective } from "store/map";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkResetTraverse } from "store/thunk/thunkTraverse";
import { formatNumberWithCommas, toDecimal } from "utils/formatting";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { validators, regExValidators } from "components/interface/form/formValidators";

const EvaRightTraverseInfo: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const thunkDispatch = useAppDispatch();
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
    thunkDispatch(thunkResetTraverse({ traverseUuid: selectedTraverse.uuid }));
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
                          value={selectedTraverse.predictedDurationLower?.toString()}
                          editing={editMode}
                          fieldProps={{
                            name: "predictedDurationLower",
                            ariaLabel: "Nominal Duration",
                            style: { width: "55px" },
                            validators: [
                              validators.mustBeNumber,
                              validators.maxLength(4),
                              validators.cannotContainDecimals,
                            ],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          onSubmit={(val) => {
                            dispatch(
                              upsertTraverse({
                                ...selectedTraverse,
                                predictedDurationLower: toDecimal(val),
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
                        data-tooltip-id="aegis-tooltip"
                        data-tooltip-html={`${
                          selectedEvaTraverseRate ? "EVA" : "Mission"
                        } Default: ${selectedEvaTraverseRate || missionTraverseRate} km/hr`}
                      >
                        Traverse Rate (km/hr):
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          value={selectedTraverse.traverseRate?.toString()}
                          editing={editMode}
                          fieldProps={{
                            name: "traverseRate",
                            ariaLabel: "Traverse Rate",
                            style: { width: "55px" },
                            validators: [validators.mustBeNumber, validators.maxLength(4)],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          onSubmit={(val: string) => {
                            dispatch(
                              upsertTraverse({
                                ...selectedTraverse,
                                traverseRate: toDecimal(val),
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
                          value={selectedTraverse.predictedDurationUpper?.toString()}
                          editing={editMode}
                          fieldProps={{
                            name: "predictedDurationUpper",
                            ariaLabel: "Max Duration",
                            style: { width: "55px" },
                            validators: [
                              validators.mustBeNumber,
                              validators.maxLength(4),
                              validators.cannotContainDecimals,
                            ],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          onSubmit={(val: string) => {
                            dispatch(
                              upsertTraverse({
                                ...selectedTraverse,
                                predictedDurationUpper: toDecimal(val),
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
