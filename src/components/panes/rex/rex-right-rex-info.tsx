import { FunctionComponent, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import styles from "./rex.module.css";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { faCirclePlay, faStopwatch } from "@fortawesome/free-solid-svg-icons";
import { upsertRexByField } from "store/rex";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBackwardFast, faPause, faPlay } from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import { Button, Dropdown, InLineEditInput } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import { thunkRexPetStartStop } from "store/thunk/thunkRex";
import PetInterval from "components/page/petInterval";
import sortBy from "lodash/sortBy";
import map from "lodash/map";

type EvaDropdownItem = {
  label: string;
  value: string;
};

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();

  const selectedRex = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.uuid === state.rex.selectedRexUuid),
    deepEqual
  );

  const evaDropdownItems: EvaDropdownItem[] = useAppSelector(
    (state) => state.eva.evas.map((eva) => ({ label: eva.name, value: eva.uuid })),
    deepEqual
  );
  const evaDropdownItemsSorted = sortBy(evaDropdownItems, (item) => item.label.toLowerCase());

  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");

  return (
    <div className={paneStyles.rightBody}>
      <PetInterval runningRex={selectedRex} rexPetTime={rexPetTime} setRexPetTime={setRexPetTime} />
      <div className={paneStyles.rightBodyTitle}>REX Information</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "6px" }}>
            <SubpanelHeading icon={faCirclePlay}>EVA Execution Status</SubpanelHeading>
          </div>
          <div className={paneStyles.panelSectionRow}>
            <div className={paneStyles.panelSection2Column}>
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.inputFieldLabel}>Select EVA:</div>
                  </div>
                  <div className={styles.evaDropdownContainer}>
                    {editMode ? (
                      <Dropdown
                        containerStyle={{ flex: "1 1 auto" }}
                        selected={selectedRex.evaUuid || ""}
                        selectStyle={{ height: "20px" }}
                        onChange={(value) => {
                          dispatch(upsertRexByField(selectedRex.uuid, "evaUuid", value));
                        }}
                      >
                        <option value="">Select EVA</option>
                        {map(evaDropdownItemsSorted, (item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Dropdown>
                    ) : (
                      <div className={styles.selectedEvaLabelRight}>
                        {evaDropdownItems.find((item) => item.value === selectedRex.evaUuid)?.label}
                      </div>
                    )}
                  </div>
                </div>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.inputFieldLabel}>Execution Status:</div>
                  </div>
                  <div className={styles.evaDropdownContainer}>
                    {editMode && selectedRex.evaUuid ? (
                      <Button
                        onClick={() => {
                          if (selectedRex.evaUuid) {
                            dispatch(
                              upsertRexByField(
                                selectedRex.uuid,
                                "isRunning",
                                !selectedRex.isRunning
                              )
                            );
                            if (selectedRex.petRunning) {
                              dispatch(
                                thunkRexPetStartStop({
                                  rexUuid: selectedRex.uuid,
                                  directive: "stop",
                                  petValue: rexPetTime,
                                })
                              );
                            }
                          } else {
                            alert("Please select an EVA to start the Real-time execution");
                          }
                        }}
                        label={selectedRex.isRunning ? "Stop EVA Execution" : "Execute EVA"}
                        style={{ width: "130px", marginTop: "10px" }}
                      />
                    ) : (
                      <div className={styles.selectedEvaLabelRight}>
                        <div className={styles.evaExecutionStatus}>
                          {selectedRex.isRunning ? "Executing" : "Not Started"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "6px" }}>
            <SubpanelHeading icon={faStopwatch}>Clocks</SubpanelHeading>
          </div>
          <div className={paneStyles.panelSectionRow}>
            <div className={paneStyles.panelSection2Column}>
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.inputFieldLabel}>Phased Elapsed Time:</div>
                  </div>
                  <div className={styles.petClockFieldContainer}>
                    <div className={paneStyles.inputFieldValue}>
                      {selectedRex.petRunning ? (
                        <div className={styles.petClockValue}>{rexPetTime}</div>
                      ) : (
                        <InLineEditInput
                          value={selectedRex.petValueAtStartStop}
                          editing={editMode}
                          fieldProps={{
                            name: "petSeconds",
                            ariaLabel: "PET Timer",
                            style: { width: "90px" },
                            validators: [validators.maxLength(9), validators.mustBeHHMMSS],
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
                      <div className={styles.clockButtons}>
                        <div className={styles.clockButtonsIcon} style={{ marginLeft: "4px" }}>
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
                          <div className={styles.clockButtonsIcon} style={{ marginLeft: "4px" }}>
                            <FontAwesomeIcon
                              icon={faBackwardFast}
                              size="sm"
                              onClick={() => {
                                if (confirm("Are you sure you want to reset the PET timer?")) {
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
                    <LastEdited updatedAt={selectedRex?.updatedAt} />
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
