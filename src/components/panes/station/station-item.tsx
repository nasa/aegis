import { ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent } from "react";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { setSelectedStationRightNavItem, setSelectedStationUuid } from "store/station";
import stationStyles from "./station.module.css";
import { decodeEmoji } from "utils/formatting";
import { setHoverUuidsForSequence } from "store/hover";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";

const StationItem: FunctionComponent<{
  stationUuid: string;
}> = ({ stationUuid }) => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.station.selectedRightNavItem,
    refEqual
  );
  const station = useAppSelector(
    (state) => state.station.stations.find((s) => s.uuid === stationUuid),
    deepEqual
  );
  // we're stripping out only the values that isModified uses when comparing objects
  const stationFromDbIsModified = useAppSelector((state) => {
    const station = state.station.stationsFromDb.find((s) => s.uuid === stationUuid);
    if (!station) return null; // station is in draft
    return {
      uuid: station.uuid,
      updatedAt: station.updatedAt,
    };
  }, deepEqual);

  const stationActionsIsModified = useAppSelector((state) => {
    const actionsIsModified = state.action.actions
      .filter((action) => action.stationUuid === station.uuid)
      .map((action) => ({
        uuid: action.uuid,
        updatedAt: action.updatedAt,
      }));
    return actionsIsModified;
  }, deepEqual);

  const stationActionsFromDbIsModified = useAppSelector((state) => {
    const actionsIsModified = state.action.actionsFromDb
      .filter((action) => action.stationUuid === station.uuid)
      .map((action) => ({
        uuid: action.uuid,
        updatedAt: action.updatedAt,
      }));
    return actionsIsModified;
  }, deepEqual);

  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
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
      onClick={() => {
        if (selectedStationUuid === station.uuid) {
          dispatch(setSelectedStationUuid(null)); //hide station right panel
          dispatch(thunkSetRightPanelIsOpenIfAuto(false));
        } else {
          dispatch(setSelectedStationUuid(station.uuid));
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
          obj1={[station, ...stationActionsIsModified]}
          obj2={[stationFromDbIsModified, ...stationActionsFromDbIsModified]}
        />
        <div className={stationStyles.stationRightSpacer} />
      </div>
    </div>
  );
};

export default StationItem;
