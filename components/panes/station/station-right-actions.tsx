import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "components/interface/_global-elements";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import { setStationEditMode } from "store/station";
import { upsertAction } from "store/action";
import StationAction from "./station-right-actions-action";
import { starWars, uniqueNamesGenerator } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedStationUuid = useSelector(
    (state: RootState) => state.station.selectedStationUuid,
    shallowEqual
  );
  const selectedMissionId = useSelector(
    (state: RootState) => state.mission.mission?.id,
    shallowEqual
  );
  const selectedStation = useSelector(
    (state: RootState) =>
      state.station.stations.find((station) => station.uuid === selectedStationUuid),
    shallowEqual
  );

  const actions: Action[] = useSelector((state: RootState) => state.action.actions, shallowEqual);
  const stationActions = actions.filter((action) => action.stationUuid === selectedStationUuid);

  const pois: POI[] = useSelector((state: RootState) => state.poi.pois, shallowEqual);
  const stationPois = pois.filter((poi) => selectedStation?.poiUuids?.includes(poi.uuid));

  const handleCreateAction = () => {
    const randomName: string = uniqueNamesGenerator({
      dictionaries: [starWars],
      style: "capital",
    });

    const blankAction: Action = {
      missionId: selectedMissionId,
      stationUuid: selectedStationUuid,
      uuid: uuidv4(),
      name: "A-" + randomName,
      description: "",
      status: "Candidate",
      type: "other",
      durationLower: 5,
      durationUpper: null,
      stmUuidRefs: null,
      inventoryItems: null,
      priorityOverride: null,
    };

    dispatch(upsertAction(blankAction));
    dispatch(setStationEditMode({ stationUuid: selectedStationUuid, editMode: true }));
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Actions</div>
      <div className={paneStyles.rightBodyBody}>
        {stationActions?.map((action) => (
          <StationAction
            key={action.uuid}
            editMode={editMode}
            stationUuid={selectedStationUuid}
            action={action}
          />
        ))}
      </div>
      <div className={paneStyles.rightBodyTitle}>Actions in associated POIs</div>
      <div className={paneStyles.rightBodyBody}>
        {_.sortBy(stationPois, "name")?.map((poi) => (
          <div key={poi.uuid}>
            <div className={paneStyles.rightBodyTitle}>{poi.name}</div>
            {actions
              ?.filter((action) => action.poiUuid === poi.uuid)
              .map((action) => (
                <div key={action.uuid}>{action.name}</div>
              ))}
          </div>
        ))}
      </div>

      <div className={paneStyles.rightBodyFooter}>
        <div className={paneStyles.panelSection}>
          {editMode && (
            <IconButton
              icon={faPlusCircle}
              label="Add Action"
              style={{ width: "100px" }}
              onClick={() => {
                handleCreateAction();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Actions_Panel;
