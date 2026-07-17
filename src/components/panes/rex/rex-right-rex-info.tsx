import type { FunctionComponent } from "react";
import { useMemo, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import rexStyles from "./rex.module.css";
import { LastEditedNumeric, SubpanelHeading } from "components/interface/_global-elements";
import { faCirclePlay, faHexagonNodes, faStopwatch } from "@fortawesome/free-solid-svg-icons";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBackwardFast, faPause, faPlay } from "@fortawesome/free-solid-svg-icons";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { Button, Checkbox } from "components/interface/form/globalFields";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import { validators } from "components/interface/form/formValidators";
import PetInterval from "components/page/petInterval";
import { applyRexPetStartStop, applyUpdateRexByField } from "client/automerge/apply/apply-rex";
import { withMissionChange } from "client/automergeDocHandles";
import { thunkDocCreateInitialPosEntries } from "store/thunk/thunkRex";
import { useMissionDocSelector } from "utils/useDocSelector";
import { setOnlyShowRunningRex } from "store/eva";
import { useAppDispatch } from "utils/useAppDispatch";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);

  const docMaps = useMissionDocSelector(
    (mission) => ({ evas: mission.evas, rexes: mission.rexes }),
    deepEqual
  );

  const selectedRex = useMemo(
    () => (selectedRexUuid ? docMaps?.rexes?.[selectedRexUuid] : undefined),
    [docMaps, selectedRexUuid]
  );

  const rexSelectedEvaDateTime = useMemo(() => {
    if (!selectedRex) return undefined;
    const dt = docMaps?.evas?.[selectedRex.evaUuid]?.datetime;
    return dt != null ? new Date(dt).toISOString() : undefined;
  }, [docMaps, selectedRex]);

  const isOtherRexRunning = useMemo(() => {
    if (!docMaps?.rexes || !selectedRexUuid) return false;
    return Object.values(docMaps.rexes).some(
      (rex) => rex.isRunning && rex.uuid !== selectedRexUuid
    );
  }, [docMaps, selectedRexUuid]);

  const [rexPetTime, setRexPetTime] = useState("");

  if (!selectedRex) return null;

  return (
    <div className={paneStyles.rightBody}>
      <PetInterval runningRex={selectedRex} rexPetTime={rexPetTime} setRexPetTime={setRexPetTime} />
      <div className={paneStyles.rightBodyTitle}>REX Information</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "6px" }}>
            <SubpanelHeading icon={faCirclePlay}>Execution Status</SubpanelHeading>
          </div>
          <div className={paneStyles.panelSectionRow}>
            <div className={paneStyles.panelSection2Column}>
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.inputFieldLabel}>Maestro Controlled:</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={rexStyles.selectedEvaLabelRight}>
                      {editMode ? (
                        <div className={rexStyles.maestroCheckboxContainer}>
                          <Checkbox
                            checked={selectedRex.maestroControlled}
                            editable={editMode}
                            onChange={(e) => {
                              withMissionChange((m) =>
                                applyUpdateRexByField(m, {
                                  rexUuid: selectedRex.uuid,
                                  fieldName: "maestroControlled",
                                  value: e.target.checked,
                                })
                              );
                            }}
                            label=""
                            labelStyle={null}
                            labelPlacement="left"
                            uniqueId="maestroCheckbox"
                          />
                        </div>
                      ) : (
                        <div>{selectedRex.maestroControlled ? "Yes" : "No"}</div>
                      )}
                    </div>
                  </div>
                </div>
                {selectedRex.maestroControlled && (
                  <>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.inputFieldLabel}>Event ID:</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={rexStyles.selectedEvaLabelRight}>
                          <div>{selectedRex.maestroEventId || "None"}</div>
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.inputFieldLabel}>Event URL:</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={rexStyles.selectedEvaLabelRight}>
                          <div>{selectedRex.maestroEventUrl || "None"}</div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                <div className={paneStyles.panelColumnTableRow} style={{ height: "2.5em" }}>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.inputFieldLabel}>Execution Status:</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    {editMode && !isOtherRexRunning ? (
                      <Button
                        onClick={() => {
                          if (selectedRex.isRunning) {
                            // If we are stopping a rex and "only show running rex" was enabled, turn it off so everything re-appears
                            dispatch(setOnlyShowRunningRex(false));

                            // If pet was running, stop it. Pet can only be running if rex is running
                            if (selectedRex.petRunning) {
                              withMissionChange((m) =>
                                applyRexPetStartStop(m, {
                                  rexUuid: selectedRex.uuid,
                                  directive: "stop",
                                  petValue: rexPetTime,
                                })
                              );
                            }
                          } else {
                            // If this is the first time we're starting this rex, add the initial pos entries
                            if (!selectedRex.posEntries || selectedRex.posEntries.length === 0) {
                              dispatch(
                                thunkDocCreateInitialPosEntries({ rexUuid: selectedRex.uuid })
                              );
                            }
                          }

                          // Toggle isRunning field
                          withMissionChange((m) =>
                            applyUpdateRexByField(m, {
                              rexUuid: selectedRex.uuid,
                              fieldName: "isRunning",
                              value: !selectedRex.isRunning,
                            })
                          );
                        }}
                        label={selectedRex.isRunning ? "Stop Execution" : "Execute EVA"}
                        style={{ width: "130px" }}
                      />
                    ) : (
                      <div className={rexStyles.selectedEvaLabelRight}>
                        <div className={rexStyles.evaExecutionStatus}>
                          {selectedRex.isRunning ? "Executing" : "Not Started"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className={paneStyles.panelDisplayVal}>
                  {editMode && isOtherRexRunning && (
                    <>Cannot start execution of this rex while another rex is running</>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.titleWithMaestro}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "6px" }}>
              <SubpanelHeading icon={faStopwatch}>Clocks</SubpanelHeading>
            </div>
            {selectedRex.maestroControlled && (
              <div className={paneStyles.maestroIcon}>
                <FontAwesomeIcon
                  icon={faHexagonNodes}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-html="Fields in this section are Maestro controlled"
                />
              </div>
            )}
          </div>
          <div className={paneStyles.panelSectionRow}>
            <div className={paneStyles.panelSection2Column}>
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.inputFieldLabel} style={{ paddingTop: 8 }}>
                      EVA Start Time:
                    </div>
                  </div>
                  <div className={rexStyles.evaDropdownContainer}>
                    <div className={rexStyles.evaExecutionStatus}>
                      <div className={rexStyles.selectedEvaLabelRight}>
                        {rexSelectedEvaDateTime || "Not Set"}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.inputFieldLabel}>Phased Elapsed Time:</div>
                  </div>
                  <div className={rexStyles.petClockFieldContainer}>
                    {selectedRex.maestroControlled ? (
                      <div style={{ fontSize: "0.8em" }}>Clock controlled by Maestro</div>
                    ) : (
                      <>
                        <div className={paneStyles.inputFieldValue}>
                          {selectedRex.petRunning ? (
                            <div className={rexStyles.petClockValue}>{rexPetTime}</div>
                          ) : (
                            <ValidatedInputField
                              value={selectedRex.petValueAtStartStop}
                              editMode={editMode}
                              fieldProps={{
                                name: "petSeconds",
                                ariaLabel: "PET Timer",
                                validators: [
                                  validators.maxLength(9),
                                  validators.mustBeHHMMSS,
                                  validators.required,
                                ],
                              }}
                              onSubmit={(val: string) => {
                                withMissionChange((m) =>
                                  applyUpdateRexByField(m, {
                                    rexUuid: selectedRex.uuid,
                                    fieldName: "petValueAtStartStop",
                                    value: val,
                                    preserveUpdatedAt: true,
                                  })
                                );
                              }}
                              styleContainer={{ width: "90px" }}
                              key="petSeconds"
                            />
                          )}
                        </div>
                        {editMode && selectedRex.isRunning && (
                          <div className={rexStyles.clockButtons}>
                            <div
                              className={rexStyles.clockButtonsIcon}
                              style={{ marginLeft: "4px" }}
                            >
                              <FontAwesomeIcon
                                icon={selectedRex.petRunning ? faPause : faPlay}
                                size="sm"
                                onClick={() => {
                                  if (selectedRex.petRunning) {
                                    withMissionChange((m) =>
                                      applyRexPetStartStop(m, {
                                        rexUuid: selectedRex.uuid,
                                        directive: "stop",
                                        petValue: rexPetTime,
                                      })
                                    );
                                  } else {
                                    withMissionChange((m) =>
                                      applyRexPetStartStop(m, {
                                        rexUuid: selectedRex.uuid,
                                        directive: "start",
                                        petValue: rexPetTime,
                                      })
                                    );
                                  }
                                }}
                              />
                            </div>
                            {!selectedRex.petRunning && (
                              <div
                                className={rexStyles.clockButtonsIcon}
                                style={{ marginLeft: "4px" }}
                              >
                                <FontAwesomeIcon
                                  icon={faBackwardFast}
                                  size="sm"
                                  onClick={() => {
                                    if (confirm("Are you sure you want to reset the PET timer?")) {
                                      withMissionChange((m) =>
                                        applyUpdateRexByField(m, {
                                          rexUuid: selectedRex.uuid,
                                          fieldName: "petValueAtStartStop",
                                          value: "+00:00:00",
                                          preserveUpdatedAt: true,
                                        })
                                      );
                                    }
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
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
                      updatedAt={selectedRex?.updatedAt}
                      createdAt={selectedRex?.createdAt}
                      infoString={`REX UUID: ${selectedRex?.uuid}`}
                    />
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
