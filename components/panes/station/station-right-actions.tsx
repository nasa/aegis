import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import Actions from "../actions";
import { setStationEditMode, upsertStationByField } from "store/station";
import { useAppDispatch } from "utils/useAppDispatch";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";

const Actions_Panel: FunctionComponent<{
  editMode: boolean;
}> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const selectedStation = useAppSelector(
    (state) => state.station.stations.find((station) => station.uuid === selectedStationUuid),
    shallowEqual
  );
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const stationPois = useAppSelector(
    (state) => state.poi.pois.filter((poi) => selectedStation?.poiUuids?.includes(poi.uuid)),
    shallowEqual
  );
  const [stationActions, setStationActions] = useState<Action[]>(null); //contains all station actions

  const calculatedFields = useAppSelector(
    (state) =>
      state.station.calculatedFields.find(
        (calculatedFields) => calculatedFields.uuid === selectedStationUuid
      ),
    shallowEqual
  );

  const stationInRunningRex: boolean = useAppSelector((state) => {
    const runningRexEvaUuid = state.rex.rexes.find((rex) => rex.rexRunning)?.selectedRexEvaUuid;
    if (!runningRexEvaUuid) return false;
    const runningRexEva = state.eva.evas.find((eva) => eva.uuid === runningRexEvaUuid);
    const sequenceItem = runningRexEva.sequence.find(
      (sequenceItem) => sequenceItem.uuid === selectedStationUuid
    );
    if (!sequenceItem) return false;
    return true;
  }, shallowEqual);

  const [actionsCalculatedFields, setActionsCalculatedField] =
    useState<ActionsCalculatedFields>(null);

  //gather all actions, then order them
  useEffect(() => {
    if (!selectedStationUuid || !actions || !selectedStation) return;

    const allStationActions: Action[] = [];

    //get actions directly attached to this station
    allStationActions.push(
      ...actions.filter((action) => {
        return action.stationUuid === selectedStationUuid;
      })
    );
    setStationActions(allStationActions);
  }, [selectedStationUuid, actions, stationPois, selectedStation]);

  useEffect(() => {
    if (!calculatedFields) return;
    // create the calculated action fields for the action tab
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
        <div className={paneStyles.rightBodyTitle}>Station Actions</div>
        <ExpandCollapseActionsButtons actionUuids={stationActions?.map((action) => action.uuid)} />
      </div>
      <div className={paneStyles.rightBodyBody} style={{ overflowY: "hidden" }}>
        <Actions
          editMode={editMode}
          setEditMode={(newEditMode: boolean) => {
            dispatch(
              setStationEditMode({ stationUuid: selectedStationUuid, editMode: newEditMode })
            );
          }}
          actionOrderUuids={selectedStation.actionOrderUuids}
          setActionOrderUuids={(actionOrderUuids) => {
            dispatch(
              upsertStationByField(selectedStationUuid, "actionOrderUuids", actionOrderUuids)
            );
          }}
          actionParentUuid={{ stationUuid: selectedStationUuid }}
          parentType="station"
          actionsCalculatedFields={actionsCalculatedFields}
          rexRunning={stationInRunningRex}
        />
      </div>
    </div>
  );
};

export default Actions_Panel;
