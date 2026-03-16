import type { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import { setPoiEditMode, upsertPoiByField } from "store/poi";
import Actions from "../actions";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";
import { getCalculatedFieldsByPoi } from "store/processing/calculatedFields";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === selectedPoiUuid),
    deepEqual
  );
  const poiActionUuids = useAppSelector(
    (state) =>
      state.action.actions.filter((a) => a.poiUuid === selectedPoiUuid)?.map((a) => a.uuid),
    shallowEqual
  );

  const actionsCalculatedFields = useAppSelector((state) => {
    const poiActions = state.action.actions.filter(
      (a) => a.poiUuid === selectedPoiUuid && a.enabled
    );
    const poiCalculatedFields = getCalculatedFieldsByPoi({
      poiUuid: selectedPoiUuid,
      poiActions,
    });
    const newActionsCalculatedFields: ActionsCalculatedFields = {
      actionCount: poiCalculatedFields.actionCount,
      totalActionTime: poiCalculatedFields.totalActionTime,
      totalEv1Time: poiCalculatedFields.totalEv1Time,
      totalEv2Time: poiCalculatedFields.totalEv2Time,
      totalUnassignedTime: poiCalculatedFields.totalUnassignedTime,
      totalDwellTime: poiCalculatedFields.totalDwellTime,
      totalMass: poiCalculatedFields.totalMass,
    };
    return newActionsCalculatedFields;
  }, deepEqual);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitleContainer}>
        <div className={paneStyles.rightBodyTitle}>POI Actions</div>
        <ExpandCollapseActionsButtons actionUuids={poiActionUuids} />
      </div>
      <div className={paneStyles.rightBodyBody} style={{ overflowY: "hidden" }}>
        <Actions
          editMode={editMode}
          setEditMode={(newEditMode: boolean) => {
            dispatch(setPoiEditMode({ poiUuid: selectedPoiUuid, editMode: newEditMode }));
          }}
          actionOrderUuids={selectedPoi.actionOrderUuids}
          setActionOrderUuids={(actionOrderUuids) => {
            dispatch(upsertPoiByField(selectedPoiUuid, "actionOrderUuids", actionOrderUuids));
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
