import { ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, refEqual } from "utils/useAppSelector";
import poiStyles from "./poi.module.css";
import _ from "lodash";
import { setSelectedPoiUuid, setSelectedRightNavItem } from "store/poi";
import { setSelectedEvaSequenceItemUuid, setSelectedEvaUuid } from "store/eva";

const PoiItem: FunctionComponent<{
  selectedPoiUuid: string;
  poi: POI;
  poiFromDb: POI;
  actions: Action[];
  actionsFromDb: Action[];
}> = ({ selectedPoiUuid, poi, poiFromDb, actions, actionsFromDb }) => {
  const dispatch = useDispatch();
  const selectedRightNavItem = useAppSelector((state) => state.poi.selectedRightNavItem, refEqual);

  const isPoiSelectedStyle = poi.uuid === selectedPoiUuid ? poiStyles.nameSelected : null;
  const [poiActions, setPoiActions] = useState<Action[]>([]);
  const [poiActionsFromDb, setPoiActionsFromDb] = useState<Action[]>([]);
  useEffect(() => {
    if (actions) {
      const filteredactions = _.sortBy(
        actions.filter((storeAction: Action) => storeAction.poiUuid === poi.uuid),
        ["createdAt"]
      );

      setPoiActions(filteredactions);
    }
  }, [actions, poi.uuid]);
  useEffect(() => {
    if (actionsFromDb) {
      const filteredactions = _.sortBy(
        actionsFromDb.filter((storeAction: Action) => storeAction.poiUuid === poi.uuid),
        ["createdAt"]
      );

      setPoiActionsFromDb(filteredactions);
    }
  }, [actionsFromDb, poi.uuid]);

  const colorCharAsInt = parseInt(poi.color?.value, 16);
  const unicodeColorEmoji = colorCharAsInt ? String.fromCodePoint(colorCharAsInt) : "";

  return (
    <div
      className={poiStyles.poiItem}
      key={poi.uuid}
      onClick={() => {
        if (selectedPoiUuid === poi.uuid) {
          dispatch(setSelectedPoiUuid(null)); //hide poi right panel
        } else {
          dispatch(setSelectedPoiUuid(poi.uuid));
          dispatch(setSelectedEvaSequenceItemUuid(null));
          dispatch(setSelectedEvaUuid(null));
          if (!selectedRightNavItem) dispatch(setSelectedRightNavItem("info_panel"));
        }
      }}
    >
      <div className={poiStyles.itemColor}>{unicodeColorEmoji}</div>
      <div className={`${poiStyles.name} ${isPoiSelectedStyle}`}>
        <div>{poi.name}</div>
        <ModifiedIndicator
          obj1={[poi, ...poiActions]}
          obj2={[poiFromDb, ...poiActionsFromDb]}
          svgStyle={{
            width: "15",
            height: "12",
            cx: "5",
            cy: "9",
            r: "3",
            fill: "#ff0000",
          }}
        />
        <div className={poiStyles.poiRightSpacer}></div>
      </div>
    </div>
  );
};

export default PoiItem;
