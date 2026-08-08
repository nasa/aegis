import { LastEditedNumeric, SubpanelHeading } from "components/interface/_global-elements";
import {
  ValidatedTextArea,
  ValidatedInputField,
} from "components/interface/form/globalFieldsAutomerge";
import { Button, Dropdown, PathColorPickerMenu } from "components/interface/form/globalFields";
import type { FunctionComponent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, deepEqual, refEqual, shallowEqual } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
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
  faPersonThroughWindow,
  faQuestionCircle,
  faToolbox,
  faRoute,
  faGlobe,
} from "@fortawesome/free-solid-svg-icons";
import { regExValidators, validators } from "components/interface/form/formValidators";
import CalculatedDwell from "../calculated-dwell";
import { EmojiRenderer } from "components/interface/emojis";
import { getCalculatedFieldsByEva } from "store/processing/calculatedFields";
import { faClock } from "@fortawesome/free-regular-svg-icons";
import { thunkDocChangeIngressEgress } from "store/thunk/thunkEva";

import { selectAsPlannedStations, selectEvaStations, selectEvaTraverses } from "store/selectors";
import { createFolderOrganizedDropdownOptions } from "utils/folder-dropdown";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdateEvaByField } from "operations/apply/apply-eva";
import { createQuickMapLinkState, isQuickMapPoint, openQuickMap } from "utils/quickMap";

type XgressData = {
  uuid: string; // uuid of the xgress station or "lander"
  icon: string;
  name: string;
};

const EvaRightEvaInfo: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
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
    return getCalculatedFieldsByEva({
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

  const stationListForXgressDropdown = useMissionDocSelector(
    (mission) =>
      selectAsPlannedStations(mission)
        .filter((station) => station.location)
        .map((s) => ({ uuid: s.uuid, name: s.name })),
    deepEqual
  );

  const folders = useAppSelector(
    (state) => state.interface.folders.filter((f) => f.type === "station"),
    deepEqual
  );
  const itemsToFolders = folders.reduce<Record<string, string>>((map, folder) => {
    folder.items?.forEach((itemUuid) => {
      map[itemUuid] = folder.uuid;
    });
    return map;
  }, {});
  const stationDropdownOptions = createFolderOrganizedDropdownOptions({
    items: stationListForXgressDropdown,
    folders,
    itemsToFolders,
  });

  const egressData: XgressData = useMemo(() => {
    if (!docMaps || !selectedEva) return { uuid: undefined, icon: "1f680", name: "Lander" };
    const station = docMaps.stations?.[selectedEva.egressLocationUuid];
    return {
      uuid: selectedEva.egressLocationUuid,
      icon: station ? station.icon : "1f680", // Rocket
      name: station ? station.name : "Lander",
    };
  }, [docMaps, selectedEva]);

  const ingressData: XgressData = useMemo(() => {
    if (!docMaps || !selectedEva) return { uuid: undefined, icon: "1f680", name: "Lander" };
    const station = docMaps.stations?.[selectedEva.ingressLocationUuid];
    return {
      uuid: selectedEva.ingressLocationUuid,
      icon: station ? station.icon : "1f680", // Rocket
      name: station ? station.name : "Lander",
    };
  }, [docMaps, selectedEva]);

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
  Object.entries(evaCalculatedFields?.equipmentItems ?? {})?.forEach(([uuid, equipItem]) => {
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
              <SubpanelHeading icon={faPersonThroughWindow}>Egress and Ingress</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldLabel}>EVA Egress Location:</div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
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
                    <div className={paneStyles.panelColumnTableCell}>
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
                                thunkDocChangeIngressEgress({
                                  type: "egress",
                                  evaUuid: selectedEvaUuid,
                                  newStationUuidOrLander: val,
                                  oldStationUuidOrLander: egressData.uuid,
                                  isRexEva: !!rexEvaName,
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
                            {stationDropdownOptions}
                          </Dropdown>
                        ) : (
                          <div className={evaStyles.stationWrapperRight}>
                            <div className={evaStyles.iconCustomSmall}>
                              <EmojiRenderer iconValue={egressData.icon} />
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
                    <div className={paneStyles.panelColumnTableCell}>
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
                                thunkDocChangeIngressEgress({
                                  type: "ingress",
                                  evaUuid: selectedEvaUuid,
                                  newStationUuidOrLander: val,
                                  oldStationUuidOrLander: ingressData.uuid,
                                  isRexEva: !!rexEvaName,
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
                            {stationDropdownOptions}
                          </Dropdown>
                        ) : (
                          <div className={evaStyles.stationWrapperRight}>
                            <div className={evaStyles.iconCustomSmall}>
                              <EmojiRenderer iconValue={ingressData.icon} />
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
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldLabel}>Egress Duration (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <ValidatedInputField
                          value={selectedEva.egressDuration?.toString()}
                          editMode={editMode}
                          fieldProps={{
                            name: "egressDuration",
                            ariaLabel: "Egress Duration",
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
                            withMissionChange((m) =>
                              applyUpdateEvaByField(m, {
                                evaUuid: selectedEvaUuid,
                                fieldName: "egressDuration",
                                value: toDecimal(val),
                              })
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
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldLabel}>Ingress Duration (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <ValidatedInputField
                          value={selectedEva.ingressDuration?.toString()}
                          editMode={editMode}
                          fieldProps={{
                            name: "ingressDuration",
                            ariaLabel: "Ingress Duration",
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
                            withMissionChange((m) =>
                              applyUpdateEvaByField(m, {
                                evaUuid: selectedEvaUuid,
                                fieldName: "ingressDuration",
                                value: toDecimal(val),
                              })
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
              <SubpanelHeading icon={faCalculator}>Calculated Totals</SubpanelHeading>
            </div>
            {evaCalculatedFields && (
              <div className={paneStyles.panelSectionRow}>
                <div className={paneStyles.panelSection2Column}>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldLabel}>EVA Duration (mins):</div>
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
                          {Math.ceil(evaCalculatedFields.totalEvaTime) || 0}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldLabel}>Traverse Time (mins):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {evaCalculatedFields.totalTraverseTime === 0 ? (
                            <>0</>
                          ) : (
                            Math.ceil(evaCalculatedFields.totalTraverseTime)
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
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
                          <div className={paneStyles.panelColumnTableCell}>
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
                          <div className={paneStyles.panelColumnTableCell}>
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
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldLabel}>Number of Actions:</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {evaCalculatedFields.actionCount}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldLabel}>
                          Total Action Time (mins):
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
