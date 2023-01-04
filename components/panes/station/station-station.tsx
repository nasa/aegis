import { ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent, useEffect, useState } from "react";
import { RootState } from "store";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { setSelectedStationRightNavItem, setSelectedStationUuid } from "store/station";
import stationStyles from "./station.module.css";
import _ from "lodash";

const StationLeft: FunctionComponent<{
  station: Station;
  stationFromDb: Station;
  selectedStationUuid: string;
  actions: Action[];
  actionsFromDb: Action[];
}> = ({ station, stationFromDb, selectedStationUuid, actions, actionsFromDb }) => {
  const dispatch = useDispatch();
  const selectedRightNavItem: string = useSelector(
    (state: RootState) => state.station.selectedRightNavItem,
    shallowEqual
  );

  const isStationSelectedStyle =
    station.uuid === selectedStationUuid ? stationStyles.nameSelected : null;
  const [stationActions, setStationActions] = useState<Action[]>([]);
  const [stationActionsFromDb, setStationActionsFromDb] = useState<Action[]>([]);
  useEffect(() => {
    if (actions) {
      const filteredactions = actions.filter(
        (storeAction: Action) => storeAction.stationUuid === station.uuid
      );

      setStationActions(filteredactions);
      // console.log(`station ${station.name} actions updated - count ${filteredactions.length}`);
    }
  }, [actions, station.uuid]);
  useEffect(() => {
    if (actionsFromDb) {
      const filteredactions = actionsFromDb.filter(
        (storeAction: Action) => storeAction.stationUuid === station.uuid
      );

      setStationActionsFromDb(filteredactions);
      // console.log(
      //   `station ${station.name} actions from db updated - count ${filteredactions.length}`
      // );
    }
  }, [actionsFromDb, station.uuid]);

  // //track modified
  // const [modified, setModified] = useState(false);
  // useEffect(() => {
  //   const stationEqual = _.isEqual(station, stationFromDb);
  //   const actionEqual = _.isEqual(stationActions, stationActionsFromDb);
  //   // console.log("action modified test " + actionEqual);
  //   // console.log(stationActions);
  //   // console.log(stationActionsFromDb);
  //   setModified(!stationEqual || !actionEqual);
  // }, [station, stationFromDb, stationActions, stationActionsFromDb]);

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

export default StationLeft;
