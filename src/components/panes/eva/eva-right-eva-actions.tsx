import { FunctionComponent, useCallback, useState } from "react";
import actionsStyles from "../actions.module.css";
import evaStyles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { ActionsTopSection, ActionsListHeadings, ActionList } from "../actions";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";
import { thunkGetHighlightedActions } from "store/thunk/thunkAction";
import { useAppDispatch } from "utils/useAppDispatch";
import { getCalculatedFieldsByEva } from "store/processing/calculatedFields";
import { decodeEmoji } from "utils/formatting";

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
  const stations = useAppSelector((state) => {
    const sequenceUuids = selectedEva?.sequence.map((sequenceItem) => sequenceItem.uuid);
    return state.station.stations.filter((station) => sequenceUuids.includes(station.uuid));
  }, deepEqual);
  const traverses = useAppSelector((state) => {
    const sequenceUuids = selectedEva?.sequence.map((sequenceItem) => sequenceItem.uuid);
    return state.traverse.traverses.filter((traverse) => sequenceUuids.includes(traverse.uuid));
  }, deepEqual);

  const actionsCalculatedFields = useAppSelector((state) => {
    const evaCalculatedFields = getCalculatedFieldsByEva({
      evaUuid: selectedEvaUuid,
      evas: state.eva.evas,
      stations: state.station.stations,
      mission: state.mission.mission,
      actions: state.action.actions,
      traverses: state.traverse.traverses,
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
          parentComponent="eva"
          highlightActions={highlightActions}
          actionsCalculatedFields={actionsCalculatedFields}
          actionIsInRunningRex={isSelectedEvaInARunningRex}
        />
        <ActionsListHeadings
          editMode={editMode}
          parentComponent="eva"
          editPerms={editPerms}
          actionIsInRunningRex={isSelectedEvaInARunningRex}
        />

        <div className={actionsStyles.actionListContainer}>
          {selectedEva.sequence.map((sequenceItem, index) => {
            if (sequenceItem.type === "station") {
              const station = stations.find((station) => station.uuid === sequenceItem.uuid);
              if (!station) {
                return (
                  <div key={`${sequenceItem.uuid}-${index}`}>
                    <div className={actionsStyles.evaActionsStationTitleContainer}>
                      <div className={evaStyles.iconCustomSmall}></div>
                      <div>No Station Selected</div>
                      <div className={actionsStyles.evaActionsStationTitleLine}></div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div key={`${sequenceItem.uuid}-${index}`}>
                    <div className={actionsStyles.evaActionsStationTitleContainer}>
                      <div className={evaStyles.iconCustomSmall}>{decodeEmoji(station.icon)}</div>
                      <div>{station.name}</div>
                      <div className={actionsStyles.evaActionsStationTitleLine}></div>
                    </div>
                    <ActionList
                      editMode={editMode}
                      actionOrderUuids={station.actionOrderUuids}
                      parentComponent="eva"
                      highlightActions={highlightActions}
                      isActionHiglighted={isActionHiglighted}
                      stations={stations}
                      pois={null}
                      rexUuid={isSelectedEvaInARunningRex ? runningRexUuid : null}
                    />
                  </div>
                );
              }
            } else if (sequenceItem.type === "traverse") {
              const traverse = traverses.find((traverse) => traverse.uuid === sequenceItem.uuid);
              return (
                <div key={sequenceItem.uuid}>
                  <div className={actionsStyles.evaActionsStationTitleContainer}>
                    <div className={evaStyles.iconTraverseDotsContainerSmall}>
                      <div className={evaStyles.iconTraverseSmall} />
                    </div>
                    <div>{traverse.name}</div>
                    <div className={actionsStyles.evaActionsStationTitleLine}></div>
                  </div>
                  <ActionList
                    editMode={editMode}
                    actionOrderUuids={traverse.actionOrderUuids}
                    parentComponent="eva"
                    highlightActions={highlightActions}
                    isActionHiglighted={isActionHiglighted}
                    stations={stations}
                    pois={null}
                    rexUuid={isSelectedEvaInARunningRex ? runningRexUuid : null}
                  />
                </div>
              );
            }
          })}
        </div>
      </div>
    </div>
  );
};

export default Actions_Panel;
