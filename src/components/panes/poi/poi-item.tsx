import { ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent } from "react";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import poiStyles from "./poi.module.css";
import _ from "lodash";
import { setSelectedPoiUuid, setSelectedPOIRightNavItem } from "store/poi";
import { clearEvaSelections } from "store/eva";
import { decodeEmoji } from "utils/formatting";
import { setHoverUuidsForSequence } from "store/hover";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";

const PoiItem: FunctionComponent<{
  selectedPoiUuid: string;
  poi: POI;
  poiFromDb: POI;
}> = ({ selectedPoiUuid, poi, poiFromDb }) => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector((state) => state.poi.selectedRightNavItem, refEqual);
  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);
  const poiActions = useAppSelector((state) => {
    const filteredactions = _.sortBy(
      state.action.actions.filter((storeAction: Action) => storeAction.poiUuid === poi.uuid),
      ["createdAt"]
    );
    return filteredactions;
  }, deepEqual);
  const poiActionsFromDb = useAppSelector((state) => {
    const filteredactions = _.sortBy(
      state.action.actionsFromDb.filter((storeAction: Action) => storeAction.poiUuid === poi.uuid),
      ["createdAt"]
    );
    return filteredactions;
  }, deepEqual);

  let isPoiSelectedOrHoveredStyle = null;
  if (poi.uuid === selectedPoiUuid) {
    isPoiSelectedOrHoveredStyle = poiStyles.nameSelected;
  } else if (poi.uuid === hoverItemUuid) {
    isPoiSelectedOrHoveredStyle = poiStyles.nameHovered;
  }

  return (
    <div
      className={poiStyles.poiItem}
      key={poi.uuid}
      onClick={() => {
        if (selectedPoiUuid === poi.uuid) {
          dispatch(setSelectedPoiUuid(null)); //hide poi right panel
          dispatch(thunkSetRightPanelIsOpenIfAuto(false));
        } else {
          dispatch(setSelectedPoiUuid(poi.uuid));
          dispatch(clearEvaSelections());
          if (!selectedRightNavItem) dispatch(setSelectedPOIRightNavItem("info_panel"));
          dispatch(thunkSetRightPanelIsOpenIfAuto(true));
        }
      }}
      onMouseEnter={() => {
        dispatch(setHoverUuidsForSequence({ sequenceUuid: poi.uuid, mapItemType: "poi" }));
      }}
      onMouseLeave={() => {
        dispatch(setHoverUuidsForSequence({ sequenceUuid: null, mapItemType: null }));
      }}
    >
      <div className={poiStyles.itemIcon}>{decodeEmoji(poi.icon)}</div>
      <div className={`${poiStyles.name} ${isPoiSelectedOrHoveredStyle}`}>
        <div>{poi.name}</div>
        <ModifiedIndicator obj1={[poi, ...poiActions]} obj2={[poiFromDb, ...poiActionsFromDb]} />
        <div className={poiStyles.poiRightSpacer} />
      </div>
    </div>
  );
};

export default PoiItem;
