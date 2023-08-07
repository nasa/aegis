import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import Actions from "../actions";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid),
    shallowEqual
  );
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);

  const calculatedFields = useAppSelector(
    (state) =>
      state.eva.calculatedFields.find(
        (calculatedFields) => calculatedFields.uuid === selectedEvaUuid
      ),
    shallowEqual
  );

  const [evaActions, setEvaActions] = useState<Action[]>(null); //contains all EVA actions
  const [evaActionOrderUuids, setEvaActionOrderUuids] = useState<string[]>(null); //contains all EVA actions
  const [actionsCalculatedFields, setActionsCalculatedField] =
    useState<ActionsCalculatedFields>(null);

  //gather all actions, then order them
  useEffect(() => {
    if (!actions || !selectedEva || !stations) return;
    const allEvaActions: Action[] = [];
    const actionOrderUuids: string[] = [];

    // loop though all eva sequence items and generate a collection of actions from all stations

    for (const sequenceItem of selectedEva.sequence) {
      if (sequenceItem.type !== "station") continue;

      const station = stations.find((station) => station.uuid === sequenceItem.uuid);
      let stationActions = actions.filter((action) => action.stationUuid === sequenceItem.uuid);
      // prepend the station name to each action name
      stationActions = stationActions.map((action) => {
        return { ...action, name: `${station?.name} - ${action.name}` };
      });
      if (stationActions) allEvaActions.push(...stationActions);
      if (station && station.actionOrderUuids) actionOrderUuids.push(...station.actionOrderUuids);
    }
    setEvaActions(allEvaActions);

    // set the action order uuids
    setEvaActionOrderUuids(actionOrderUuids);
  }, [actions, selectedEva, stations]);

  useEffect(() => {
    if (!calculatedFields) return;
    // create the calulated action fields for the action tab
    const newActionsCalculatedFields: ActionsCalculatedFields = {
      actionCount: calculatedFields.actionCount,
      totalTime: calculatedFields.totalTime,
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
        <ExpandCollapseActionsButtons actionUuids={evaActions?.map((action) => action.uuid)} />
      </div>
      <div className={paneStyles.rightBodyBody} style={{ overflowY: "hidden" }}>
        <Actions
          editMode={editMode}
          setEditMode={() => {}}
          actions={evaActions}
          actionColor={{ color: "white" }}
          actionOrderUuids={evaActionOrderUuids}
          setActionOrderUuids={() => {}}
          actionParentUuid={null}
          actionsCalculatedFields={actionsCalculatedFields}
          parentType="eva"
        />
      </div>
    </div>
  );
};

export default Actions_Panel;
