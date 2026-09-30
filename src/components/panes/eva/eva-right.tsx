import type { FunctionComponent } from "react";
import { refEqual, useAppSelector } from "utils/useAppSelector";
import StationEditorRight from "../station/station-right";
import EvaRightEva from "./eva-right-eva";
import TraverseEditorRight from "../traverse/traverse-right";
import { useMissionDocSelector } from "utils/useDocSelector";
import { deepEqual } from "utils/useAppSelector";

const EvaPlannerRight: FunctionComponent = () => {
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const allEvas = useMissionDocSelector((mission) => mission.evas, deepEqual);

  let rightPanelSetToDisplay = <></>;

  if (selectedEvaSequenceItemUuid) {
    Object.values(allEvas ?? {}).forEach((eva) => {
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
  }

  return <>{rightPanelSetToDisplay}</>;
};

export default EvaPlannerRight;
