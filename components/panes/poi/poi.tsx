import poiStyles from "./poi.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { faClone, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FunctionComponent } from "react";
import { Button } from "components/interface/form/globalFields";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import PoiItem from "./poi-item";
import _ from "lodash";
import { thunkCreatePoi, thunkDuplicatePoi } from "store/thunk/thunkPoi";
import { useAppDispatch } from "utils/useAppDispatch";

const PoiEditorLeft: FunctionComponent = () => {
  const thunkDispatch = useAppDispatch();
  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);
  const poisFromDb = useAppSelector((state) => state.poi.poisFromDb, shallowEqual);

  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const selectedPoi = pois.find((poi) => poi.uuid === selectedPoiUuid);

  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const actionsFromDb = useAppSelector((state) => state.action.actionsFromDb, shallowEqual);
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  return (
    <>
      <div className={paneStyles.leftPanelContainer}>
        <div className={poiStyles.container}>
          <div className={poiStyles.body}>
            {_.sortBy(pois, "name").map((poi) => {
              const poiFromDb = poisFromDb.find((poiFromDb) => poiFromDb.uuid === poi.uuid);
              return (
                <PoiItem
                  key={poi.uuid}
                  selectedPoiUuid={selectedPoiUuid}
                  poi={poi}
                  poiFromDb={poiFromDb}
                  actions={actions}
                  actionsFromDb={actionsFromDb}
                />
              );
            })}
          </div>
        </div>
      </div>
      {editPerms && (
        <div className={paneStyles.iconButtons}>
          <Button
            onClick={() => {
              thunkDispatch(thunkCreatePoi());
            }}
            label="Add"
            icon={faPlusCircle}
            style={{ width: "65px" }}
          />
          <Button
            onClick={() => {
              thunkDispatch(thunkDuplicatePoi({ poi: selectedPoi }));
            }}
            label="Duplicate"
            icon={faClone}
            enabled={selectedPoiUuid !== null}
            style={{ width: "95px" }}
          />
        </div>
      )}
    </>
  );
};

export default PoiEditorLeft;
