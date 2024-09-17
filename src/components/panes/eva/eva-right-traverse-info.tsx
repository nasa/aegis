import {
  faFloppyDisk,
  faLightbulb,
  faMessage,
  faRoute,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import {
  Button,
  InLineEditInput,
  PathColorPickerMenu,
} from "components/interface/form/globalFields";
import { FunctionComponent } from "react";
import { upsertTraverseByField } from "store/traverse";
import { refEqual, shallowEqual, deepEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkResetTraverse } from "store/thunk/thunkTraverse";
import { formatNumberWithCommas, toDecimal } from "utils/formatting";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { validators, regExValidators } from "components/interface/form/formValidators";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { makeTraverseRateString } from "utils/component-helpers";
import { getCalculatedFieldsByTraverse } from "store/processing/calculatedFields";

const EvaRightTraverseInfo: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
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
  const missionTraverseRate = useAppSelector(
    (state) => state.mission.mission?.traverseRate,
    refEqual
  );
  const selectedEvaTraverseRate = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid)?.traverseRate,
    refEqual
  );
  const selectedEvaTraverseColor = useAppSelector(
    (state) => state.eva.evas.find((e) => e.uuid === state.eva.selectedEvaUuid)?.traverseColor,
    refEqual
  );
  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === selectedTraverse.uuid),
    refEqual
  );
  const calculatedFields = useAppSelector(
    (state) =>
      getCalculatedFieldsByTraverse({
        traverseUuid: selectedTraverse.uuid,
        wholeStoreState: state,
      }),
    deepEqual
  );
  const thisMapDirective = useAppSelector((state) => {
    return state.map.mapDirective?.uuid === selectedTraverse.uuid ? state.map.mapDirective : null;
  }, shallowEqual);
  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  let saveButtonState: saveButtonState = "disabled";
  if (elevationPendingIndex > -1) {
    saveButtonState = "pending";
  } else {
    saveButtonState = "enabled";
  }

  const handlePathEdit = async () => {
    dispatch(
      thunkUpdateMapDirective({
        uuid: selectedTraverse.uuid,
        mapItemType: "traverse",
        mapAction: "editPolyline",
      })
    );
  };

  const handlePathFinished = async () => {
    dispatch(
      thunkUpdateMapDirective({
        uuid: selectedTraverse.uuid,
        mapItemType: "traverse",
        mapAction: "saveEditPolyline",
      })
    );
  };

  const handleCancelPathEdit = () => {
    dispatch(
      thunkUpdateMapDirective({
        uuid: selectedTraverse.uuid,
        mapItemType: "traverse",
        mapAction: "cancelEditPolyline",
      })
    );
  };

  const handlePathReset = async () => {
    //reset path to stations endpoints
    dispatch(thunkResetTraverse({ traverseUuid: selectedTraverse.uuid }));
  };

  const handleResetPathColor = async () => {
    dispatch(upsertTraverseByField(selectedTraverse.uuid, "color", null));
  };

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
                key={selectedTraverse.uuid}
                value={selectedTraverse.description}
                editing={editMode}
                onChange={(value: string) => {
                  dispatch(upsertTraverseByField(selectedTraverse.uuid, "description", value));
                }}
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
                              validators.mustBeInteger,
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
                              upsertTraverseByField(
                                selectedTraverse.uuid,
                                "predictedDurationLower",
                                toDecimal(val)
                              )
                            );
                          }}
                          key={`${selectedTraverse.uuid}-predictedDurationLower`}
                        />
                      </div>
                    </div>
                  </div>
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
                              validators.mustBeInteger,
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
                              upsertTraverseByField(
                                selectedTraverse.uuid,
                                "predictedDurationUpper",
                                toDecimal(val)
                              )
                            );
                          }}
                          key={`${selectedTraverse.uuid}-predictedDurationUpper`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>Traverse Rate (km/h):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          value={selectedTraverse.traverseRate?.toString()}
                          editing={editMode}
                          fieldProps={{
                            name: "traverseRate",
                            ariaLabel: "Average Traverse Rate",
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
                              upsertTraverseByField(
                                selectedTraverse.uuid,
                                "traverseRate",
                                toDecimal(val)
                              )
                            );
                          }}
                          key={`${selectedTraverse.uuid}-traverseRate`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div style={{ color: "var(--grey5)" }} className={paneStyles.inputFieldLabel}>
                        {makeTraverseRateString(
                          selectedTraverse.traverseRate,
                          selectedEvaTraverseRate,
                          missionTraverseRate
                        )}
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
                  <div className={`${paneStyles.panelColumnTableRow}`}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>
                        Path Color:
                        <br />
                        {!selectedTraverse.color && <>(Using EVA Color)</>}
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue} style={{ display: "inherit" }}>
                        <PathColorPickerMenu
                          currentColor={
                            selectedTraverse.color || selectedEvaTraverseColor || "#03adfc"
                          }
                          editMode={editMode}
                          updateColor={(val) => {
                            dispatch(upsertTraverseByField(selectedTraverse.uuid, "color", val));
                          }}
                          styleContainer={{
                            padding: "0px 5px 0px 5px",
                            width: "70px",
                          }}
                        />

                        {editMode && selectedTraverse.color && (
                          <div className={paneStyles.panelSectionRow} style={{ paddingTop: "3px" }}>
                            <Button
                              onClick={() => {
                                handleResetPathColor();
                              }}
                              label="Use EVA Color"
                              style={{ width: "100px", fontSize: "1em" }}
                              toolTip="Use the traverse color defined at the EVA level"
                            />
                          </div>
                        )}
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
