import {
  faCalculator,
  faFloppyDisk,
  faLightbulb,
  faMessage,
  faRoute,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { LastEditedNumeric, SubpanelHeading } from "components/interface/_global-elements";
import { Button, PathColorPickerMenu } from "components/interface/form/globalFields";
import {
  ValidatedInputField,
  ValidatedTextArea,
} from "components/interface/form/globalFieldsAutomerge";
import type { FunctionComponent } from "react";
import { useMemo } from "react";
import { setSelectedTraverseRightNavItem } from "store/traverse";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import traverseStyles from "./traverse.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDocResetTraverse } from "store/thunk/thunkTraverse";
import { formatNumberWithCommas, isNotNumber, toDecimal } from "utils/formatting";
import { validators, regExValidators } from "components/interface/form/formValidators";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { setOriginalPoints, updateMapDirective } from "store/map";
import { makeTraverseRateString } from "utils/component-helpers";
import { getCalculatedFieldsByTraverse } from "store/processing/calculatedFields";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdateTraverseByField } from "client/automerge/apply/apply-traverse";
import CalculatedDwell from "../calculated-dwell";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const missionTraverseRate = useMissionDocSelector((mission) => mission.traverseRate, refEqual);
  const usingLGRSCoordinates = useMissionDocSelector(
    (mission) => mission.usingLGRSCoordinates,
    refEqual
  );

  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const docMaps = useMissionDocSelector(
    (mission) => ({ traverses: mission.traverses, actions: mission.actions }),
    shallowEqual
  );
  const selectedTraverse = useMemo(
    () => docMaps?.traverses[selectedEvaSequenceItemUuid],
    [docMaps, selectedEvaSequenceItemUuid]
  );
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedEvaTraverseRate = useMissionDocSelector(
    (mission) => mission.evas?.[selectedEvaUuid]?.traverseRate,
    refEqual
  );
  const selectedEvaTraverseColor = useMissionDocSelector(
    (mission) => mission.evas?.[selectedEvaUuid]?.traverseColor,
    refEqual
  );
  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex(
        (uuid) => uuid === selectedEvaSequenceItemUuid
      ),
    refEqual
  );
  const traverseEvaTraverseRate = useMissionDocSelector((mission) => {
    if (!mission?.evas) return null;
    return (
      Object.values(mission.evas).find((eva) =>
        eva.sequence.some((seqItem) => seqItem.uuid === selectedEvaSequenceItemUuid)
      )?.traverseRate ?? null
    );
  }, refEqual);
  const calculatedFields = useMemo(() => {
    if (!docMaps) return undefined;
    const traverseActions = Object.values(docMaps.actions).filter(
      (a) => a.traverseUuid === selectedTraverse?.uuid && a.enabled
    );
    return getCalculatedFieldsByTraverse({
      traverse: selectedTraverse,
      missionTraverseRate,
      evaTraverseRate: traverseEvaTraverseRate,
      traverseActions,
      usingLGRSCoordinates,
    });
  }, [
    docMaps,
    selectedTraverse,
    missionTraverseRate,
    traverseEvaTraverseRate,
    usingLGRSCoordinates,
  ]);
  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = useMemo(
    () => (mapDirective?.uuid === selectedEvaSequenceItemUuid ? mapDirective : null),
    [mapDirective, selectedEvaSequenceItemUuid]
  );
  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  let saveButtonState: saveButtonState = "disabled";
  if (elevationPendingIndex > -1) {
    saveButtonState = "pending";
  } else {
    saveButtonState = "enabled";
  }

  const handlePathEdit = async () => {
    dispatch(setOriginalPoints(selectedTraverse.path));
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
    // Dispatched synchronously instead of via thunkUpdateMapDirective so the
    // 200ms delay can't let a trailing throttled drag write the edited path
    // to Automerge after the user already clicked Cancel.
    dispatch(
      updateMapDirective({
        uuid: selectedTraverse.uuid,
        mapItemType: "traverse",
        mapAction: "cancelEditPolyline",
      })
    );
  };

  const handlePathReset = async () => {
    //reset path to stations endpoints
    dispatch(thunkDocResetTraverse({ traverseUuid: selectedTraverse.uuid }));
  };

  const handleResetPathColor = async () => {
    withMissionChange((m) =>
      applyUpdateTraverseByField(m, {
        traverseUuid: selectedTraverse.uuid,
        fieldName: "color",
        value: null,
      })
    );
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
            <div className={paneStyles.fieldContainerAutomerge}>
              <ValidatedTextArea
                key={selectedTraverse.uuid}
                value={selectedTraverse.description || ""}
                editMode={editMode}
                onSubmit={(value: string) => {
                  withMissionChange((m) =>
                    applyUpdateTraverseByField(m, {
                      traverseUuid: selectedTraverse.uuid,
                      fieldName: "description",
                      value: value || "",
                    })
                  );
                }}
                fieldProps={{ name: "traverseDescription", ariaLabel: "Traverse Description" }}
              />
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "4px" }}>
              <SubpanelHeading icon={faLightbulb}>Movement Estimates</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldLabel}>Time (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <ValidatedInputField
                          value={selectedTraverse.duration?.toString()}
                          editMode={editMode}
                          fieldProps={{
                            name: "duration",
                            ariaLabel: "Duration",
                            validators: [
                              validators.mustBeNumber,
                              validators.maxLength(4),
                              validators.mustBeInteger,
                              validators.mustBeNumberGTEZero,
                            ],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          onSubmit={(val: string) => {
                            withMissionChange((m) =>
                              applyUpdateTraverseByField(m, {
                                traverseUuid: selectedTraverse.uuid,
                                fieldName: "duration",
                                value: toDecimal(val),
                              })
                            );
                          }}
                          key={`${selectedTraverse.uuid}-duration`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      {isNotNumber(selectedTraverse?.duration) && (
                        <div
                          style={{ color: "var(--grey5)" }}
                          className={paneStyles.inputFieldLabel}
                        >{`Using Calculated Total: ${Math.ceil(calculatedFields?.totalDwellTime + calculatedFields?.durationMinutes)}`}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldLabel}>Traverse Rate (km/h):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <ValidatedInputField
                          value={selectedTraverse.traverseRate?.toString()}
                          editMode={editMode}
                          fieldProps={{
                            name: "traverseRate",
                            ariaLabel: "Average Traverse Rate",
                            validators: [validators.mustBeNumber, validators.maxLength(4)],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          onSubmit={(val: string) => {
                            withMissionChange((m) =>
                              applyUpdateTraverseByField(m, {
                                traverseUuid: selectedTraverse.uuid,
                                fieldName: "traverseRate",
                                value: toDecimal(val),
                              })
                            );
                          }}
                          key={`${selectedTraverse.uuid}-traverseRate`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
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
                        <span className={traverseStyles.statusLoading} />
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
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Movement Distance (m):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {formatNumberWithCommas(calculatedFields.distanceMeters)}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Movement Time (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {Math.ceil(calculatedFields.durationMinutes)}
                      </div>
                    </div>
                  </div>
                  <div className={`${paneStyles.panelColumnTableRow}`}>
                    <div className={paneStyles.panelColumnTableCell}>
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
                            withMissionChange((m) =>
                              applyUpdateTraverseByField(m, {
                                traverseUuid: selectedTraverse.uuid,
                                fieldName: "color",
                                value: val,
                              })
                            );
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
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Total Ascent (m):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {calculatedFields.ascentDescent.totalMetersClimbed.toFixed(0)}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
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
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>&nbsp;</div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Segment Bearings:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {calculatedFields.bearings.map((bearing, index) => (
                          <span
                            key={index}
                            style={{ marginRight: "6px" }}
                          >{`${Math.round(bearing)}° `}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faCalculator}>Action Calculated Totals</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div
                    className={paneStyles.panelColumnTableRow}
                    onClick={() => {
                      dispatch(setSelectedTraverseRightNavItem("actions_panel"));
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Number of Actions:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {calculatedFields?.actionCount}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Total Action Time (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {calculatedFields?.totalActionTime === 0 ? (
                          <>0</>
                        ) : (
                          <>{Math.ceil(calculatedFields?.totalActionTime)}</>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Total Mass (g):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {calculatedFields?.totalMass}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={paneStyles.panelColumnTable}>
                  <CalculatedDwell actionsCalculatedFields={calculatedFields} />
                </div>
              </div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faCalculator}>Total</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>
                        Total Time of Actions and Movement (mins):
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {Math.ceil(
                          calculatedFields?.totalDwellTime + calculatedFields?.durationMinutes
                        )}
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
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>
                      <LastEditedNumeric
                        updatedAt={selectedTraverse?.updatedAt}
                        createdAt={selectedTraverse?.createdAt}
                        info={[
                          ["Traverse UUID", selectedTraverse?.uuid],
                          ["Traverse RefUUID", selectedTraverse?.refUuid],
                        ]}
                      />
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

export default Info_Panel;
