import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { upsertStation } from "store/station";
import poiStyles from "../poi/poi.module.css";
import stationStyles from "./station.module.css";
import _ from "lodash";
import { SubpanelHeading } from "components/interface/_global-elements";
import { Checkbox } from "components/interface/form/globalFields";
import { setMapItemHoverUuid } from "store/playheadHover";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { faMessage } from "@fortawesome/free-solid-svg-icons";
import { setSectionSelected } from "store/interface";
import { setSelectedPoiUuid } from "store/poi";

const Poi_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const selectedStation = useAppSelector(
    (state) => state.station.stations.find((station) => station.uuid === selectedStationUuid),
    shallowEqual
  );
  const pois = useAppSelector((state) => state.poi.poisFromDb, shallowEqual);

  const [selectedPois, setSelectedPois] = useState<POI[]>([]);

  // maintain a list of selected POIs for the selected station, so we can display them
  useEffect(() => {
    if (selectedStation) {
      const selectedPois: POI[] = _.sortBy(
        pois.filter((poi) => selectedStation.poiUuids?.includes(poi.uuid)),
        "name"
      );
      setSelectedPois(selectedPois);
    }
  }, [selectedStation, pois]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Station POIs</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection} style={{ height: "100%" }}>
          <div className={paneStyles.panelSectionTitle}>
            <SubpanelHeading icon={faCircleDot}>POIs Linked to this Station</SubpanelHeading>
          </div>
          <div className={stationStyles.associatedPoisContainer}>
            {!editMode ? (
              <>
                {selectedPois.map((poi) => {
                  return (
                    poi && (
                      <>
                        <div
                          className={poiStyles.poiItem}
                          key={poi.uuid}
                          onClick={() => {
                            dispatch(setSectionSelected("poi"));
                            dispatch(setSelectedPoiUuid(poi.uuid));
                          }}
                        >
                          <div className={poiStyles.itemIcon}>
                            {String.fromCodePoint(parseInt(poi.icon, 16))}
                          </div>
                          <div className={`${poiStyles.name}`}>
                            <div>{poi.name}</div>
                            <div className={poiStyles.poiRightSpacer} />
                          </div>
                        </div>
                        <div className={poiStyles.poiAssocDescription}>
                          <div className={paneStyles.panelSectionTitle}>
                            <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
                          </div>
                          <div className={paneStyles.descriptionContainer}>
                            <WysiwygTextArea
                              value={poi.description}
                              editing={false}
                              onChange={() => {}}
                            />
                          </div>
                        </div>
                      </>
                    )
                  );
                })}
              </>
            ) : (
              <>
                {_.sortBy(pois, "name").map((poi) => {
                  const checked = selectedStation.poiUuids?.includes(poi.uuid);
                  return (
                    poi && (
                      <div
                        className={poiStyles.poiItem}
                        key={poi.uuid}
                        onMouseEnter={() => dispatch(setMapItemHoverUuid(poi.uuid))}
                        onMouseLeave={() => dispatch(setMapItemHoverUuid(null))}
                      >
                        <Checkbox
                          checked={checked}
                          onChange={(e) => {
                            const updatedStation: Station = {
                              ...selectedStation,
                              poiUuids: e.target.checked
                                ? [...selectedStation?.poiUuids, poi.uuid]
                                : selectedStation?.poiUuids.filter((uuid) => uuid !== poi.uuid),
                            };
                            dispatch(upsertStation(updatedStation));
                          }}
                          toolTip={`Link ${poi.name}`}
                        />

                        {poi.icon && (
                          <div className={poiStyles.itemIcon}>
                            {String.fromCodePoint(parseInt(poi.icon, 16))}
                          </div>
                        )}
                        <div className={`${poiStyles.name} ${poiStyles.nohover}`}>
                          <div>{poi.name}</div>
                          <div className={poiStyles.poiRightSpacer} />
                        </div>
                      </div>
                    )
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Poi_Panel;
