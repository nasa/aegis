import type { FunctionComponent } from "react";
import { useMemo } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import Actions from "../actions";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";
import { getCalcFieldsForStation } from "store/processing/calculatedFields";
import { useMissionDocSelector } from "utils/useDocSelector";
import { findRexUuidForEntity } from "utils/rexExecuteEditMode";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdateStationByField } from "operations/apply/apply-station";

const Actions_Panel: FunctionComponent<{
  editMode: boolean;
}> = ({ editMode }) => {
  const missionWalkbackRate = useMissionDocSelector((mission) => mission.walkbackRate, refEqual);

  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const docMaps = useMissionDocSelector(
    (mission) => ({
      stations: mission.stations,
      actions: mission.actions,
    }),
    shallowEqual
  );
  const selectedStation = useMemo(
    () => docMaps?.stations[selectedStationUuid],
    [docMaps, selectedStationUuid]
  );
  const stationActionUuids = useMemo(() => {
    if (!docMaps || !selectedStation) return [];
    return Object.values(docMaps.actions)
      .filter((a) => a.stationUuid === selectedStation.uuid)
      ?.map((a) => a.uuid);
  }, [docMaps, selectedStation]);
  const actionsCalculatedFields = useMemo<ActionsCalculatedFields>(() => {
    if (!docMaps) return undefined;
    const stationActions = Object.values(docMaps.actions).filter(
      (a) => a.stationUuid === selectedStation?.uuid && a.enabled
    );
    const calculatedFields = getCalcFieldsForStation({
      station: selectedStation,
      missionWalkbackRate,
      stationActions,
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
  }, [docMaps, selectedStation, missionWalkbackRate]);

  // The REX owning this station, whether or not it is running, so its execute
  // edit mode and action letters keep applying after execution stops.
  const stationRexUuid = useMissionDocSelector(
    (mission) => findRexUuidForEntity(mission, { stationUuid: selectedStation?.uuid }),
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
          actionOrderUuids={selectedStation.actionOrderUuids}
          setActionOrderUuids={(actionOrderUuids) => {
            withMissionChange((m) =>
              applyUpdateStationByField(m, {
                stationUuid: selectedStation.uuid,
                fieldName: "actionOrderUuids",
                value: actionOrderUuids,
              })
            );
          }}
          actionParentUuid={{ stationUuid: selectedStation.uuid }}
          parentType="station"
          actionsCalculatedFields={actionsCalculatedFields}
          rexUuid={stationRexUuid}
        />
      </div>
    </div>
  );
};

export default Actions_Panel;
