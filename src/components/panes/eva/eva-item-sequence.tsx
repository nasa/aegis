import { FunctionComponent } from "react";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
import evaStyles from "./eva.module.css";

import _ from "lodash";
import SequenceItemTraverse from "./eva-item-sequence-traverse";
import SequenceItemStation from "./eva-item-sequence-station";

const EvaItemSequence: FunctionComponent<{
  evaUuid: string;
  evaSequence: EvaSequenceItem[];
  editMode: boolean;
}> = ({ evaUuid, evaSequence, editMode }) => {
  const thisEvaInRunningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning && rex.evaUuid === evaUuid),
    deepEqual
  );

  return (
    <div className={evaStyles.evaSequence}>
      {evaSequence?.map((sequenceItem) => {
        if (sequenceItem.type === "station") {
          return (
            <SequenceItemStation
              evaUuid={evaUuid}
              stationUuid={sequenceItem.uuid}
              editMode={editMode}
              isRexRunning={!!thisEvaInRunningRexFromDb}
              evaSequence={evaSequence}
              key={sequenceItem.uuid}
            />
          );
        } else if (sequenceItem.type === "traverse") {
          return (
            <SequenceItemTraverse
              evaUuid={evaUuid}
              traverseUuid={sequenceItem.uuid}
              editMode={editMode}
              isRexRunning={!!thisEvaInRunningRexFromDb}
              key={sequenceItem.uuid}
            />
          );
        }
      })}
    </div>
  );
};

export default EvaItemSequence;
