import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import {
  Dropdown,
  InLineEditInput,
  PathColorPickerMenu,
} from "components/interface/form/globalFields";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";

import { upsertEvaByField } from "store/eva";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
import { displayFormattedTotalTimeObj, makeTraverseRateString } from "utils/component-helpers";
import {
  formatNumberWithCommas,
  getDateAndTimeFromISOString,
  getISOStringFromDateAndTime,
  isISOString as isISOString,
  toDecimal,
} from "utils/formatting";
import {
  faCalculator,
  faMessage,
  faPersonThroughWindow,
  faQuestionCircle,
  faToolbox,
  faRoute,
} from "@fortawesome/free-solid-svg-icons";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { regExValidators, validators } from "components/interface/form/formValidators";
import CalculatedDwell from "../calculated-dwell";
import { decodeEmoji } from "utils/formatting";
import { getCalculatedFieldsByEva } from "store/processing/calculatedFields";
import { faClock } from "@fortawesome/free-regular-svg-icons";
import { thunkChangeIngressEgress } from "store/thunk/thunkEva";
import { selectAsPlannedStations } from "store/selectors";

type XgressData = {
  uuid: string; // uuid of the xgress station or "lander"
  icon: string;
  name: string;
};

const EvaRightEvaInfo: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid),
    deepEqual
  );
  // returns rex name if this is a rex eva, else returns null
  const rexEvaName = useAppSelector((state) => {
    const rexEvas = state.rex.rexes.map((rex) => rex.evaUuid);
    if (rexEvas.includes(selectedEvaUuid)) {
      return state.rex.rexes.find((rex) => rex.evaUuid === selectedEvaUuid)?.name || null;
    } else {
      return null;
    }
  }, refEqual);

  const missionTraverseRate = useAppSelector(
    (state) => state.mission.mission?.traverseRate,
    refEqual
  );
  const evaCalculatedFields = useAppSelector(
    (state) =>
      getCalculatedFieldsByEva({
        evaUuid: selectedEvaUuid,
        evas: state.eva.evas,
        stations: state.station.stations,
        mission: state.mission.mission,
        actions: state.action.actions,
        traverses: state.traverse.traverses,
      }),
    deepEqual
  );
  const missionEquipItems = useAppSelector(
    (state) => state.mission.mission.equipmentItems,
    shallowEqual
  );
  const stationListForXgressDropdown = useAppSelector(
    (state) =>
      selectAsPlannedStations(state)
        .filter((station) => station.location) // only show stations with locations
        .map((s) => {
          return {
            uuid: s.uuid,
            name: s.name,
          };
        }),
    deepEqual
  );

  const egressData: XgressData = useAppSelector((state) => {
    const station = state.station.stations.find(
      (station) => station.uuid === selectedEva.egressLocationUuid
    );
    const egress: XgressData = {
      uuid: selectedEva.egressLocationUuid,
      icon: station ? station.icon : "1f680", //rocket
      name: station ? station.name : "Lander",
    };
    return egress;
  }, deepEqual);

  const ingressData: XgressData = useAppSelector((state) => {
    const station = state.station.stations.find(
      (station) => station.uuid === selectedEva.ingressLocationUuid
    );
    const ingress: XgressData = {
      uuid: selectedEva.ingressLocationUuid,
      icon: station ? station.icon : "1f680", //rocket
      name: station ? station.name : "Lander",
    };
    return ingress;
  }, deepEqual);

  const [evaDate, setEvaDate] = useState(
    selectedEva.datetime?.length > 0 ? selectedEva.datetime?.split(/[T.Z]/)[0] : ""
  );
  const [evaTime, setEvaTime] = useState(
    selectedEva.datetime?.length > 0 ? selectedEva.datetime?.split(/[T.Z]/)[1] : ""
  );
  const [currentEvaUuid, setCurrentEvaUuid] = useState("");

  useEffect(() => {
    if (currentEvaUuid !== selectedEva.uuid || !editMode) {
      let parsedEvaDate = "";
      let parsedEvaTime = "";
      if (selectedEva.datetime && isISOString(selectedEva.datetime)) {
        const [date, time] = getDateAndTimeFromISOString(selectedEva.datetime);
        parsedEvaDate = date;
        parsedEvaTime = time;
      }
      setEvaDate(parsedEvaDate);
      setEvaTime(parsedEvaTime);
      setCurrentEvaUuid(selectedEva.uuid);
    } else {
      const newDatetime =
        evaDate?.length > 0 && evaTime?.length > 0 ? `${evaDate}T${evaTime}Z` : "";
      if (newDatetime !== selectedEva.datetime) {
        dispatch(upsertEvaByField(selectedEva.uuid, "datetime", newDatetime));
      }
    }
  }, [
    currentEvaUuid,
    dispatch,
    editMode,
    evaDate,
    evaTime,
    selectedEva.datetime,
    selectedEva.uuid,
  ]);

  function handleDatetimeSubmit() {
    let newDatetime = "";
    if (isISOString(`${evaDate}T${evaTime}Z`)) {
      newDatetime = getISOStringFromDateAndTime(evaDate, evaTime);
    }
    console.log(newDatetime);
    dispatch(upsertEvaByField(selectedEva.uuid, "datetime", newDatetime));
  }

  //split, sort, and pull names for each equipment item
  //get names
  const consumablesDisplay: EquipmentItemDisplay[] = [];
  evaCalculatedFields?.equipmentItems?.forEach((equipItem) => {
    //find item in mission
    const missionEquipItem = missionEquipItems?.find((item) => item.uuid === equipItem.uuid);
    if (missionEquipItem.singleUse) {
      consumablesDisplay.push({
        name: missionEquipItem.name,
        quantityUsed: equipItem.quantityUsed,
      });
    }
  });

  //sort by name
  consumablesDisplay.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  //split
  const consumablesCol1 = consumablesDisplay.slice(0, Math.ceil(consumablesDisplay.length / 2));
  const consumablesCol2 = consumablesDisplay.slice(Math.ceil(consumablesDisplay.length / 2));

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>
        EVA Information ({rexEvaName ? `${rexEvaName}` : "As Planned"})
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
            </div>
            <div className={paneStyles.descriptionContainer}>
              <WysiwygTextArea
                key={selectedEva.uuid}
                value={selectedEva.description}
                editing={editMode}
                onChange={(value) => {
                  dispatch(upsertEvaByField(selectedEva.uuid, "description", value));
                }}
              />
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faRoute}>Path</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSection2Column}>
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.displayFieldLabel}>Traverse Color:</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>
                      <PathColorPickerMenu
                        currentColor={selectedEva.traverseColor || "#03adfc"}
                        editMode={editMode}
                        updateColor={(val) => {
                          dispatch(upsertEvaByField(selectedEva.uuid, "traverseColor", val));
                        }}
                        styleContainer={{ padding: "0px 5px 0px 5px" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "3px" }}>
              <SubpanelHeading icon={faPersonThroughWindow}>Egress and Ingress</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>EVA Egress Location:</div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>EVA Ingress Location:</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldValue}>
                        {editMode ? (
                          <Dropdown
                            selected={egressData.uuid}
                            arrowStyle={{ top: "1px" }}
                            containerStyle={{
                              width: "190px",
                              marginTop: "3px",
                              marginBottom: "3px",
                            }}
                            selectStyle={{ width: "100%" }}
                            onChange={(val) => {
                              dispatch(
                                thunkChangeIngressEgress({
                                  type: "egress",
                                  evaUuid: selectedEva.uuid,
                                  newStationUuidOrLander: val,
                                })
                              );
                            }}
                            toolTip="Egress Location"
                          >
                            {rexEvaName && egressData.uuid !== "lander" ? (
                              <option value={egressData.uuid}>
                                {egressData.name} (As Executed)
                              </option>
                            ) : (
                              <></>
                            )}
                            <option value="lander">Lander</option>
                            {stationListForXgressDropdown.map((station) => {
                              return (
                                <option key={station.uuid} value={station.uuid}>
                                  {station.name}
                                </option>
                              );
                            })}
                          </Dropdown>
                        ) : (
                          <div className={evaStyles.stationWrapperRight}>
                            <div className={evaStyles.iconCustomSmall}>
                              {decodeEmoji(egressData.icon)}
                            </div>
                            <div className={evaStyles.stationNameRight}>{egressData.name}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldValue}>
                        {editMode ? (
                          <Dropdown
                            selected={ingressData.uuid}
                            arrowStyle={{ top: "1px" }}
                            containerStyle={{
                              width: "190px",
                              marginTop: "3px",
                              marginBottom: "3px",
                            }}
                            selectStyle={{ width: "100%" }}
                            onChange={(val) => {
                              dispatch(
                                thunkChangeIngressEgress({
                                  type: "ingress",
                                  evaUuid: selectedEva.uuid,
                                  newStationUuidOrLander: val,
                                })
                              );
                            }}
                            toolTip="Ingress Location"
                          >
                            {rexEvaName && ingressData.uuid !== "lander" ? (
                              <option value={ingressData.uuid}>
                                {ingressData.name} (As Executed)
                              </option>
                            ) : (
                              <></>
                            )}
                            <option value="lander">Lander</option>
                            {stationListForXgressDropdown.map((station) => {
                              return (
                                <option key={station.uuid} value={station.uuid}>
                                  {station.name}
                                </option>
                              );
                            })}
                          </Dropdown>
                        ) : (
                          <div className={evaStyles.stationWrapperRight}>
                            <div className={evaStyles.iconCustomSmall}>
                              {decodeEmoji(ingressData.icon)}
                            </div>
                            <div className={evaStyles.stationNameRight}>{ingressData.name}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>Egress Duration (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          value={selectedEva.egressDuration?.toString()}
                          editing={editMode}
                          fieldProps={{
                            name: "egressDuration",
                            ariaLabel: "Egress Duration",
                            style: { width: "55px" },
                            validators: [
                              validators.mustBeNumber,
                              validators.maxLength(3),
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
                              upsertEvaByField(selectedEva.uuid, "egressDuration", toDecimal(val))
                            );
                          }}
                          key={`${selectedEva.uuid}-egressDuration`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>Ingress Duration (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          value={selectedEva.ingressDuration?.toString()}
                          editing={editMode}
                          fieldProps={{
                            name: "ingressDuration",
                            ariaLabel: "Ingress Duration",
                            style: { width: "55px" },
                            validators: [
                              validators.mustBeNumber,
                              validators.maxLength(3),
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
                              upsertEvaByField(selectedEva.uuid, "ingressDuration", toDecimal(val))
                            );
                          }}
                          key={`${selectedEva.uuid}-ingressDuration`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "3px" }}>
              <SubpanelHeading icon={faClock}>EVA Start Time</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable} onSubmit={handleDatetimeSubmit}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}></div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          value={evaDate}
                          editing={editMode}
                          fieldProps={{
                            name: "evaDate",
                            ariaLabel: "evaDate",
                            validators: [validators.mustBeYYYYMMDD],
                            style: { width: "100px", marginRight: "5px" },
                          }}
                          styleValue={{ width: "100px" }}
                          onSubmit={(val: string) => {
                            setEvaDate(val);
                          }}
                          key={`${selectedEva.uuid}-date`}
                        />
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldLabel}>YYYY-MM-DD</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          value={evaTime}
                          editing={editMode}
                          fieldProps={{
                            name: "evaTime",
                            ariaLabel: "evaTime",
                            validators: [validators.mustBeHHMMSS],
                            style: { width: "100px", marginLeft: "5px", marginRight: "5px" },
                          }}
                          styleValue={{ width: "100px", marginLeft: "5px", marginRight: "5px" }}
                          onSubmit={(val: string) => {
                            setEvaTime(val);
                          }}
                          key={`${selectedEva.uuid}-time`}
                        />
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldLabel}>HH:MM:SS (UTC)</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "3px" }}>
              <SubpanelHeading icon={faQuestionCircle}>Estimations</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>Max Duration (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          value={selectedEva.maxDuration?.toString()}
                          editing={editMode}
                          fieldProps={{
                            name: "maxDuration",
                            ariaLabel: "Max Duration",
                            style: { width: "55px" },
                            validators: [
                              validators.mustBeNumber,
                              validators.maxLength(5),
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
                              upsertEvaByField(selectedEva.uuid, "maxDuration", toDecimal(val))
                            );
                          }}
                          key={`${selectedEva.uuid}-maxDuration`}
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
                          value={selectedEva.traverseRate?.toString()}
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
                              upsertEvaByField(selectedEva.uuid, "traverseRate", toDecimal(val))
                            );
                          }}
                          key={`${selectedEva.uuid}-traverseRate`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div style={{ color: "var(--grey5)" }} className={paneStyles.inputFieldLabel}>
                        {makeTraverseRateString(
                          selectedEva.traverseRate,
                          null,
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
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faCalculator}>Calculated Totals</SubpanelHeading>
            </div>
            {evaCalculatedFields && (
              <div className={paneStyles.panelSectionRow}>
                <div className={paneStyles.panelSection2Column}>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCellLeft}>
                        <div className={paneStyles.displayFieldLabel}>EVA Duration (mins):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div
                          className={paneStyles.displayFieldValue}
                          style={{
                            color:
                              evaCalculatedFields.totalUnassignedTime.durationLower > 0
                                ? "var(--warning)"
                                : undefined,
                          }}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-html={
                            evaCalculatedFields.totalUnassignedTime.durationLower > 0
                              ? "Crew assignments incomplete"
                              : undefined
                          }
                        >
                          {displayFormattedTotalTimeObj(evaCalculatedFields.totalEvaTime) || 0}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCellLeft}>
                        <div className={paneStyles.displayFieldLabel}>Traverse Time (mins):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {evaCalculatedFields.totalTraverseTime === 0 ? (
                            <>0</>
                          ) : (
                            evaCalculatedFields.totalTraverseTime.toFixed(0)
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCellLeft}>
                        <div className={paneStyles.displayFieldLabel}>Traverse Distance (m):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {evaCalculatedFields.totalTraverseDistanceMeters === 0 ? (
                            <>0</>
                          ) : (
                            formatNumberWithCommas(evaCalculatedFields.totalTraverseDistanceMeters)
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTable}>
                        <div className={paneStyles.panelColumnTableRow}>
                          <div className={paneStyles.panelColumnTableCellLeft}>
                            <div className={paneStyles.displayFieldLabel}>Total Ascent (m):</div>
                          </div>
                          <div className={paneStyles.panelColumnTableCell}>
                            <div className={paneStyles.displayFieldValue}>
                              {evaCalculatedFields.totalTraverseAscentDescent.totalMetersClimbed.toFixed(
                                0
                              )}
                            </div>
                          </div>
                        </div>
                        <div className={paneStyles.panelColumnTableRow}>
                          <div className={paneStyles.panelColumnTableCellLeft}>
                            <div className={paneStyles.displayFieldLabel}>Total Descent (m):</div>
                          </div>
                          <div className={paneStyles.panelColumnTableCell}>
                            <div className={paneStyles.displayFieldValue}>
                              {evaCalculatedFields.totalTraverseAscentDescent.totalMetersDescended.toFixed(
                                0
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTable}>
                    <CalculatedDwell actionsCalculatedFields={evaCalculatedFields} />
                    <div className={paneStyles.panelColumnTableRow}>&nbsp;</div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCellLeft}>
                        <div className={paneStyles.displayFieldLabel}>Number of Actions:</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {evaCalculatedFields.actionCount}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCellLeft}>
                        <div className={paneStyles.displayFieldLabel}>
                          Total Action Time (mins):
                        </div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {evaCalculatedFields.totalActionTime?.durationLower === 0 ? (
                            <>0</>
                          ) : (
                            displayFormattedTotalTimeObj(evaCalculatedFields.totalActionTime)
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCellLeft}>
                        <div className={paneStyles.displayFieldLabel}>Total Mass (g):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {evaCalculatedFields.totalMass}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faToolbox}>Consumable Equipment Totals</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  {consumablesCol1 &&
                    consumablesCol1.map((equipmentItem, index) => {
                      return (
                        <div
                          className={paneStyles.panelColumnTableRow}
                          key={`${equipmentItem.name}${index}`}
                        >
                          <div className={paneStyles.panelColumnTableCellLeft}>
                            <div className={paneStyles.displayFieldLabel}>{equipmentItem.name}</div>
                          </div>
                          <div className={paneStyles.panelColumnTableCell}>
                            <div className={paneStyles.displayFieldValue}>
                              {equipmentItem.quantityUsed ? `${equipmentItem.quantityUsed}` : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div className={paneStyles.panelColumnTable}>
                  {consumablesCol2 &&
                    consumablesCol2.map((equipmentItem, index) => {
                      return (
                        <div
                          className={paneStyles.panelColumnTableRow}
                          key={`${equipmentItem.name}${index}`}
                        >
                          <div className={paneStyles.panelColumnTableCellLeft}>
                            <div className={paneStyles.displayFieldLabel}>{equipmentItem.name}</div>
                          </div>
                          <div className={paneStyles.panelColumnTableCell}>
                            <div className={paneStyles.displayFieldValue}>
                              {equipmentItem.quantityUsed ? `${equipmentItem.quantityUsed}` : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                      <LastEdited updatedAt={selectedEva?.updatedAt} />
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

export default EvaRightEvaInfo;
