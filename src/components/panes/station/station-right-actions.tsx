import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import Actions from "../actions";
import { setStationEditMode, upsertStationByField } from "store/station";
import { useAppDispatch } from "utils/useAppDispatch";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";
import { getCalculatedFieldsByStation } from "store/processing/calculatedFields";

const Actions_Panel: FunctionComponent<{
  editMode: boolean;
}> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedStation = useAppSelector(
    (state) =>
      state.station.stations.find((station) => station.uuid === state.station.selectedStationUuid),
    deepEqual
  );
  const stationActionUuids = useAppSelector(
    (state) =>
      state.action.actions
        .filter((a) => a.stationUuid === selectedStation.uuid)
        ?.map((a) => a.uuid),
    deepEqual
  );
  const stationCalcFields = useAppSelector(
    (state) =>
      getCalculatedFieldsByStation({
        stationUuid: selectedStation.uuid,
        wholeStoreState: state,
      }),
    deepEqual
  );

  const stationInRunningRex: boolean = useAppSelector((state) => {
    const runningRexEvaUuid = state.rex.rexes.find((rex) => rex.isRunning)?.evaUuid;
    if (!runningRexEvaUuid) return false;
    const runningRexEva = state.eva.evas.find((eva) => eva.uuid === runningRexEvaUuid);
    const sequenceItem = runningRexEva.sequence.find(
      (sequenceItem) => sequenceItem.uuid === selectedStation.uuid
    );
    if (!sequenceItem) return false;
    return true;
  }, refEqual);

  const [actionsCalculatedFields, setActionsCalculatedField] =
    useState<ActionsCalculatedFields>(null);

  useEffect(() => {
    if (!stationCalcFields) return;
    // create the calculated action fields for the action tab
    const newActionsCalculatedFields: ActionsCalculatedFields = {
      actionCount: stationCalcFields.actionCount,
      totalActionTime: stationCalcFields.totalActionTime,
      totalEv1Time: stationCalcFields.totalEv1Time,
      totalEv2Time: stationCalcFields.totalEv2Time,
      totalUnassignedTime: stationCalcFields.totalUnassignedTime,
      totalDwellTime: stationCalcFields.totalDwellTime,
    };
    setActionsCalculatedField(newActionsCalculatedFields);
  }, [stationCalcFields]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitleContainer}>
        <div className={paneStyles.rightBodyTitle}>Station Actions</div>
        <ExpandCollapseActionsButtons actionUuids={stationActionUuids} />
      </div>
      <div className={paneStyles.rightBodyBody} style={{ overflowY: "hidden" }}>
        <Actions
          editMode={editMode}
          setEditMode={(newEditMode: boolean) => {
            dispatch(
              setStationEditMode({ stationUuid: selectedStation.uuid, editMode: newEditMode })
            );
          }}
          actionOrderUuids={selectedStation.actionOrderUuids}
          setActionOrderUuids={(actionOrderUuids) => {
            dispatch(
              upsertStationByField(selectedStation.uuid, "actionOrderUuids", actionOrderUuids)
            );
          }}
          actionParentUuid={{ stationUuid: selectedStation.uuid }}
          parentType="station"
          actionsCalculatedFields={actionsCalculatedFields}
          isRexRunning={stationInRunningRex}
        />
      </div>
    </div>
  );
};

export default Actions_Panel;
