import { FunctionComponent, useCallback, useEffect, useState } from "react";
import actionsStyles from "../actions.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { ActionsTopSection, ActionsListHeadings, ActionList } from "../actions";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";
import { thunkGetHighlightedActions } from "store/thunk/thunkAction";
import { useAppDispatch } from "utils/useAppDispatch";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid),
    shallowEqual
  );
  const thisEvaRexRunning = useAppSelector(
    (state) =>
      state.rex.rexes.find((rex) => rex.selectedRexEvaUuid === selectedEvaUuid)?.rexRunning,
    refEqual
  );
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);

  const calculatedFields = useAppSelector(
    (state) =>
      state.eva.calculatedFields.find(
        (calculatedFields) => calculatedFields.uuid === selectedEvaUuid
      ),
    shallowEqual
  );

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const [actionsCalculatedFields, setActionsCalculatedField] =
    useState<ActionsCalculatedFields>(null);

  const evaActionOrderUuids = selectedEva?.sequence.flatMap((sequenceItem) => {
    if (sequenceItem.type !== "station") return null;
    return stations.find((station) => station.uuid === sequenceItem.uuid)?.actionOrderUuids;
  });

  const [isActionHiglighted, setIsActionHighlighted] = useState<ActionHighlight[]>([]);

  //set state of highlighted actions when the STM is hovered over
  const highlightActions = useCallback(
    async (invstgUUID: string) => {
      if (!evaActionOrderUuids) return;
      const resHighlightActions = await dispatch(
        thunkGetHighlightedActions({ actionUuids: evaActionOrderUuids, stmUuid: invstgUUID })
      );
      if (resHighlightActions.payload) {
        setIsActionHighlighted(resHighlightActions.payload);
      }
    },
    [evaActionOrderUuids, dispatch]
  );

  useEffect(() => {
    if (!calculatedFields) return;
    // create the calulated action fields for the action tab
    const newActionsCalculatedFields: ActionsCalculatedFields = {
      actionCount: calculatedFields.actionCount,
      totalActionTime: calculatedFields.totalActionTime,
      totalEv1Time: calculatedFields.totalEv1Time,
      totalEv2Time: calculatedFields.totalEv2Time,
      totalUnassignedTime: calculatedFields.totalUnassignedTime,
      totalDwellTime: calculatedFields.totalDwellTime,
    };
    setActionsCalculatedField(newActionsCalculatedFields);
  }, [calculatedFields]);

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
        />
        <ActionsListHeadings
          editMode={editMode}
          parentType="eva"
          editPerms={editPerms}
          rexRunning={thisEvaRexRunning}
        />
        <div className={actionsStyles.actionListContainer}>
          {selectedEva.sequence.map((sequenceItem) => {
            if (sequenceItem.type !== "station") return null;
            const actionOrderUuids = stations.find((station) => station.uuid === sequenceItem.uuid)
              ?.actionOrderUuids;
            return (
              <div key={sequenceItem.uuid}>
                <Actions_Station_Heading stationUuid={sequenceItem.uuid} />
                <ActionList
                  editMode={editMode}
                  actionOrderUuids={actionOrderUuids}
                  highlightActions={highlightActions}
                  isActionHiglighted={isActionHiglighted}
                  stations={stations}
                  pois={null}
                  rexRunning={thisEvaRexRunning}
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
