import { ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent } from "react";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import poiStyles from "./poi.module.css";
import { setSelectedPoiUuid, setSelectedPOIRightNavItem } from "store/poi";
import { EmojiRenderer } from "components/interface/emojis";
import { setHoverUuidsForSequence } from "store/hover";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import sortBy from "lodash/sortBy";

const PoiItem: FunctionComponent<{
  poiUuid: string;
}> = ({ poiUuid }) => {
  const dispatch = useAppDispatch();
  const poi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === poiUuid),
    deepEqual
  );
  const poiFromDb = useAppSelector(
    (state) => state.poi.poisFromDb.find((poi) => poi.uuid === poiUuid),
    deepEqual
  );
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const selectedRightNavItem = useAppSelector((state) => state.poi.selectedRightNavItem, refEqual);
  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);
  const poiActions = useAppSelector((state) => {
    const filteredactions = sortBy(
      state.action.actions.filter((storeAction: Action) => storeAction.poiUuid === poi.uuid),
      ["createdAt"]
    );
    return filteredactions;
  }, deepEqual);
  const poiActionsFromDb = useAppSelector((state) => {
    const filteredactions = sortBy(
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
      aria-label="poiList-item"
      className={poiStyles.poiItem}
      key={poi.uuid}
      onClick={() => {
        if (selectedPoiUuid === poi.uuid) {
          dispatch(setSelectedPoiUuid(null)); //hide poi right panel
          dispatch(thunkSetRightPanelIsOpenIfAuto(false));
        } else {
          dispatch(setSelectedPoiUuid(poi.uuid));
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
      <div className={poiStyles.itemIcon}>
        <EmojiRenderer iconValue={poi.icon} />
      </div>
      <div className={`${poiStyles.name} ${isPoiSelectedOrHoveredStyle}`}>
        <div>{poi.name}</div>
        <ModifiedIndicator obj1={[poi, ...poiActions]} obj2={[poiFromDb, ...poiActionsFromDb]} />
        <div className={poiStyles.poiRightSpacer} />
      </div>
    </div>
  );
};

export default PoiItem;
