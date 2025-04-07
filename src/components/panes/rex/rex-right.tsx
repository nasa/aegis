import { FunctionComponent } from "react";
import { refEqual, deepEqual, useAppSelector } from "utils/useAppSelector";
import StationEditorRight from "components/panes/station/station-right";
import EvaRightEva from "components/panes/eva/eva-right-eva";
import TraverseEditorRight from "components/panes/traverse/traverse-right";
import RexRightRex from "components/panes/rex/rex-right-rex";

const RexRight: FunctionComponent = () => {
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const evas = useAppSelector((state) => state.eva.evas, deepEqual);

  let rightPanelSetToDisplay = <></>;

  if (selectedEvaSequenceItemUuid) {
    evas.forEach((eva) => {
      eva.sequence.forEach((sequenceItem) => {
        if (sequenceItem.uuid === selectedEvaSequenceItemUuid) {
          if (sequenceItem.type === "station") {
            rightPanelSetToDisplay = <StationEditorRight />;
          } else if (sequenceItem.type === "traverse") {
            rightPanelSetToDisplay = <TraverseEditorRight />;
          }
        }
      });
    });
  } else if (selectedEvaUuid) {
    rightPanelSetToDisplay = <EvaRightEva />;
  } else if (selectedRexUuid) {
    rightPanelSetToDisplay = <RexRightRex />;
  }

  return <>{rightPanelSetToDisplay}</>;
};

export default RexRight;
