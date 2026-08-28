import type { FunctionComponent } from "react";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { Button } from "components/interface/form/globalFields";
import evaStyles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import SequenceItemTraverse from "./eva-item-sequence-traverse";
import SequenceItemStation from "./eva-item-sequence-station";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDocAddStationToEva } from "store/thunk/thunkEva";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { useMissionDocSelector } from "utils/useDocSelector";

export const EvaSequence: FunctionComponent<{
  evaUuid: string;
}> = ({ evaUuid }) => {
  const dispatch = useAppDispatch();
  const editMode = useAppSelector((state) => state.mission.isInEditMode, refEqual);

  return (
    <>
      <div className={evaStyles.evaSequenceContainer}>
        <EvaItemSequence evaUuid={evaUuid} />
      </div>
      {editMode && (
        <div className={evaStyles.evaFooterContainer}>
          <div className={paneStyles.iconButtons}>
            <Button
              onClick={() => {
                dispatch(thunkDocAddStationToEva({ evaUuid }));
              }}
              label="Add Station"
              icon={faPlusCircle}
              style={{ width: "105px" }}
            />
          </div>
        </div>
      )}
    </>
  );
};

const EvaItemSequence: FunctionComponent<{
  evaUuid: string;
}> = ({ evaUuid }) => {
  const isThisRexEvaExecuting = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return false;
    return Object.values(mission.rexes).some((rex) => rex.isRunning && rex.evaUuid === evaUuid);
  }, refEqual);

  const evaSequence = useMissionDocSelector(
    (mission) => mission.evas?.[evaUuid]?.sequence,
    deepEqual
  );

  return (
    <div className={evaStyles.evaSequence}>
      {evaSequence?.map((sequenceItem, index) => {
        if (sequenceItem.type === "station") {
          return (
            <SequenceItemStation
              evaUuid={evaUuid}
              stationUuid={sequenceItem.uuid}
              isRexRunning={isThisRexEvaExecuting}
              key={`${sequenceItem.uuid}-${index}`}
            />
          );
        } else if (sequenceItem.type === "traverse") {
          return (
            <SequenceItemTraverse
              evaUuid={evaUuid}
              traverseUuid={sequenceItem.uuid}
              isRexRunning={isThisRexEvaExecuting}
              key={`${sequenceItem.uuid}-${index}`}
            />
          );
        }
      })}
    </div>
  );
};

export default EvaItemSequence;
