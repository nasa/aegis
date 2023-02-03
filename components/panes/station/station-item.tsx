import { ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, refEqual } from "utils/useAppSelector";
import { setSelectedStationRightNavItem, setSelectedStationUuid } from "store/station";
import stationStyles from "./station.module.css";

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
  const isStationSelectedStyle =
    station.uuid === selectedStationUuid ? stationStyles.nameSelected : null;

  return (
    <div
      className={stationStyles.stationItem}
      key={station.uuid}
      onClick={() => {
        if (selectedStationUuid === station.uuid) {
          dispatch(setSelectedStationUuid(null)); //hide station right panel
        } else {
          dispatch(setSelectedStationUuid(station.uuid));
          if (!selectedRightNavItem) dispatch(setSelectedStationRightNavItem("info_panel"));
        }
      }}
    >
      <div className={`${stationStyles.name} ${isStationSelectedStyle}`}>
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
        <div className={stationStyles.stationRightSpacer}></div>
      </div>
    </div>
  );
};

export default StationItem;
