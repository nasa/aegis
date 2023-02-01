import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import { upsertStation } from "store/station";
import poiStyles from "../poi/poi.module.css";
import _ from "lodash";
import { Checkbox } from "components/interface/_global-elements";

const Poi_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedStationUuid = useSelector(
    (state: RootState) => state.station.selectedStationUuid,
    shallowEqual
  );
  const stations: Station[] = useSelector(
    (state: RootState) => state.station.stations,
    shallowEqual
  );
  const selectedStation = stations.find((station) => station.uuid === selectedStationUuid);
  const pois = useSelector((state: RootState) => state.poi.pois, shallowEqual);

  const [selectedPois, setSelectedPois] = useState<POI[]>([]);

  // maintain a list of selected POIs for the selected station, so we can display them
  useEffect(() => {
    if (selectedStation) {
      const selectedPois: POI[] = _.sortBy(
        pois.filter((poi) => selectedStation.poiUuids.includes(poi.uuid)),
        "name"
      );
      setSelectedPois(selectedPois);
    }
  }, [selectedStation, pois]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Station POIs</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>POIs Linked to this Station</div>
          {!editMode ? (
            <>
              {selectedPois.map((poi) => {
                return (
                  poi && (
                    <div className={poiStyles.poiItem} key={poi.uuid}>
                      <div className={poiStyles.checkboxPlaceholder}></div>
                      <div className={poiStyles.itemColor}>
                        {poi.color ? String.fromCodePoint(parseInt(poi.color.value, 16)) : ""}
                      </div>
                      <div className={`${poiStyles.name}`}>
                        <div>{poi.name}</div>
                        <div className={poiStyles.poiRightSpacer}></div>
                      </div>
                    </div>
                  )
                );
              })}
            </>
          ) : (
            <>
              {_.sortBy(pois, "name").map((poi) => {
                const checked = selectedStation.poiUuids.includes(poi.uuid);
                return (
                  poi && (
                    <div className={poiStyles.poiItem} key={poi.uuid}>
                      <Checkbox
                        checked={checked}
                        onChange={(e) => {
                          const updatedStation: Station = {
                            ...selectedStation,
                            poiUuids: e.target.checked
                              ? [...selectedStation.poiUuids, poi.uuid]
                              : selectedStation.poiUuids.filter((uuid) => uuid !== poi.uuid),
                          };
                          dispatch(upsertStation(updatedStation));
                        }}
                      />

                      {poi.color && (
                        <div className={poiStyles.itemColor}>
                          {poi.color ? String.fromCodePoint(parseInt(poi.color.value, 16)) : ""}
                        </div>
                      )}
                      <div className={`${poiStyles.name} ${poiStyles.nohover}`}>
                        <div>{poi.name}</div>
                        <div className={poiStyles.poiRightSpacer}></div>
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
  );
};

export default Poi_Panel;
