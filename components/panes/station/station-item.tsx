import { ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, refEqual } from "utils/useAppSelector";
import { setSelectedStationRightNavItem, setSelectedStationUuid } from "store/station";
import stationStyles from "./station.module.css";
import { clearEvaSelections } from "store/eva";
import { decodeEmoji } from "utils/formatting";
import { setRightPanelOpen } from "store/interface";
import {
  setMapItemHoverUuid,
  setLeftPanelHoverUuid,
  setTimelineHoverUuid,
} from "store/playheadHover";

const StationItem: FunctionComponent<{
  selectedStationUuid: string;
  station: Station;
  stationFromDb: Station;
  stationActions: Action[];
  stationActionsFromDb: Action[];
}> = ({ selectedStationUuid, station, stationFromDb, stationActions, stationActionsFromDb }) => {
  const dispatch = useDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.station.selectedRightNavItem,
    refEqual
  );

  const hoverItemUuid = useAppSelector((state) => state.playheadHover.leftPanelItemUuid, refEqual);

  let isStationSelectedOrHoveredStyle = null;
  if (station.uuid === selectedStationUuid) {
    isStationSelectedOrHoveredStyle = stationStyles.nameSelected;
  } else if (station.uuid === hoverItemUuid) {
    isStationSelectedOrHoveredStyle = stationStyles.nameHovered;
  }

  return (
    <div
      className={stationStyles.stationItem}
      key={station.uuid}
      onClick={() => {
        if (selectedStationUuid === station.uuid) {
          dispatch(setSelectedStationUuid(null)); //hide station right panel
          dispatch(setRightPanelOpen(false));
        } else {
          dispatch(setSelectedStationUuid(station.uuid));
          dispatch(clearEvaSelections());
          if (!selectedRightNavItem) dispatch(setSelectedStationRightNavItem("info_panel"));
          dispatch(setRightPanelOpen(true));
        }
      }}
      onMouseOver={() => {
        dispatch(setMapItemHoverUuid(station.uuid));
        dispatch(setLeftPanelHoverUuid(station.uuid));
        dispatch(setTimelineHoverUuid(station.uuid));
      }}
      onMouseLeave={() => {
        dispatch(setMapItemHoverUuid(null));
        dispatch(setLeftPanelHoverUuid(null));
        dispatch(setTimelineHoverUuid(null));
      }}
    >
      <div className={stationStyles.itemIcon}>{decodeEmoji(station.icon)}</div>
      <div className={`${stationStyles.name} ${isStationSelectedOrHoveredStyle}`}>
        <div>{station.name}</div>
        <ModifiedIndicator
          obj1={[station, ...stationActions]}
          obj2={[stationFromDb, ...stationActionsFromDb]}
          svgStyle={{
            width: "15",
            height: "12",
            cx: "5",
            cy: "9",
            r: "3",
            fill: "#ff0000",
          }}
        />
        <div className={stationStyles.stationRightSpacer} />
      </div>
    </div>
  );
};

export default StationItem;
