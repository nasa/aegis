import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { setPoiEditMode, upsertPoi } from "store/poi";
import Actions from "../actions";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === selectedPoiUuid),
    shallowEqual
  );

  const calculatedFields = useAppSelector(
    (state) =>
      state.poi.calculatedFields.find(
        (calculatedFields) => calculatedFields.uuid === selectedPoiUuid
      ),
    shallowEqual
  );

  const [poiActions, setPoiActions] = useState<Action[]>(null); //contains all POI actions
  const [actionsCalculatedFields, setActionsCalculatedField] =
    useState<ActionsCalculatedFields>(null);

  //gather all actions, then order them
  useEffect(() => {
    if (!selectedPoiUuid || !actions || !selectedPoi) return;

    const allPoiActions: Action[] = [];

    //get actions directly attached to this POI
    allPoiActions.push(...actions.filter((action) => action.poiUuid === selectedPoiUuid));
    setPoiActions(allPoiActions);
  }, [selectedPoiUuid, actions, selectedPoi]);

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
        <div className={paneStyles.rightBodyTitle}>POI Actions</div>
        <ExpandCollapseActionsButtons actionUuids={poiActions?.map((action) => action.uuid)} />
      </div>
      <div className={paneStyles.rightBodyBody} style={{ overflowY: "hidden" }}>
        <Actions
          editMode={editMode}
          setEditMode={(newEditMode: boolean) => {
            dispatch(setPoiEditMode({ poiUuid: selectedPoiUuid, editMode: newEditMode }));
          }}
          actions={poiActions}
          actionOrderUuids={selectedPoi.actionOrderUuids}
          setActionOrderUuids={(actionOrderUuids) => {
            dispatch(upsertPoi({ ...selectedPoi, actionOrderUuids: actionOrderUuids }));
          }}
          actionParentUuid={{ poiUuid: selectedPoiUuid }}
          parentType="poi"
          actionsCalculatedFields={actionsCalculatedFields}
        />
      </div>
    </div>
  );
};

export default Actions_Panel;
