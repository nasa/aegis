import { FunctionComponent } from "react";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import StationEditorRight from "../station/station-right";
import EvaRightEva from "./eva-right-eva";
import EvaRightTraverse from "./eva-right-traverse";

const EvaPlannerRight: FunctionComponent = () => {
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const evas = useAppSelector((state) => state.eva.evas, shallowEqual);

  let rightPanelSetToDisplay = <></>;

  if (selectedEvaSequenceItemUuid) {
    evas.forEach((eva) => {
      eva.sequence.forEach((sequenceItem) => {
        if (sequenceItem.uuid === selectedEvaSequenceItemUuid) {
          if (sequenceItem.type === "station") {
            rightPanelSetToDisplay = <StationEditorRight />;
          } else if (sequenceItem.type === "traverse") {
            rightPanelSetToDisplay = <EvaRightTraverse />;
          }
        }
      });
    });
  } else if (selectedEvaUuid) {
    rightPanelSetToDisplay = <EvaRightEva />;
  }

  return <>{rightPanelSetToDisplay}</>;
};

export default EvaPlannerRight;
