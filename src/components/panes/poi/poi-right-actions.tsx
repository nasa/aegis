import type { FunctionComponent } from "react";
import { useMemo } from "react";
import paneStyles from "../global-pane-styles.module.css";

import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdatePoiByField } from "operations/apply/apply-poi";
import Actions from "../actions";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";
import { getCalculatedFieldsByPoi } from "store/processing/calculatedFields";
import { useMissionDocSelector } from "utils/useDocSelector";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const docMaps = useMissionDocSelector(
    (mission) => ({ pois: mission.pois, actions: mission.actions }),
    shallowEqual
  );
  const selectedPoi = useMemo(
    () => (selectedPoiUuid ? docMaps?.pois[selectedPoiUuid] : undefined),
    [docMaps, selectedPoiUuid]
  );
  const poiActionUuids = useMemo(() => {
    if (!docMaps) return [];
    return Object.values(docMaps.actions)
      .filter((a) => a.poiUuid === selectedPoiUuid)
      ?.map((a) => a.uuid);
  }, [docMaps, selectedPoiUuid]);
  const actionsCalculatedFields = useMemo<ActionsCalculatedFields>(() => {
    if (!docMaps) return undefined;
    const poiActions = Object.values(docMaps.actions).filter(
      (a) => a.poiUuid === selectedPoiUuid && a.enabled
    );
    const poiCalculatedFields = getCalculatedFieldsByPoi({
      poiUuid: selectedPoiUuid,
      poiActions,
    });
    return {
      actionCount: poiCalculatedFields.actionCount,
      totalActionTime: poiCalculatedFields.totalActionTime,
      totalEv1Time: poiCalculatedFields.totalEv1Time,
      totalEv2Time: poiCalculatedFields.totalEv2Time,
      totalUnassignedTime: poiCalculatedFields.totalUnassignedTime,
      totalDwellTime: poiCalculatedFields.totalDwellTime,
      totalMass: poiCalculatedFields.totalMass,
    };
  }, [docMaps, selectedPoiUuid]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitleContainer}>
        <div className={paneStyles.rightBodyTitle}>POI Actions</div>
        <ExpandCollapseActionsButtons actionUuids={poiActionUuids} />
      </div>
      <div className={paneStyles.rightBodyBody} style={{ overflowY: "hidden" }}>
        <Actions
          editMode={editMode}
          actionOrderUuids={selectedPoi.actionOrderUuids}
          setActionOrderUuids={(actionOrderUuids) => {
            withMissionChange((m) =>
              applyUpdatePoiByField(m, {
                poiUuid: selectedPoiUuid,
                fieldName: "actionOrderUuids",
                value: actionOrderUuids,
              })
            );
          }}
          actionParentUuid={{ poiUuid: selectedPoiUuid }}
          parentType="poi"
          actionsCalculatedFields={actionsCalculatedFields}
          rexUuid={null}
        />
      </div>
    </div>
  );
};

export default Actions_Panel;
