import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { setPoiEditMode, upsertPoi } from "store/poi";
import Actions from "../actions";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === selectedPoiUuid),
    shallowEqual
  );

  const [poiActions, setPoiActions] = useState<Action[]>(null); //contains all station actions

  //gather all actions, then order them
  useEffect(() => {
    if (selectedPoiUuid && actions && selectedPoi) {
      const allPoiActions: Action[] = [];

      //get actions directly attached to this station
      allPoiActions.push(...actions.filter((action) => action.poiUuid === selectedPoiUuid));

      //check if action ordering is deinfed for this station.
      //put any unlisted actions at the end. but there shouldn't be any unlisted actions?
      if (selectedPoi.actionOrderUuids) {
        allPoiActions.sort((action1: Action, action2: Action) => {
          const index1 = selectedPoi.actionOrderUuids.indexOf(action1.uuid);
          const index2 = selectedPoi.actionOrderUuids.indexOf(action2.uuid);
          return (index1 > -1 ? index1 : Infinity) - (index2 > -1 ? index2 : Infinity);
        });
      } else {
        //no ordering defined. default order by name
        allPoiActions.sort((action1: Action, action2: Action) => {
          const name1 = action1.name.toUpperCase(); // ignore upper and lowercase
          const name2 = action2.name.toUpperCase();
          if (name1 < name2) {
            return -1;
          } else if (name1 > name2) {
            return 1;
          } else {
            return 0;
          }
        });
      }

      setPoiActions(allPoiActions);
    }
  }, [selectedPoiUuid, actions, selectedPoi]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>POI Actions</div>
      <div className={paneStyles.rightBodyBody}>
        <Actions
          editMode={editMode}
          setEditMode={(newEditMode: boolean) => {
            dispatch(setPoiEditMode({ poiUuid: selectedPoiUuid, editMode: newEditMode }));
          }}
          actions={poiActions}
          actionColor={{ color: "var(--poi)" }}
          setActionOrderUuids={(actionOrderUuids) => {
            dispatch(upsertPoi({ ...selectedPoi, actionOrderUuids: actionOrderUuids }));
          }}
          actionParent={{ poiUuid: selectedPoiUuid }}
        />
      </div>
    </div>
  );
};

export default Actions_Panel;
