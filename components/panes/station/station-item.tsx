import { ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent, useEffect, useState } from "react";
import { RootState } from "store";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { setSelectedStationRightNavItem, setSelectedStationUuid } from "store/station";
import stationStyles from "./station.module.css";
import _ from "lodash";

const StationItem: FunctionComponent<{
  selectedStationUuid: string;
  station: Station;
  stationFromDb: Station;
  actions: Action[];
  actionsFromDb: Action[];
}> = ({ selectedStationUuid, station, stationFromDb, actions, actionsFromDb }) => {
  const dispatch = useDispatch();
  const selectedRightNavItem = useSelector(
    (state: RootState) => state.station.selectedRightNavItem,
    shallowEqual
  );

  const isStationSelectedStyle =
    station.uuid === selectedStationUuid ? stationStyles.nameSelected : null;
  const [stationActions, setStationActions] = useState<Action[]>([]);
  const [stationActionsFromDb, setStationActionsFromDb] = useState<Action[]>([]);
  useEffect(() => {
    if (actions) {
      const filteredactions = _.sortBy(
        actions.filter((storeAction: Action) => storeAction.stationUuid === station.uuid),
        ["createdAt"]
      );

      setStationActions(filteredactions);
    }
  }, [actions, station.uuid]);
  useEffect(() => {
    if (actionsFromDb) {
      const filteredactions = _.sortBy(
        actionsFromDb.filter((storeAction: Action) => storeAction.stationUuid === station.uuid),
        ["createdAt"]
      );

      setStationActionsFromDb(filteredactions);
    }
  }, [actionsFromDb, station.uuid]);

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
