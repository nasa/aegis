import { FunctionComponent, useCallback, useState } from "react";
import actionsStyles from "../actions.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { ActionsTopSection, ActionsListHeadings, ActionList } from "../actions";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";
import { thunkGetHighlightedActions } from "store/thunk/thunkAction";
import { useAppDispatch } from "utils/useAppDispatch";
import { getCalculatedFieldsByEva } from "store/processing/calculatedFields";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid),
    deepEqual
  );
  const isSelectedEvaInARunningRex = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.isRunning)?.evaUuid === selectedEvaUuid,
    refEqual
  );
  const runningRexUuid = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.isRunning)?.uuid,
    refEqual
  );
  const stations = useAppSelector((state) => state.station.stations, deepEqual);

  const actionsCalculatedFields = useAppSelector((state) => {
    const evaCalculatedFields = getCalculatedFieldsByEva({
      evaUuid: selectedEvaUuid,
      wholeStoreState: state,
    });
    const newActionsCalculatedFields: ActionsCalculatedFields = {
      actionCount: evaCalculatedFields.actionCount,
      totalActionTime: evaCalculatedFields.totalActionTime,
      totalEv1Time: evaCalculatedFields.totalEv1Time,
      totalEv2Time: evaCalculatedFields.totalEv2Time,
      totalUnassignedTime: evaCalculatedFields.totalUnassignedTime,
      totalDwellTime: evaCalculatedFields.totalDwellTime,
      totalMass: evaCalculatedFields.totalMass,
    };
    return newActionsCalculatedFields;
  }, deepEqual);

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const evaActionOrderUuids = selectedEva?.sequence.flatMap((sequenceItem) => {
    if (sequenceItem.type !== "station") return null;
    return stations.find((station) => station.uuid === sequenceItem.uuid)?.actionOrderUuids;
  });

  const [isActionHiglighted, setIsActionHighlighted] = useState<ActionHighlight[]>([]);

  //set state of highlighted actions when the STM is hovered over
  const highlightActions = useCallback(
    async (level3Uuid: string) => {
      if (!evaActionOrderUuids) return;
      const resHighlightActions = await dispatch(
        thunkGetHighlightedActions({ actionUuids: evaActionOrderUuids, stmUuid: level3Uuid })
      );
      if (resHighlightActions.payload) {
        setIsActionHighlighted(resHighlightActions.payload);
      }
    },
    [evaActionOrderUuids, dispatch]
  );

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitleContainer}>
        <div className={paneStyles.rightBodyTitle}>All EVA Actions</div>
        <ExpandCollapseActionsButtons actionUuids={evaActionOrderUuids} />
      </div>
      <div className={paneStyles.rightBodyBody} style={{ overflowY: "hidden" }}>
        <ActionsTopSection
          actionOrderUuids={evaActionOrderUuids}
          parentType="eva"
          highlightActions={highlightActions}
          actionsCalculatedFields={actionsCalculatedFields}
          actionIsInRunningRex={isSelectedEvaInARunningRex}
        />
        <ActionsListHeadings
          editMode={editMode}
          parentType="eva"
          editPerms={editPerms}
          actionIsInRunningRex={isSelectedEvaInARunningRex}
        />

        <div className={actionsStyles.actionListContainer}>
          {selectedEva.sequence.map((sequenceItem) => {
            if (sequenceItem.type !== "station") return null;
            const actionOrderUuids = stations.find(
              (station) => station.uuid === sequenceItem.uuid
            )?.actionOrderUuids;
            return (
              <div key={sequenceItem.uuid}>
                <Actions_Station_Heading stationUuid={sequenceItem.uuid} />
                <ActionList
                  editMode={editMode}
                  actionOrderUuids={actionOrderUuids}
                  parentType="eva"
                  highlightActions={highlightActions}
                  isActionHiglighted={isActionHiglighted}
                  stations={stations}
                  pois={null}
                  rexUuid={isSelectedEvaInARunningRex ? runningRexUuid : null}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Actions_Panel;

const Actions_Station_Heading: FunctionComponent<{ stationUuid: string }> = ({ stationUuid }) => {
  const stationName = useAppSelector(
    (state) => state.station.stations.find((station) => station.uuid === stationUuid)?.name,
    refEqual
  );

  return (
    <div className={actionsStyles.evaActionsStationTitleContainer}>
      <div>{stationName}</div>
      <div className={actionsStyles.evaActionsStationTitleLine}></div>
    </div>
  );
};
