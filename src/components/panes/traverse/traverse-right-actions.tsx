import type { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import Actions from "../actions";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";
import { getCalcFieldsForTraverse } from "store/processing/calculatedFields";
import { useMissionDocSelector } from "utils/useDocSelector";
import { findRexUuidForEntity } from "utils/rexExecuteEditMode";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdateTraverseByField } from "operations/apply/apply-traverse";

const Actions_Panel: FunctionComponent<{
  editMode: boolean;
}> = ({ editMode }) => {
  const missionTraverseRate = useMissionDocSelector((mission) => mission.traverseRate, refEqual);
  const allActionRecords = useMissionDocSelector((mission) => mission.actions, deepEqual) ?? {};

  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedTraverse = useMissionDocSelector(
    (mission) => mission.traverses[selectedEvaSequenceItemUuid],
    deepEqual
  );
  const traverseActionUuids = useMissionDocSelector((mission) => {
    return Object.values(mission.actions)
      .filter((a) => a.traverseUuid === selectedTraverse.uuid)
      ?.map((a) => a.uuid);
  }, deepEqual);
  const actionsCalculatedFields = useMissionDocSelector((mission) => {
    const traverseEva = Object.values(mission?.evas ?? {}).find((eva) =>
      eva.sequence.some((seqItem) => seqItem.uuid === selectedTraverse?.uuid)
    );
    const traverseActions = Object.values(allActionRecords).filter(
      (a) => a.traverseUuid === selectedTraverse?.uuid && a.enabled
    );
    const calculatedFields = getCalcFieldsForTraverse({
      traverse: selectedTraverse,
      missionTraverseRate,
      evaTraverseRate: traverseEva?.traverseRate,
      traverseActions,
    });
    return {
      actionCount: calculatedFields.actionCount,
      totalActionTime: calculatedFields.totalActionTime,
      totalEv1Time: calculatedFields.totalEv1Time,
      totalEv2Time: calculatedFields.totalEv2Time,
      totalUnassignedTime: calculatedFields.totalUnassignedTime,
      totalDwellTime: calculatedFields.totalDwellTime,
      totalMass: calculatedFields.totalMass,
      totalEquipmentItems: calculatedFields.totalEquipmentItems,
    };
  }, deepEqual);

  // The REX owning this traverse, whether or not it is running, so its execute
  // edit mode and action letters keep applying after execution stops.
  const traverseRexUuid = useMissionDocSelector(
    (mission) => findRexUuidForEntity(mission, { traverseUuid: selectedTraverse?.uuid }),
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
          actionOrderUuids={selectedTraverse.actionOrderUuids}
          setActionOrderUuids={(actionOrderUuids) => {
            withMissionChange((m) =>
              applyUpdateTraverseByField(m, {
                traverseUuid: selectedTraverse.uuid,
                fieldName: "actionOrderUuids",
                value: actionOrderUuids,
              })
            );
          }}
          actionParentUuid={{ traverseUuid: selectedTraverse.uuid }}
          parentType="traverse"
          actionsCalculatedFields={actionsCalculatedFields}
          rexUuid={traverseRexUuid}
        />
      </div>
    </div>
  );
};

export default Actions_Panel;
