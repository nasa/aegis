import type { FunctionComponent } from "react";
import { useMemo } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdateStationByField } from "client/automerge/apply/apply-station";
import stationStyles from "./station.module.css";
import { SubpanelHeading } from "components/interface/_global-elements";
import { Checkbox, TextArea } from "components/interface/form/globalFields";
import { setMapItemHoverType, setMapItemHoverUuid } from "store/hover";
import { faCircle, faMessage } from "@fortawesome/free-solid-svg-icons";
import { setSectionSelected } from "store/interface";
import { setSelectedPoiUuid } from "store/poi";
import sortBy from "lodash/sortBy";
import poiStyles from "../poi/poi.module.css";

const Poi_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const docMaps = useMissionDocSelector(
    (mission) => ({ stations: mission.stations, pois: mission.pois }),
    shallowEqual
  );
  const selectedStationPoiUuids = useMemo(
    () => docMaps?.stations[selectedStationUuid]?.poiUuids || [],
    [docMaps, selectedStationUuid]
  );
  const pois = useMemo(() => (docMaps ? Object.values(docMaps.pois) : []), [docMaps]);

  // maintain a list of selected POIs for the selected station, so we can display them
  const selectedPois = sortBy(
    pois.filter((poi) => selectedStationPoiUuids?.includes(poi.uuid)),
    [(poi) => poi.name.toLowerCase()]
  );

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Station POIs</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer} style={{ height: "-webkit-fill-available" }}>
          <div className={paneStyles.panelSection} style={{ height: "100%" }}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faCircle}>POIs Linked to this Station</SubpanelHeading>
            </div>
            <div className={stationStyles.associatedPoisContainer}>
              {!editMode ? (
                <>
                  {selectedPois.map((poi) => {
                    return (
                      poi && (
                        <div key={poi.uuid}>
                          <div
                            className={poiStyles.poiItem}
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
                              <TextArea
                                key={poi.uuid}
                                value={poi.description}
                                editing={false}
                                onSubmit={() => {}}
                                fieldProps={{
                                  name: "poiDescription",
                                  ariaLabel: "POI Description",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    );
                  })}
                </>
              ) : (
                <>
                  {sortBy(pois, [(poi) => poi.name.toLowerCase()]).map((poi) => {
                    const checked = selectedStationPoiUuids?.includes(poi.uuid);
                    return (
                      poi && (
                        <div
                          className={stationStyles.poiItem}
                          key={poi.uuid}
                          onMouseEnter={() => {
                            dispatch(setMapItemHoverUuid(poi.uuid));
                            dispatch(setMapItemHoverType("poi"));
                          }}
                          onMouseLeave={() => {
                            dispatch(setMapItemHoverUuid(null));
                            dispatch(setMapItemHoverType(null));
                          }}
                        >
                          <Checkbox
                            checked={checked}
                            onChange={(e) => {
                              const poiUuids = e.target.checked
                                ? [...selectedStationPoiUuids, poi.uuid]
                                : selectedStationPoiUuids.filter((uuid) => uuid !== poi.uuid);
                              withMissionChange((m) =>
                                applyUpdateStationByField(m, {
                                  stationUuid: selectedStationUuid,
                                  fieldName: "poiUuids",
                                  value: poiUuids,
                                })
                              );
                            }}
                            toolTip={`Link ${poi.name}`}
                            label={
                              <div className={stationStyles.poiCheckboxLabel}>
                                {poi.icon && (
                                  <div className={stationStyles.poiIcon}>
                                    {String.fromCodePoint(parseInt(poi.icon, 16))}
                                  </div>
                                )}
                                <div className={stationStyles.poiLabel}>{poi.name}</div>
                              </div>
                            }
                            uniqueId={poi.uuid}
                          />
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
    </div>
  );
};

export default Poi_Panel;
