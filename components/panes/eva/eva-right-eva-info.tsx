import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { InLineEditInput } from "components/interface/form/globalFields";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppDispatch } from "utils/useAppDispatch";

import { upsertEva, upsertEvaByField } from "store/eva";
import { shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import { displayFormattedTotalTimeObj } from "utils/component-helpers";
import { formatNumberWithCommas, toDecimal } from "utils/formatting";
import {
  faCalculator,
  faMessage,
  faQuestionCircle,
  faToolbox,
} from "@fortawesome/free-solid-svg-icons";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { regExValidators, validators } from "components/interface/form/formValidators";
import CalculatedDwell from "../calculated-dwell";

const EvaRightEvaInfo: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, shallowEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid),
    shallowEqual
  );
  const missionTraverseRate = useAppSelector(
    (state) => state.mission.mission?.traverseRate,
    shallowEqual
  );
  const evaCalculatedFields = useAppSelector(
    (state) => state.eva.calculatedFields.find((calculated) => calculated.uuid === selectedEvaUuid),
    shallowEqual
  );
  const missionEquipItems = useAppSelector(
    (state) => state.mission.mission.equipmentItems,
    shallowEqual
  );

  const [consumablesCol1, setConsumablesCol1] = useState<EquipmentItemDisplay[]>(null);
  const [consumablesCol2, setConsumablesCol2] = useState<EquipmentItemDisplay[]>(null);

  //split, sort, and pull names for each equipment item
  useEffect(() => {
    if (!evaCalculatedFields?.equipmentItems || !missionEquipItems) return;
    //get names
    const consumablesDisplay: EquipmentItemDisplay[] = [];
    evaCalculatedFields?.equipmentItems?.forEach((equipItem) => {
      //find item in mission
      const missionEquipItem = missionEquipItems.find((item) => item.uuid === equipItem.uuid);
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
    setConsumablesCol1(consumablesDisplay.slice(0, Math.ceil(consumablesDisplay.length / 2)));
    setConsumablesCol2(consumablesDisplay.slice(Math.ceil(consumablesDisplay.length / 2)));
  }, [evaCalculatedFields?.equipmentItems, missionEquipItems]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>EVA Information</div>
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
                  dispatch(
                    upsertEva({
                      ...selectedEva,
                      description: value,
                    })
                  );
                }}
              />
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
                      <div
                        className={paneStyles.inputFieldLabel}
                        data-tooltip-id="aegis-tooltip"
                        data-tooltip-html={`${
                          selectedEva?.traverseRate ? "EVA" : "Mission"
                        } Default: ${selectedEva?.traverseRate || missionTraverseRate} km/hr`}
                      >
                        Traverse Rate (km/hr):
                        <br />
                        (Mission Default: {missionTraverseRate})
                      </div>
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
                          {evaCalculatedFields.totalTime?.durationLower === 0 ? (
                            <>0</>
                          ) : (
                            displayFormattedTotalTimeObj(evaCalculatedFields.totalTime)
                          )}
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
                  </div>
                  <div className={paneStyles.panelColumnTable}>
                    <CalculatedDwell actionsCalculatedFields={evaCalculatedFields} />
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
