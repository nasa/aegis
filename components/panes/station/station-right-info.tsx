import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faLocationDot, faMapLocationDot, faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  ContentEditableTextArea,
  IconButton,
  InLineEditInput,
  MultiButton,
} from "components/interface/_global-elements";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { upsertStation } from "store/station";
import { upsertUserMapObject } from "store/map";
import { calcCentroidofCoordinates } from "utils/geoMath";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);
  const selectedStation = useAppSelector(
    (state) =>
      state.station.stations.find((station) => station.uuid === state.station.selectedStationUuid),
    shallowEqual
  );
  const userMapObject = useAppSelector(
    (state) =>
      state.map.userMapObjects.find((mapObject) => mapObject.uuid === selectedStation.uuid),
    shallowEqual
  );
  const evasUsingThisStation = useAppSelector((state) => {
    const evasUsingThisStation = [];
    state.eva.evas.forEach((eva) => {
      eva.sequence.forEach((sequenceItem) => {
        if (sequenceItem.uuid === selectedStation.uuid) {
          evasUsingThisStation.push(eva);
        }
      });
    });
    return evasUsingThisStation;
  }, shallowEqual);

  const mapAction = userMapObject ? userMapObject.mapAction : null;

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Station Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Status</div>
            <MultiButton
              editing={editMode}
              selected={selectedStation.status}
              handleChange={(newStatus) => {
                console.log(newStatus);
                dispatch(upsertStation({ ...selectedStation, status: newStatus }));
              }}
            >
              <button type="button">Archived</button>
              <button type="button">Candidate</button>
              <button type="button">In Review</button>
              <button type="button">Approved</button>
            </MultiButton>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSmallField}>
                <div className={paneStyles.panelSectionTitle}>Radius (m)</div>
                <div className={paneStyles.inputField}>
                  <InLineEditInput
                    fieldName="Radius"
                    editing={editMode}
                    maxLength={4}
                    styleInput={{ width: "45px" }}
                    containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                    value={selectedStation.radius.toString()}
                    onChange={(val: string) => {
                      dispatch(upsertStation({ ...selectedStation, radius: +val }));
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Station Value & Notes</div>
            <ContentEditableTextArea
              html={selectedStation.description} // innerHTML of the editable div
              editing={editMode}
              onChange={(evt) => {
                dispatch(
                  upsertStation({
                    ...selectedStation,
                    description: evt.target.value,
                  })
                );
              }} // handle innerHTML change
            />
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>EVA Compositions Using This Station</div>
            <div className={paneStyles.panelSectionRow} style={{ marginTop: "3px", gap: "5px" }}>
              {evasUsingThisStation.map((eva, index) => (
                <div key={eva.uuid} className={paneStyles.verticalCenter}>
                  <div className={paneStyles.panelText} style={{ paddingLeft: "8px" }}>
                    {eva.name}
                    {index !== 0 && <>,</>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Location</div>

            <div className={paneStyles.panelSectionRow} style={{ marginTop: "3px", gap: "5px" }}>
              <>
                {(selectedStation.location || editMode) && (
                  <div className={paneStyles.verticalCenter}>
                    <FontAwesomeIcon icon={faLocationDot} />
                  </div>
                )}
                <div className={paneStyles.verticalCenter}>
                  <div className={paneStyles.panelText}>
                    {selectedStation.location && (
                      <>
                        Lat: {`${selectedStation.location?.lat.toFixed(6)}`}
                        <br />
                        Lng: {`${selectedStation.location?.lng.toFixed(6)}`}
                      </>
                    )}
                  </div>
                </div>
                {editMode && mapAction === null ? (
                  <>
                    {!selectedStation.location ? (
                      <>
                        <IconButton
                          onClick={() => {
                            dispatch(
                              upsertUserMapObject({
                                mapItemType: "station",
                                uuid: selectedStation.uuid,
                                createdAt: new Date().toISOString(),
                                mapAction: "create",
                              })
                            );
                          }}
                          icon={faMapLocationDot}
                          label="Create Location"
                          style={{ width: "130px" }}
                        />
                      </>
                    ) : (
                      <IconButton
                        onClick={() => {
                          dispatch(
                            upsertUserMapObject({
                              mapItemType: "station",
                              uuid: selectedStation.uuid,
                              createdAt: new Date().toISOString(),
                              mapAction: "edit",
                            })
                          );
                        }}
                        icon={faMapLocationDot}
                        label="Edit on Map"
                        style={{ width: "105px" }}
                      />
                    )}
                    {selectedStation.poiUuids?.length > 0 && (
                      <>
                        <IconButton
                          onClick={() => {
                            const poiLocs = selectedStation.poiUuids.map((poiUuid) => {
                              const poi = pois.find((poi) => poi.uuid === poiUuid);
                              return poi.location;
                            });
                            const centroid = calcCentroidofCoordinates(poiLocs);
                            dispatch(
                              upsertStation({
                                ...selectedStation,
                                location: centroid,
                              })
                            );
                          }}
                          icon={faMapLocationDot}
                          label="POIs Centroid"
                          style={{ width: "115px" }}
                        />
                        <IconButton
                          onClick={() => {
                            alert("Not implemented yet");
                          }}
                          icon={faMapLocationDot}
                          label="Lander"
                          style={{ width: "70px" }}
                        />
                      </>
                    )}
                  </>
                ) : (
                  <div className={paneStyles.buttonPlaceholder}></div>
                )}
                {editMode && mapAction === "create" && (
                  <IconButton
                    onClick={() => {
                      dispatch(
                        upsertUserMapObject({
                          mapItemType: "station",
                          uuid: selectedStation.uuid,
                          createdAt: new Date().toISOString(),
                          mapAction: "cancelCreate",
                        })
                      );
                    }}
                    icon={faXmark}
                    label="Cancel"
                    style={{ width: "70px" }}
                  />
                )}
                {editMode && mapAction === "edit" && (
                  <>
                    <IconButton
                      onClick={() => {
                        dispatch(
                          upsertUserMapObject({
                            mapItemType: "station",
                            uuid: selectedStation.uuid,
                            createdAt: new Date().toISOString(),
                            mapAction: "cancelEdit",
                          })
                        );
                      }}
                      icon={faXmark}
                      label="Cancel"
                      style={{ width: "70px" }}
                    />
                  </>
                )}
                {!editMode && !selectedStation.location && (
                  <div className={paneStyles.panelText}>Location not yet set</div>
                )}
              </>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
