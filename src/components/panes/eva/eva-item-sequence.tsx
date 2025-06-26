import { FunctionComponent } from "react";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import evaStyles from "./eva.module.css";

import SequenceItemTraverse from "./eva-item-sequence-traverse";
import SequenceItemStation from "./eva-item-sequence-station";

const EvaItemSequence: FunctionComponent<{
  evaUuid: string;
}> = ({ evaUuid }) => {
  const isThisRexEvaExecuting = useAppSelector((state) => {
    const rex = state.rex.rexesFromDb.find((rex) => rex.isRunning && rex.evaUuid === evaUuid);
    return !!rex; // !! converts to boolean
  }, refEqual);

  const evaSequence = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === evaUuid)?.sequence,
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
