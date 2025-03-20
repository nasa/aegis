import { FunctionComponent } from "react";
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
  const actionsCalculatedFields = useAppSelector((state) => {
    const calculatedFields = getCalculatedFieldsByStation({
      stationUuid: selectedStation.uuid,
      stations: state.station.stations,
      mission: state.mission.mission,
      actions: state.action.actions,
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

  const runningRexUuid = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.isRunning)?.uuid,
    refEqual
  );

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
          rexUuid={stationInRunningRex ? runningRexUuid : null}
        />
      </div>
    </div>
  );
};

export default Actions_Panel;
