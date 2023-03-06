import {
  ContentEditableTextArea,
  InLineEditInput,
  LastEdited,
} from "components/interface/_global-elements";
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { upsertEva } from "store/eva";
import { shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";

const EvaRightEvaInfo: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, shallowEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid),
    shallowEqual
  );
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);

  const [totalStationTime, setTotalStationTime] = useState({ durationLower: 0, durationUpper: 0 });
  const [totalTraverseTime, setTotalTraverseTime] = useState({
    durationLower: 0,
    durationUpper: 0,
  });
  const [totalTraverseDistance, setTotalTraverseDistance] = useState(0);

  const [actionsCount, setActionsCount] = useState(0);

  const calculateTotals = useCallback(() => {
    let totalStationTimeLower = 0;
    let totalStationTimeUpper = 0;
    let totalTraverseTimeLower = 0;
    let totalTraverseTimeUpper = 0;
    let totalTraverseDistance = 0;
    selectedEva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "station") {
        const stationActions = actions.filter((action) => action.stationUuid === sequenceItem.uuid);
        stationActions.forEach((action) => {
          totalStationTimeLower += action?.durationLower;
          totalStationTimeUpper += action?.durationUpper;
        });
      } else if (sequenceItem.type === "traverse") {
        const traverse = traverses.find((traverse) => traverse.uuid === sequenceItem.uuid);
        totalTraverseTimeLower += traverse?.durationLower;
        totalTraverseTimeUpper += traverse?.durationUpper;
        if (Array.isArray(traverse?.pathSegmentDistances)) {
          totalTraverseDistance += traverse?.pathSegmentDistances.reduce(
            (accumulator, currentVal) => accumulator + currentVal,
            0
          );
        } else {
          totalTraverseDistance = 0;
        }
      }
    });
    setTotalStationTime({
      durationLower: totalStationTimeLower,
      durationUpper: totalStationTimeUpper,
    });
    setTotalTraverseTime({
      durationLower: totalTraverseTimeLower,
      durationUpper: totalTraverseTimeUpper,
    });
    setTotalTraverseDistance(totalTraverseDistance);
  }, [selectedEva, actions, traverses]);

  const countActions = useCallback(() => {
    let count = 0;
    selectedEva.sequence.forEach((sequenceItem) => {
      if (sequenceItem.type === "station") {
        const stationActions = actions.filter((action) => action.stationUuid === sequenceItem.uuid);
        count += stationActions.length;
      }
    });
    setActionsCount(count);
  }, [selectedEva, actions]);

  useEffect(() => {
    calculateTotals();
    countActions();
  }, [calculateTotals, countActions]);

  const displayStationTime = () => {
    if (totalStationTime.durationLower === totalStationTime.durationUpper) {
      return totalStationTime.durationLower;
    } else {
      return `${totalStationTime.durationLower} - ${totalStationTime.durationUpper}`;
    }
  };

  const displayTraverseTime = () => {
    if (totalTraverseTime.durationLower === totalTraverseTime.durationUpper) {
      return totalTraverseTime.durationLower;
    } else {
      return `${totalTraverseTime.durationLower} - ${totalTraverseTime.durationUpper}`;
    }
  };

  const displayTotalTime = () => {
    const totalTimeLower = totalStationTime.durationLower + totalTraverseTime.durationLower;
    const totalTimeUpper = totalStationTime.durationUpper + totalTraverseTime.durationUpper;
    if (totalTimeLower === totalTimeUpper) {
      return totalTimeLower;
    } else {
      return `${totalTimeLower} - ${totalTimeUpper}`;
    }
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>EVA Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionRow}>
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
                <div className={paneStyles.panelSectionTitle}>Traverse Rate (km/hr)</div>
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
            <div className={paneStyles.panelSectionTitle}>Calculated Values</div>
            <div className={paneStyles.panelSectionRow} style={{ marginTop: "8px" }}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Total Station Time</div>
                <div className={paneStyles.panelDisplayVal}>
                  <>{displayStationTime()}</>&nbsp;mins
                </div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Total Traverse Time</div>
                <div className={paneStyles.panelDisplayVal}>
                  <>{displayTraverseTime()}</>&nbsp;mins
                </div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Total Time</div>
                <div className={paneStyles.panelDisplayVal}>
                  <>{displayTotalTime()}</>&nbsp;mins
                </div>
              </div>
            </div>
            <div className={paneStyles.panelSectionRow} style={{ marginTop: "8px" }}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}># Station Actions</div>
                <div className={paneStyles.panelDisplayVal}>{actionsCount}</div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Total Traverse Distance</div>
                <div className={paneStyles.panelDisplayVal}>
                  {totalTraverseDistance.toFixed(2)}&nbsp;m
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
