import {
  ContentEditableTextArea,
  InLineEditInput,
  LastEdited,
} from "components/interface/_global-elements";
import { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import { upsertEva } from "store/eva";
import { shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import { displayFormattedTotalTimeObj } from "utils/component-helpers";
import { formatNumberWithCommas } from "utils/formatting";

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
            <div className={paneStyles.panelSectionTitle}>EVA Description</div>
            <ContentEditableTextArea
              html={selectedEva.description} // innerHTML of the editable div
              editing={editMode}
              onChange={(evt) => {
                dispatch(
                  upsertEva({
                    ...selectedEva,
                    description: evt.target.value,
                  })
                );
              }} // handle innerHTML change
            />
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Predicted Values</div>
            <div className={paneStyles.panelSectionRow} style={{ marginTop: "8px" }}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Max Duration (mins)</div>
                <div className={paneStyles.inputField}>
                  <InLineEditInput
                    fieldName="Total EVA Time"
                    editing={editMode}
                    maxLength={5}
                    styleInput={{ width: "55px" }}
                    containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                    value={selectedEva.maxDuration?.toString()}
                    onChange={(val: number) => {
                      dispatch(upsertEva({ ...selectedEva, maxDuration: val }));
                    }}
                  />
                </div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div
                  className={paneStyles.panelSectionTitle}
                  title={`${selectedEva?.traverseRate ? "EVA" : "Mission"} Default: ${
                    selectedEva?.traverseRate || missionTraverseRate
                  } km/hr`}
                >
                  Traverse Rate (km/hr)
                </div>
                <div className={paneStyles.inputField}>
                  <InLineEditInput
                    fieldName="Average Traverse Rate"
                    editing={editMode}
                    maxLength={4}
                    styleInput={{ width: "55px" }}
                    containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                    value={selectedEva.traverseRate?.toString()}
                    onChange={(val: number) => {
                      dispatch(upsertEva({ ...selectedEva, traverseRate: val }));
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Calculated Values</div>
            <div className={paneStyles.panelSectionRow} style={{ marginTop: "8px" }}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Total Station Dwell Time</div>
                <div className={paneStyles.panelDisplayVal}>
                  <>{displayFormattedTotalTimeObj(evaCalculatedFields?.totalStationTime)}</>
                  &nbsp;mins
                </div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Total Traverse Duration</div>
                <div className={paneStyles.panelDisplayVal}>
                  <>{evaCalculatedFields?.totalTraverseTime?.toFixed(0)}</>&nbsp;mins
                </div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Total EVA Duration</div>
                <div className={paneStyles.panelDisplayVal}>
                  <>{displayFormattedTotalTimeObj(evaCalculatedFields?.totalEvaTime)}</>&nbsp;mins
                </div>
              </div>
            </div>
            <div className={paneStyles.panelSectionRow} style={{ marginTop: "8px" }}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}># Station Actions</div>
                <div className={paneStyles.panelDisplayVal}>
                  {evaCalculatedFields?.totalStationActionCount}
                </div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Total Traverse Distance</div>
                <div className={paneStyles.panelDisplayVal}>
                  {formatNumberWithCommas(evaCalculatedFields?.totalTraverseDistanceMeters)}&nbsp;m
                </div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Last Edited</div>
            <div className={paneStyles.verticalCenter}>
              <div className={paneStyles.panelText}>
                <LastEdited updatedAt={selectedEva?.updatedAt} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaRightEvaInfo;
