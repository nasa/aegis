import { ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent } from "react";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, refEqual } from "utils/useAppSelector";
import { setSelectedStationRightNavItem, setSelectedStationUuid } from "store/station";
import stationStyles from "./station.module.css";
import { clearEvaSelections } from "store/eva";
import { decodeEmoji } from "utils/formatting";
import { setHoverUuidsForSequence } from "store/hover";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";

const StationItem: FunctionComponent<{
  selectedStationUuid: string;
  station: Station;
  stationFromDb: Station;
  stationActions: Action[];
  stationActionsFromDb: Action[];
}> = ({ selectedStationUuid, station, stationFromDb, stationActions, stationActionsFromDb }) => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.station.selectedRightNavItem,
    refEqual
  );
  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);

  let isStationSelectedOrHoveredStyle = null;
  if (station.uuid === selectedStationUuid) {
    isStationSelectedOrHoveredStyle = stationStyles.nameSelected;
  } else if (station.uuid === hoverItemUuid) {
    isStationSelectedOrHoveredStyle = stationStyles.nameHovered;
  }

  return (
    <div
      aria-label="stationList-item"
      className={stationStyles.stationItem}
      key={station.uuid}
      onClick={() => {
        if (selectedStationUuid === station.uuid) {
          dispatch(setSelectedStationUuid(null)); //hide station right panel
          dispatch(thunkSetRightPanelIsOpenIfAuto(false));
        } else {
          dispatch(setSelectedStationUuid(station.uuid));
          dispatch(clearEvaSelections());
          if (!selectedRightNavItem) dispatch(setSelectedStationRightNavItem("info_panel"));
          dispatch(thunkSetRightPanelIsOpenIfAuto(true));
        }
      }}
      onMouseEnter={() => {
        dispatch(setHoverUuidsForSequence({ sequenceUuid: station.uuid, mapItemType: "station" }));
      }}
      onMouseLeave={() => {
        dispatch(setHoverUuidsForSequence({ sequenceUuid: null, mapItemType: null }));
      }}
    >
      <div className={stationStyles.itemIcon}>
        {decodeEmoji(station.icon ? station.icon : "2754")}
      </div>
      <div className={`${stationStyles.name} ${isStationSelectedOrHoveredStyle}`}>
        <div>{station.name}</div>
        <ModifiedIndicator
          obj1={[station, ...stationActions]}
          obj2={[stationFromDb, ...stationActionsFromDb]}
        />
        <div className={stationStyles.stationRightSpacer} />
      </div>
    </div>
  );
};

export default StationItem;
