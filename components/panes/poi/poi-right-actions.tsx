import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { setPoiEditMode, upsertPoiByField } from "store/poi";
import Actions from "../actions";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === selectedPoiUuid),
    shallowEqual
  );
  const poiActionUuids = useAppSelector(
    (state) =>
      state.action.actions.filter((a) => a.poiUuid === selectedPoiUuid)?.map((a) => a.uuid),
    shallowEqual
  );

  const calculatedFields = useAppSelector(
    (state) =>
      state.poi.calculatedFields.find(
        (calculatedFields) => calculatedFields.uuid === selectedPoiUuid
      ),
    shallowEqual
  );

  const [actionsCalculatedFields, setActionsCalculatedField] =
    useState<ActionsCalculatedFields>(null);

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
          rexRunning={false}
        />
      </div>
    </div>
  );
};

export default Actions_Panel;
