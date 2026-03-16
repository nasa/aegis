import type { FunctionComponent } from "react";
import { useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import rexStyles from "./rex.module.css";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { faCirclePlay, faHexagonNodes, faStopwatch } from "@fortawesome/free-solid-svg-icons";
import { upsertRexByField } from "store/rex";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBackwardFast, faPause, faPlay } from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual, useAppSelector, refEqual } from "utils/useAppSelector";
import { Button, Checkbox, InLineEditInput } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import { thunkRexPetStartStop } from "store/thunk/thunkRex";
import PetInterval from "components/page/petInterval";
import { thunkCreateInitialPosEntries } from "store/thunk/thunkRexPosEntry";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();

  const selectedRex = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.uuid === state.rex.selectedRexUuid),
    deepEqual
  );
  const rexSelectedEvaDateTime = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedRex?.evaUuid)?.datetime,
    deepEqual
  );
  const isOtherRexRunning = useAppSelector(
    (state) => state.rex.rexesFromDb.some((rex) => rex.isRunning && rex.uuid !== selectedRex?.uuid),
    refEqual
  );

  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");

  return (
    <>
      {selectedRex && (
        <div className={paneStyles.rightBody}>
          <PetInterval
            runningRex={selectedRex}
            rexPetTime={rexPetTime}
            setRexPetTime={setRexPetTime}
          />
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
                                  dispatch(
                                    upsertRexByField(
                                      selectedRex.uuid,
                                      "maestroControlled",
                                      e.target.checked
                                    )
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
                              dispatch(
                                upsertRexByField(
                                  selectedRex.uuid,
                                  "isRunning",
                                  !selectedRex.isRunning
                                )
                              );

                              // if this is the first time we're starting this rex, add the initial pos entries
                              if (!selectedRex.posEntries || selectedRex.posEntries.length === 0) {
                                dispatch(thunkCreateInitialPosEntries());
                              }

                              // if pet was running, stop it. Pet can only be running if rex is running
                              if (selectedRex.petRunning) {
                                dispatch(
                                  thunkRexPetStartStop({
                                    rexUuid: selectedRex.uuid,
                                    directive: "stop",
                                    petValue: rexPetTime,
                                  })
                                );
                              }
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
                                <InLineEditInput
                                  value={selectedRex.petValueAtStartStop}
                                  editing={editMode}
                                  fieldProps={{
                                    name: "petSeconds",
                                    ariaLabel: "PET Timer",
                                    style: { width: "90px" },
                                    validators: [
                                      validators.maxLength(9),
                                      validators.mustBeHHMMSS,
                                      validators.required,
                                    ],
                                    onChange: () => {},
                                  }}
                                  onSubmit={(val: string) => {
                                    dispatch(
                                      upsertRexByField(selectedRex.uuid, "petValueAtStartStop", val)
                                    );
                                  }}
                                  styleValue={{ width: "75px" }}
                                  key={`petSeconds`}
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
                                        dispatch(
                                          thunkRexPetStartStop({
                                            rexUuid: selectedRex.uuid,
                                            directive: "stop",
                                            petValue: rexPetTime,
                                          })
                                        );
                                      } else {
                                        dispatch(
                                          thunkRexPetStartStop({
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
                                        if (
                                          confirm("Are you sure you want to reset the PET timer?")
                                        ) {
                                          dispatch(
                                            upsertRexByField(
                                              selectedRex.uuid,
                                              "petValueAtStartStop",
                                              "+00:00:00"
                                            )
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
                        <LastEdited
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
      )}
    </>
  );
};

export default Info_Panel;
