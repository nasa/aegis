import type { FunctionComponent } from "react";
import { useEffect, useRef } from "react";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { setSelectedStationRightNavItem, setSelectedStationUuid } from "store/station";
import stationStyles from "./station.module.css";
import { EmojiRenderer } from "components/interface/emojis";
import { setHoverUuidsForSequence } from "store/hover";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { useMissionDocSelector } from "utils/useDocSelector";

const StationItem: FunctionComponent<{
  stationUuid: string;
}> = ({ stationUuid }) => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.station.selectedRightNavItem,
    refEqual
  );
  const stationPartial: { uuid: string; icon: string; name: string } = useMissionDocSelector(
    (mission) => {
      const station = mission.stations[stationUuid];
      return {
        uuid: station.uuid,
        icon: station.icon,
        name: station.name,
      };
    },
    deepEqual
  );

  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);

  let isStationSelectedOrHoveredStyle = null;
  if (stationPartial.uuid === selectedStationUuid) {
    isStationSelectedOrHoveredStyle = stationStyles.nameSelected;
  } else if (stationPartial.uuid === hoverItemUuid) {
    isStationSelectedOrHoveredStyle = stationStyles.nameHovered;
  }

  // Scroll into view when this station becomes selected (e.g. after add/duplicate)
  const itemRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stationPartial.uuid === selectedStationUuid) {
      itemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [stationPartial.uuid, selectedStationUuid]);

  return (
    <div
      ref={itemRef}
      aria-label="stationList-item"
      className={stationStyles.stationItem}
      onClick={() => {
        if (selectedStationUuid === stationPartial.uuid) {
          dispatch(setSelectedStationUuid(null)); //hide station right panel
          dispatch(thunkSetRightPanelIsOpenIfAuto(false));
        } else {
          dispatch(setSelectedStationUuid(stationPartial.uuid));
          if (!selectedRightNavItem) dispatch(setSelectedStationRightNavItem("info_panel"));
          dispatch(thunkSetRightPanelIsOpenIfAuto(true));
        }
      }}
      onMouseEnter={() => {
        dispatch(
          setHoverUuidsForSequence({ sequenceUuid: stationPartial.uuid, mapItemType: "station" })
        );
      }}
      onMouseLeave={() => {
        dispatch(setHoverUuidsForSequence({ sequenceUuid: null, mapItemType: null }));
      }}
    >
      <div className={stationStyles.itemIcon}>
        <EmojiRenderer
          iconValue={stationPartial?.icon ? stationPartial.icon : "2754"}
          customSizeEm={1.4}
        />
      </div>
      <div className={`${stationStyles.name} ${isStationSelectedOrHoveredStyle}`}>
        <div>{stationPartial.name}</div>
        <div className={stationStyles.stationRightSpacer} />
      </div>
    </div>
  );
};

export default StationItem;
