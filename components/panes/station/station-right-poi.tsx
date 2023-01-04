import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faLink } from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "components/interface/_global-elements";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import { setStationEditMode } from "store/station";
import { upsertAction } from "store/action";
import { starWars, uniqueNamesGenerator } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";
import poiStyles from "../poi/poi.module.css";

const Poi_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedStationUuid = useSelector(
    (state: RootState) => state.station.selectedStationUuid,
    shallowEqual
  );
  const selectedMissionId = useSelector(
    (state: RootState) => state.mission.mission?.id,
    shallowEqual
  );
  const stations: Station[] = useSelector(
    (state: RootState) => state.station.stations,
    shallowEqual
  );
  const selectedStation = stations.find((station) => station.uuid === selectedStationUuid);
  const pois = useSelector((state: RootState) => state.poi.pois, shallowEqual);

  const handleLinkAction = () => {
    const randomName: string = uniqueNamesGenerator({
      dictionaries: [starWars],
      style: "capital",
    });

    const blankAction: Action = {
      missionId: selectedMissionId,
      stationUuid: selectedStation.uuid,
      uuid: uuidv4(),
      name: "Action " + randomName,
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
      <div className={paneStyles.rightBodyTitle}>Station POIs</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>POI Linking</div>
          {selectedStation?.poiUuid?.length > 0 ? (
            selectedStation.poiUuid.map((poiUuid) => {
              const poi: POI = pois.find((storePoi: POI) => storePoi.uuid === poiUuid);
              return (
                poi && (
                  <div className={poiStyles.poiItem} key={poi.uuid}>
                    <div className={poiStyles.itemColor}>
                      <div
                        className={poiStyles.poiDot}
                        style={{ backgroundColor: poi.color?.value }}
                      />
                    </div>
                    <div className={`${poiStyles.name}`}>
                      <div>{poi.name}</div>
                      <div className={poiStyles.poiRightSpacer}></div>
                    </div>
                  </div>
                )
              );
            })
          ) : (
            <div className={paneStyles.panelText}>0 linked POIs</div>
          )}
          {editMode && (
            <IconButton
              icon={faLink}
              label="Link POIs"
              style={{ width: "100px" }}
              onClick={() => {
                handleLinkAction();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Poi_Panel;
