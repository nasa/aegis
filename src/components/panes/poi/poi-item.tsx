import type { FunctionComponent } from "react";
import { useEffect, useRef } from "react";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import poiStyles from "./poi.module.css";
import { setSelectedPoiUuid, setSelectedPOIRightNavItem } from "store/poi";
import { EmojiRenderer } from "components/interface/emojis";
import { setHoverUuidsForSequence } from "store/hover";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { useMissionDocSelector } from "utils/useDocSelector";

const PoiItem: FunctionComponent<{
  poiUuid: string;
}> = ({ poiUuid }) => {
  const dispatch = useAppDispatch();
  const poi = useMissionDocSelector((mission) => mission.pois[poiUuid], deepEqual);
  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const selectedRightNavItem = useAppSelector((state) => state.poi.selectedRightNavItem, refEqual);
  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);

  // Scroll into view when this POI becomes selected (e.g. after add/duplicate)
  const itemRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (poi?.uuid === selectedPoiUuid) {
      itemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [poi?.uuid, selectedPoiUuid]);

  if (!poi) return null;

  let isPoiSelectedOrHoveredStyle = null;
  if (poi.uuid === selectedPoiUuid) {
    isPoiSelectedOrHoveredStyle = poiStyles.nameSelected;
  } else if (poi.uuid === hoverItemUuid) {
    isPoiSelectedOrHoveredStyle = poiStyles.nameHovered;
  }

  return (
    <div
      ref={itemRef}
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
        <div className={poiStyles.poiRightSpacer} />
      </div>
    </div>
  );
};

export default PoiItem;
