import { LastEditedNumeric, SubpanelHeading } from "components/interface/_global-elements";
import {
  ValidatedTextArea,
  ValidatedInputField,
} from "components/interface/form/globalFieldsAutomerge";
import { Button, PathColorPickerMenu } from "components/interface/form/globalFields";
import type { FunctionComponent } from "react";
import { useEffect, useMemo, useState } from "react";

import { useAppSelector, deepEqual, refEqual, shallowEqual } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import { makeTraverseRateString } from "utils/component-helpers";
import {
  formatNumberWithCommas,
  getDateAndTimeFromISOString,
  getISOStringFromDateAndTime,
  isISOString,
  numericDatetimeToISO,
  toDecimal,
  toNumericDatetime,
} from "utils/formatting";
import {
  faCalculator,
  faMessage,
  faQuestionCircle,
  faToolbox,
  faRoute,
  faGlobe,
} from "@fortawesome/free-solid-svg-icons";
import { regExValidators, validators } from "components/interface/form/formValidators";
import { getCalcFieldsForEva } from "store/processing/calculatedFields";
import { faClock } from "@fortawesome/free-regular-svg-icons";

import { selectEvaStations, selectEvaTraverses } from "store/selectors";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdateEvaByField } from "operations/apply/apply-eva";
import { createQuickMapLinkState, isQuickMapPoint, openQuickMap } from "utils/quickMap";

const EvaRightEvaInfo: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const partialMission = useMissionDocSelector(
    (mission) => ({
      walkbackRate: mission.walkbackRate,
      traverseRate: mission.traverseRate,
      equipmentItems: mission.equipmentItems,
    }),
    deepEqual
  );

  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);

  const docMaps = useMissionDocSelector(
    (mission) => ({
      evas: mission.evas,
      rexes: mission.rexes,
      stations: mission.stations,
      actions: mission.actions,
      traverses: mission.traverses,
    }),
    shallowEqual
  );

  const selectedEva = useMemo(
    () => (selectedEvaUuid ? docMaps?.evas?.[selectedEvaUuid] : undefined),
    [docMaps, selectedEvaUuid]
  );
  const quickMapLinkState = useMissionDocSelector((mission) => {
    if (!selectedEvaUuid || !isQuickMapPoint(mission.landerLocation)) return null;
    return createQuickMapLinkState({
      center: mission.landerLocation,
      additionalPoints: [
        {
          location: mission.landerLocation,
          properties: { title: "Lander", "marker-color": "#ffffff" },
        },
      ],
      stations: selectEvaStations(mission, selectedEvaUuid),
      traverses: selectEvaTraverses(mission, selectedEvaUuid),
      defaultTraverseColor: mission.evas?.[selectedEvaUuid]?.traverseColor ?? undefined,
      time: numericDatetimeToISO(mission.evas?.[selectedEvaUuid]?.datetime) ?? undefined,
    });
  }, deepEqual);

  // Returns rex name if this is a rex eva, else returns null
  const rexEvaName = useMemo(() => {
    if (!docMaps?.rexes || !selectedEvaUuid) return null;
    const rex = Object.values(docMaps.rexes).find((r) => r.evaUuid === selectedEvaUuid);
    return rex?.name ?? null;
  }, [docMaps, selectedEvaUuid]);

  const evaCalculatedFields = useMemo(() => {
    if (!docMaps || !selectedEva) return undefined;
    const seqStationUuids = new Set(
      selectedEva.sequence.filter((s) => s.type === "station").map((s) => s.uuid)
    );
    const seqTraverseUuids = new Set(
      selectedEva.sequence.filter((s) => s.type === "traverse").map((s) => s.uuid)
    );
    return getCalcFieldsForEva({
      eva: selectedEva,
      evaStations: Object.values(docMaps.stations ?? {}).filter((s) => seqStationUuids.has(s.uuid)),
      missionWalkbackRate: partialMission.walkbackRate,
      missionTraverseRate: partialMission.traverseRate,
      evaActions: Object.values(docMaps.actions ?? {}).filter(
        (a) => seqStationUuids.has(a.stationUuid) || seqTraverseUuids.has(a.traverseUuid)
      ),
      evaTraverses: Object.values(docMaps.traverses ?? {}).filter((t) =>
        seqTraverseUuids.has(t.uuid)
      ),
    });
  }, [selectedEva, docMaps, partialMission.walkbackRate, partialMission.traverseRate]);

  const [evaDate, setEvaDate] = useState(() => {
    const iso = numericDatetimeToISO(selectedEva?.datetime);
    return iso ? iso.split("T")[0] : "";
  });
  const [evaTime, setEvaTime] = useState(() => {
    const iso = numericDatetimeToISO(selectedEva?.datetime);
    return iso ? iso.split("T")[1].replace("Z", "") : "";
  });
  const [currentEvaUuid, setCurrentEvaUuid] = useState("");

  useEffect(() => {
    if (currentEvaUuid !== selectedEva?.uuid || !editMode) {
      let parsedEvaDate = "";
      let parsedEvaTime = "";
      const isoDatetime = numericDatetimeToISO(selectedEva?.datetime);
      if (isoDatetime && isISOString(isoDatetime)) {
        const [date, time] = getDateAndTimeFromISOString(isoDatetime);
        parsedEvaDate = date;
        parsedEvaTime = time;
      }
      setEvaDate(parsedEvaDate);
      setEvaTime(parsedEvaTime);
      setCurrentEvaUuid(selectedEva?.uuid);
    } else {
      const newIso = evaDate?.length > 0 && evaTime?.length > 0 ? `${evaDate}T${evaTime}Z` : null;
      const newDatetime = toNumericDatetime(newIso);
      if (newDatetime !== selectedEva?.datetime) {
        withMissionChange((m) =>
          applyUpdateEvaByField(m, {
            evaUuid: selectedEvaUuid,
            fieldName: "datetime",
            value: newDatetime,
          })
        );
      }
    }
  }, [
    currentEvaUuid,
    editMode,
    evaDate,
    evaTime,
    selectedEva?.datetime,
    selectedEva?.uuid,
    selectedEvaUuid,
  ]);

  function handleDatetimeSubmit() {
    const isoString = `${evaDate}T${evaTime}Z`;
    const newDatetime = isISOString(isoString)
      ? toNumericDatetime(getISOStringFromDateAndTime(evaDate, evaTime))
      : null;
    withMissionChange((m) =>
      applyUpdateEvaByField(m, {
        evaUuid: selectedEvaUuid,
        fieldName: "datetime",
        value: newDatetime,
      })
    );
  }

  // Split, sort, and pull names for each equipment item
  // Get names
  const consumablesDisplay: EquipmentItemDisplay[] = [];
  Object.entries(evaCalculatedFields?.totalEquipmentItems ?? {})?.forEach(([uuid, equipItem]) => {
    const missionEquipItem = partialMission.equipmentItems?.[uuid];
    if (missionEquipItem?.singleUse) {
      consumablesDisplay.push({
        name: missionEquipItem.name,
        quantityUsed: equipItem.quantityUsed,
      });
    }
  });
  consumablesDisplay.sort((a, b) => a.name.localeCompare(b.name));
  const consumablesCol1 = consumablesDisplay.slice(0, Math.ceil(consumablesDisplay.length / 2));
  const consumablesCol2 = consumablesDisplay.slice(Math.ceil(consumablesDisplay.length / 2));

  if (!selectedEva) return null;

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
              <ValidatedTextArea
                key={selectedEva.uuid}
                value={selectedEva.description || ""}
                editMode={editMode}
                onSubmit={(value: string) => {
                  withMissionChange((m) =>
                    applyUpdateEvaByField(m, {
                      evaUuid: selectedEvaUuid,
                      fieldName: "description",
                      value: value || "",
                    })
                  );
                }}
                fieldProps={{ name: "evaDescription", ariaLabel: "EVA Description" }}
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
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldLabel}>Traverse Color:</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>
                      <PathColorPickerMenu
                        key={selectedEva.uuid}
                        currentColor={selectedEva.traverseColor || "#03adfc"}
                        editMode={editMode}
                        updateColor={(val) => {
                          withMissionChange((m) =>
                            applyUpdateEvaByField(m, {
                              evaUuid: selectedEvaUuid,
                              fieldName: "traverseColor",
                              value: val,
                            })
                          );
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
              <SubpanelHeading icon={faClock}>EVA Start Time</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable} onSubmit={handleDatetimeSubmit}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}></div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <ValidatedInputField
                          value={evaDate}
                          editMode={editMode}
                          fieldProps={{
                            name: "evaDate",
                            ariaLabel: "evaDate",
                            validators: [validators.mustBeYYYYMMDD],
                          }}
                          styleContainer={{ width: "100px", marginRight: "5px" }}
                          onSubmit={(val: string) => setEvaDate(val)}
                          key={`${selectedEva.uuid}-date`}
                        />
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldLabel}>YYYY-MM-DD</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <ValidatedInputField
                          value={evaTime}
                          editMode={editMode}
                          fieldProps={{
                            name: "evaTime",
                            ariaLabel: "evaTime",
                            validators: [validators.mustBeHHMMSS],
                          }}
                          styleContainer={{ width: "115px", marginLeft: "5px", marginRight: "5px" }}
                          onSubmit={(val: string) => setEvaTime(val)}
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
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldLabel}>Duration (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <ValidatedInputField
                          value={selectedEva.duration?.toString()}
                          editMode={editMode}
                          fieldProps={{
                            name: "Duration",
                            ariaLabel: "Duration",
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
                            withMissionChange((m) =>
                              applyUpdateEvaByField(m, {
                                evaUuid: selectedEvaUuid,
                                fieldName: "duration",
                                value: toDecimal(val),
                              })
                            );
                          }}
                          key={`${selectedEva.uuid}-duration`}
                        />
                      </div>
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
                          value={selectedEva.traverseRate?.toString()}
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
                              applyUpdateEvaByField(m, {
                                evaUuid: selectedEvaUuid,
                                fieldName: "traverseRate",
                                value: toDecimal(val),
                              })
                            );
                          }}
                          key={`${selectedEva.uuid}-traverseRate`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div style={{ color: "var(--grey5)" }} className={paneStyles.inputFieldLabel}>
                        {makeTraverseRateString(
                          selectedEva.traverseRate,
                          null,
                          partialMission.traverseRate
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
              <SubpanelHeading icon={faCalculator}>Totals</SubpanelHeading>
            </div>
            {evaCalculatedFields && (
              <div className={paneStyles.panelSectionRow}>
                <div className={paneStyles.panelSection2Column}>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div
                          className={paneStyles.displayFieldLabel}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-content="Total duration for the EVA. If a duration estimate is recorded, it will be used instead of the calculated duration based on the stations and traverses"
                        >
                          EVA Duration (mins):
                        </div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div
                          className={paneStyles.displayFieldValue}
                          style={{
                            color:
                              evaCalculatedFields.totalUnassignedTime > 0
                                ? "var(--warning)"
                                : undefined,
                          }}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-content={
                            evaCalculatedFields.totalUnassignedTime > 0
                              ? "Crew assignments incomplete"
                              : undefined
                          }
                        >
                          {Math.ceil(evaCalculatedFields.totalResolvedEvaTime) || 0}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div
                          className={paneStyles.displayFieldLabel}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-content="Total time spent on traverses. If a manual duration estimate is recorded, it will be used instead of the calculated traverse time that includes action duration"
                        >
                          Traverse Time (mins):
                        </div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {evaCalculatedFields.totalResolvedTraverseTime === 0 ? (
                            <>0</>
                          ) : (
                            Math.ceil(evaCalculatedFields.totalResolvedTraverseTime)
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div
                          className={paneStyles.displayFieldLabel}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-content="Total distance in meters traversed for this EVA"
                        >
                          Traverse Distance (m):
                        </div>
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
                          <div className={paneStyles.panelColumnTableCell}>
                            <div
                              className={paneStyles.displayFieldLabel}
                              data-tooltip-id="aegis-tooltip"
                              data-tooltip-content="Total elevation assent in meters for this EVA"
                            >
                              Ascent (m):
                            </div>
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
                          <div className={paneStyles.panelColumnTableCell}>
                            <div
                              className={paneStyles.displayFieldLabel}
                              data-tooltip-id="aegis-tooltip"
                              data-tooltip-content="Total elevation descent in meters for this EVA"
                            >
                              Descent (m):
                            </div>
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
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={`${paneStyles.panelColumnTableCell}`}>
                        <div
                          className={paneStyles.displayFieldLabel}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-content="Total time spent at stations. If a manual dwell time is recorded, it will be used instead of the calculated dwell time that is based on action duration"
                        >
                          Station Time (mins):
                        </div>
                      </div>
                      <div className={`${paneStyles.panelColumnTableCell}`}>
                        <div className={paneStyles.displayFieldValue}>
                          {Math.ceil(evaCalculatedFields.totalResolvedStationTime) || "0"}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div
                          className={paneStyles.displayFieldLabel}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-content="Total time of EV1's assigned actions"
                        >
                          EV1 Action Time (mins):
                        </div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {evaCalculatedFields.totalEv1Time === 0 &&
                          evaCalculatedFields.totalUnassignedTime !== 0 ? (
                            <>Incompl.</>
                          ) : (
                            <>{Math.ceil(evaCalculatedFields.totalEv1Time) || "0"}</>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div
                          className={paneStyles.displayFieldLabel}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-content="Total time of EV2's assigned actions"
                        >
                          EV2 Action Time (mins):
                        </div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {evaCalculatedFields.totalEv2Time === 0 &&
                          evaCalculatedFields.totalUnassignedTime !== 0 ? (
                            <>Incompl.</>
                          ) : (
                            <>{Math.ceil(evaCalculatedFields.totalEv2Time) || "0"}</>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>&nbsp;</div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div
                          className={paneStyles.displayFieldLabel}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-content="Total number of actions on this EVA"
                        >
                          Number of Actions:
                        </div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {evaCalculatedFields.actionCount}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div
                          className={paneStyles.displayFieldLabel}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-content="Total of all action times. It does not account for crew assignment"
                        >
                          Action Time (mins):
                        </div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {evaCalculatedFields.totalActionTime === 0 ? (
                            <>0</>
                          ) : (
                            Math.ceil(evaCalculatedFields.totalActionTime)
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div
                          className={paneStyles.displayFieldLabel}
                          data-tooltip-id="aegis-tooltip"
                          data-tooltip-content="Total mass from all actions on this EVA"
                        >
                          Total Mass (g):
                        </div>
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
                    consumablesCol1.map((equipmentItem, index) => (
                      <div
                        className={paneStyles.panelColumnTableRow}
                        key={`${equipmentItem.name}${index}`}
                      >
                        <div className={paneStyles.panelColumnTableCell}>
                          <div className={paneStyles.displayFieldLabel}>{equipmentItem.name}</div>
                        </div>
                        <div className={paneStyles.panelColumnTableCell}>
                          <div className={paneStyles.displayFieldValue}>
                            {equipmentItem.quantityUsed ? `${equipmentItem.quantityUsed}` : null}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
                <div className={paneStyles.panelColumnTable}>
                  {consumablesCol2 &&
                    consumablesCol2.map((equipmentItem, index) => (
                      <div
                        className={paneStyles.panelColumnTableRow}
                        key={`${equipmentItem.name}${index}`}
                      >
                        <div className={paneStyles.panelColumnTableCell}>
                          <div className={paneStyles.displayFieldLabel}>{equipmentItem.name}</div>
                        </div>
                        <div className={paneStyles.panelColumnTableCell}>
                          <div className={paneStyles.displayFieldValue}>
                            {equipmentItem.quantityUsed ? `${equipmentItem.quantityUsed}` : null}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faGlobe}>QuickMap</SubpanelHeading>
            </div>
            <div className={`${paneStyles.panelSectionRow} ${paneStyles.sectionButtonRow}`}>
              <Button
                onClick={() => quickMapLinkState && openQuickMap(quickMapLinkState)}
                label="View EVA in QuickMap"
                toolTip="Opens an external, read-only QuickMap window"
                style={{ width: "200px" }}
                enabled={quickMapLinkState != null}
              />
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
                        updatedAt={selectedEva?.updatedAt}
                        createdAt={selectedEva?.createdAt}
                        info={[
                          ["EVA UUID", selectedEva?.uuid],
                          ["EVA RefUUID", selectedEva?.refUuid],
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

export default EvaRightEvaInfo;
