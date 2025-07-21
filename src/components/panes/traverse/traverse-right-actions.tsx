import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import Actions from "../actions";
import { useAppDispatch } from "utils/useAppDispatch";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";
import { getCalculatedFieldsByTraverse } from "store/processing/calculatedFields";
import { setTraversesEditMode, upsertTraverseByField } from "store/traverse";

const Actions_Panel: FunctionComponent<{
  editMode: boolean;
}> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedTraverse = useAppSelector(
    (state) =>
      state.traverse.traverses.find((traverse) => traverse.uuid === selectedEvaSequenceItemUuid),
    deepEqual
  );
  const traverseActionUuids = useAppSelector(
    (state) =>
      state.action.actions
        .filter((a) => a.traverseUuid === selectedTraverse.uuid)
        ?.map((a) => a.uuid),
    deepEqual
  );
  const actionsCalculatedFields = useAppSelector((state) => {
    const traverseEva = state.eva.evas.find((eva) =>
      eva.sequence.some((seqItem) => seqItem.uuid === selectedTraverse.uuid)
    );
    const traverseActions = state.action.actions.filter(
      (a) => a.traverseUuid === selectedTraverse.uuid && a.enabled
    );
    const calculatedFields = getCalculatedFieldsByTraverse({
      traverse: selectedTraverse,
      missionTraverseRate: state.mission.mission.traverseRate,
      traverseEva,
      traverseActions,
    });
    const newActionsCalculatedFields: ActionsCalculatedFields = {
      actionCount: calculatedFields.actionCount,
      totalActionTime: calculatedFields.totalActionTime,
      totalEv1Time: calculatedFields.totalEv1Time,
      totalEv2Time: calculatedFields.totalEv2Time,
      totalUnassignedTime: calculatedFields.totalUnassignedTime,
      totalDwellTime: calculatedFields.totalDwellTime,
      totalMass: calculatedFields.totalMass,
    };
    return newActionsCalculatedFields;
  }, deepEqual);

  const traverseInRunningRex: boolean = useAppSelector((state) => {
    const runningRexEvaUuid = state.rex.rexes.find((rex) => rex.isRunning)?.evaUuid;
    if (!runningRexEvaUuid) return false;
    const runningRexEva = state.eva.evas.find((eva) => eva.uuid === runningRexEvaUuid);
    const sequenceItem = runningRexEva.sequence.find(
      (sequenceItem) => sequenceItem.uuid === selectedTraverse.uuid
    );
    if (!sequenceItem) return false;
    return true;
  }, refEqual);

  const runningRexUuid = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.isRunning)?.uuid,
    refEqual
  );

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitleContainer}>
        <div className={paneStyles.rightBodyTitle}>Traverse Actions</div>
        <ExpandCollapseActionsButtons actionUuids={traverseActionUuids} />
      </div>
      <div className={paneStyles.rightBodyBody} style={{ overflowY: "hidden" }}>
        <Actions
          editMode={editMode}
          setEditMode={(newEditMode: boolean) => {
            dispatch(
              setTraversesEditMode({ uuids: [selectedTraverse.uuid], editMode: newEditMode })
            );
          }}
          actionOrderUuids={selectedTraverse.actionOrderUuids}
          setActionOrderUuids={(actionOrderUuids) => {
            dispatch(
              upsertTraverseByField(selectedTraverse.uuid, "actionOrderUuids", actionOrderUuids)
            );
          }}
          actionParentUuid={{ traverseUuid: selectedTraverse.uuid }}
          parentType="traverse"
          actionsCalculatedFields={actionsCalculatedFields}
          rexUuid={traverseInRunningRex ? runningRexUuid : null}
        />
      </div>
    </div>
  );
};

export default Actions_Panel;
