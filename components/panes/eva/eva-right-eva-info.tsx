import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { InLineEditInput } from "components/interface/form/globalFields";
import { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import { upsertEva } from "store/eva";
import { shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import { displayFormattedTotalTimeObj } from "utils/component-helpers";
import { formatNumberWithCommas, toDecimal } from "utils/formatting";
import { faCalculator, faLightbulb, faMessage } from "@fortawesome/free-solid-svg-icons";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { regExValidators, validators } from "components/interface/form/formValidators";

const EvaRightEvaInfo: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, shallowEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid),
    shallowEqual
  );
  const missionTraverseRate = useAppSelector(
    (state) => state.mission.mission?.traverseSpeed,
    shallowEqual
  );
  const evaCalculatedFields = useAppSelector(
    (state) => state.eva.calculatedFields.find((calculated) => calculated.uuid === selectedEvaUuid),
    shallowEqual
  );

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
                value={selectedEva.description}
                editing={editMode}
                onChange={(value) => {
                  dispatch(
                    upsertEva({
                      ...selectedEva,
                      description: value,
                    })
                  );
                }} // handle innerHTML change
              />
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "3px" }}>
              <SubpanelHeading icon={faLightbulb}>Predicted Values</SubpanelHeading>
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
                            validators: [validators.mustBeNumber, validators.maxLength(5)],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          onSubmit={(val: string) => {
                            dispatch(upsertEva({ ...selectedEva, maxDuration: toDecimal(val) }));
                          }}
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
                            dispatch(upsertEva({ ...selectedEva, traverseRate: toDecimal(val) }));
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
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faCalculator}>Totals</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Action Time (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {evaCalculatedFields?.totalStationTime?.durationLower === 0 &&
                        evaCalculatedFields?.totalStationTime?.durationUpper === 0 ? (
                          <>N/A</>
                        ) : (
                          displayFormattedTotalTimeObj(evaCalculatedFields?.totalStationTime)
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
                        {evaCalculatedFields?.totalTraverseTime === 0 ? (
                          <>N/A</>
                        ) : (
                          evaCalculatedFields?.totalTraverseTime.toFixed(0)
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>EVA Duration (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {evaCalculatedFields?.totalEvaTime?.durationLower === 0 &&
                        evaCalculatedFields?.totalEvaTime?.durationUpper === 0 ? (
                          <>N/A</>
                        ) : (
                          displayFormattedTotalTimeObj(evaCalculatedFields?.totalEvaTime)
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Number of Actions:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {evaCalculatedFields?.totalStationActionCount}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Traverse Distance (m):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {evaCalculatedFields?.totalTraverseDistanceMeters === 0 ? (
                          <>N/A</>
                        ) : (
                          formatNumberWithCommas(evaCalculatedFields?.totalTraverseDistanceMeters)
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
