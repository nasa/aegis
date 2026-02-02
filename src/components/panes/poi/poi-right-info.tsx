import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faCalculator, faLocationDot, faMessage, faXmark } from "@fortawesome/free-solid-svg-icons";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { Button, InLineEditInput, TextArea } from "components/interface/form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, shallowEqual, deepEqual, refEqual } from "utils/useAppSelector";
import { setSelectedPOIRightNavItem, upsertPoiByField } from "store/poi";
import round from "lodash/round";
import { validators } from "components/interface/form/formValidators";
import { thunkUpdatePoiLatLngField } from "store/thunk/thunkPoi";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { getCalculatedFieldsByPoi } from "store/processing/calculatedFields";
import { globalGrid } from "utils/mapping/grid";
import { findGlobalGridCoordsFromPoint } from "utils/mapping/geoMath";
import { getLGRSCoordsFromLatLng } from "utils/surf-nav/surfNavWrapper";

const Info_Panel: FunctionComponent<{
  editMode: boolean;
}> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const [projBoundsMinX, projBoundsMaxX] = useAppSelector((state) => {
    return [state.mission.mission.projBoundsMinX, state.mission.mission.projBoundsMaxX];
  }, deepEqual);
  const [projBoundsMinY, projBoundsMaxY] = useAppSelector((state) => {
    return [state.mission.mission.projBoundsMinY, state.mission.mission.projBoundsMaxY];
  }, deepEqual);
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === state.poi.selectedPoiUuid),
    deepEqual
  );
  const numStationsUsingPoi = useAppSelector(
    (state) =>
      state.station.stations.filter((station) => station.poiUuids.includes(selectedPoi.uuid))
        .length,
    refEqual
  );
  const landerElevation = useAppSelector(
    (state) => state.mission.mission.landerElevationMeters,
    refEqual
  );

  const poiCalcFields = useAppSelector((state) => {
    const poiActions = state.action.actions.filter(
      (a) => a.poiUuid === selectedPoi.uuid && a.enabled
    );
    return getCalculatedFieldsByPoi({
      poiUuid: selectedPoi.uuid,
      poiActions,
    });
  }, deepEqual);

  const thisMapDirective = useAppSelector((state) => {
    return state.map.mapDirective?.uuid === selectedPoi.uuid ? state.map.mapDirective : null;
  }, shallowEqual);

  const missionUsingLGRSCoordinates = useAppSelector(
    (state) => state.mission.mission.usingLGRSCoordinates,
    refEqual
  );

  const poiGridCoordinates = useAppSelector((state) => {
    if (selectedPoi.location && missionUsingLGRSCoordinates) {
      return getLGRSCoordsFromLatLng(selectedPoi.location.lat, selectedPoi.location.lng);
    } else if (selectedPoi.location && globalGrid?.coordinates && state.map.gridCornerPoint) {
      return findGlobalGridCoordsFromPoint(
        globalGrid.coordinates,
        selectedPoi.location,
        state.mission.mission.planetRadius
      );
    } else {
      return "Not set";
    }
  }, deepEqual);

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const dispatchPoiMapAction = (mapAction: MapAction) => {
    dispatch(
      thunkUpdateMapDirective({
        mapItemType: "poi",
        uuid: selectedPoi.uuid,
        mapAction,
      })
    );
  };

  const handleCreate = async () => {
    dispatchPoiMapAction("createMarker");
  };
  const handleCancelCreate = () => {
    dispatchPoiMapAction("cancelCreateMarker");
  };

  const handleEdit = async () => {
    dispatchPoiMapAction("editMarker");
  };

  const handleCancelEdit = () => {
    dispatchPoiMapAction("cancelEditMarker");
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>POI Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
            </div>
            <div className={paneStyles.descriptionContainer}>
              <TextArea
                value={selectedPoi.description}
                editing={editMode}
                onSubmit={(value: string) => {
                  dispatch(upsertPoiByField(selectedPoi.uuid, "description", value));
                }}
                fieldProps={{
                  name: "poiDescription",
                  ariaLabel: "POI Description",
                }}
                key={selectedPoi.uuid}
              />
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faCalculator}>Calculated Totals</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div
                    className={paneStyles.panelColumnTableRow}
                    onClick={() => {
                      dispatch(setSelectedPOIRightNavItem("actions_panel"));
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Number of Actions:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {poiCalcFields?.actionCount}
                      </div>
                    </div>
                  </div>
                  <div
                    className={paneStyles.panelColumnTableRow}
                    onClick={() => {
                      dispatch(setSelectedPOIRightNavItem("actions_panel"));
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Total Action Time (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {poiCalcFields?.totalActionTime === 0 ? (
                          <>0</>
                        ) : (
                          <>{Math.ceil(poiCalcFields?.totalActionTime)}</>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Total Mass (g):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>{poiCalcFields?.totalMass}</div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Stations using this POI:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>{numStationsUsingPoi}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faLocationDot}>Location</SubpanelHeading>
            </div>

            {editMode ? (
              <div className={`${paneStyles.panelSectionRow} ${paneStyles.sectionButtonRow}`}>
                <>
                  {editMode && mapAction === null && (
                    <>
                      {!selectedPoi.location ? (
                        <Button
                          onClick={() => {
                            handleCreate();
                          }}
                          label="Create Location"
                          style={{ width: "110px" }}
                        />
                      ) : (
                        <Button
                          onClick={() => {
                            handleEdit();
                          }}
                          label="Edit on Map"
                          style={{ width: "90px" }}
                        />
                      )}
                    </>
                  )}
                  {editMode && mapAction === "createMarker" && (
                    <Button
                      onClick={() => {
                        handleCancelCreate();
                      }}
                      icon={faXmark}
                      label="Cancel"
                      style={{ width: "70px" }}
                    />
                  )}
                  {editMode && mapAction === "editMarker" && (
                    <>
                      <Button
                        onClick={() => {
                          handleCancelEdit();
                        }}
                        icon={faXmark}
                        label="Cancel"
                        style={{ width: "70px" }}
                      />
                    </>
                  )}
                </>
              </div>
            ) : (
              <div className={paneStyles.sectionButtonRowEmpty} />
            )}

            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Lat:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {!selectedPoi.location ? (
                          <>Not set</>
                        ) : (
                          <InLineEditInput
                            value={round(selectedPoi.location.lat, 6).toString()}
                            editing={editMode}
                            fieldProps={{
                              name: "lat",
                              ariaLabel: "Latitude",
                              style: { width: "100px" },
                              validators: [
                                validators.mustBeNumber,
                                validators.required,
                                validators.withinBoundary(projBoundsMinY, projBoundsMaxY),
                              ],
                            }}
                            styleContainer={{ fontSize: "0.8rem", fontWeight: 400 }}
                            onSubmit={(val: string) => {
                              dispatch(
                                thunkUpdatePoiLatLngField({
                                  poiUuid: selectedPoi.uuid,
                                  type: "lat",
                                  value: parseFloat(val),
                                })
                              );
                            }}
                            key={`${selectedPoi.uuid}-lat`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Lng:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {!selectedPoi.location ? (
                          <>Not set</>
                        ) : (
                          <InLineEditInput
                            value={round(selectedPoi.location.lng, 6).toString()}
                            editing={editMode}
                            fieldProps={{
                              name: "Lng",
                              ariaLabel: "Longitude",
                              style: { width: "100px" },
                              validators: [
                                validators.mustBeNumber,
                                validators.required,
                                validators.withinBoundary(projBoundsMinX, projBoundsMaxX),
                              ],
                            }}
                            styleContainer={{ fontSize: "0.8rem", fontWeight: 400 }}
                            onSubmit={(val: string) => {
                              dispatch(
                                thunkUpdatePoiLatLngField({
                                  poiUuid: selectedPoi.uuid,
                                  type: "lng",
                                  value: parseFloat(val),
                                })
                              );
                            }}
                            key={`${selectedPoi.uuid}-lng`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Relative Elevation (m):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {!selectedPoi.elevation ? (
                          <>Not set</>
                        ) : (
                          (selectedPoi.elevation - landerElevation).toFixed(0)
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Grid Coords:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>{poiGridCoordinates}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSection2Column}>
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>
                      <LastEdited
                        updatedAt={selectedPoi?.updatedAt}
                        createdAt={selectedPoi?.createdAt}
                        infoString={`POI UUID: ${selectedPoi?.uuid}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
