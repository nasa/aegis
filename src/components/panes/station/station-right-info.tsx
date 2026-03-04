import { FunctionComponent, useCallback, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import stationStyles from "./station.module.css";
import {
  faCalculator,
  faFloppyDisk,
  faLocationDot,
  faMessage,
  faQuestionCircle,
  faRoute,
  faToolbox,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { Button, InLineEditInput, TextArea } from "components/interface/form/globalFields";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import { setSelectedStationRightNavItem, upsertStationByField } from "store/station";
import { calcCentroidofCoordinates, findGlobalGridCoordsFromPoint } from "utils/mapping/geoMath";
import { formatNumberWithCommas, isNotNumber, toDecimal } from "utils/formatting";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  thunkResetWalkback,
  thunkUpdateStationLatLngField,
  thunkUpdateStationLocation,
} from "store/thunk/thunkStation";
import { makeTraverseRateString } from "utils/component-helpers";
import round from "lodash/round";
import { validators, regExValidators } from "components/interface/form/formValidators";
import CalculatedDwell from "../calculated-dwell";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { getCalculatedFieldsByStation } from "store/processing/calculatedFields";
import { globalGrid } from "utils/mapping/grid";
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
  const selectedStation = useAppSelector(
    (state) =>
      state.station.stations.find((station) => station.uuid === state.station.selectedStationUuid),
    deepEqual
  );
  const landerLocation = useAppSelector(
    (state) => state.mission.mission.landerLocation,
    shallowEqual
  );
  const landerElevation = useAppSelector(
    (state) => state.mission.mission.landerElevationMeters,
    refEqual
  );
  const thisMapDirective = useAppSelector((state) => {
    return state.map.mapDirective?.uuid === selectedStation.uuid ? state.map.mapDirective : null;
  }, shallowEqual);
  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === selectedStation.uuid),
    refEqual
  );
  const stationPoisLocations = useAppSelector(
    (state) =>
      selectedStation.poiUuids.map((poiUuid) => {
        const poi = state.poi.pois.find((p) => p.uuid === poiUuid);
        return poi.location;
      }),
    shallowEqual
  );

  const countEvasUsingThisStation = useAppSelector((state) => {
    let numEvas = 0;
    state.eva.evas.forEach((eva) => {
      if (
        eva.ingressLocationUuid === selectedStation.uuid ||
        eva.egressLocationUuid === selectedStation.uuid
      ) {
        numEvas++;
      } else {
        eva.sequence.forEach((sequenceItem) => {
          if (sequenceItem.uuid === selectedStation.uuid) {
            numEvas++;
          }
        });
      }
    });
    return numEvas;
  }, refEqual);

  const calculatedFields = useAppSelector((state) => {
    const stationActions = state.action.actions.filter(
      (a) => a.stationUuid === selectedStation?.uuid && a.enabled
    );
    return getCalculatedFieldsByStation({
      station: selectedStation,
      missionWalkbackRate: state.mission.mission.walkbackRate,
      stationActions,
    });
  }, deepEqual);
  const missionEquipItems = useAppSelector(
    (state) => state.mission.mission.equipmentItems,
    shallowEqual
  );

  const missionWalkbackRate = useAppSelector(
    (state) => state.mission.mission.walkbackRate,
    refEqual
  );

  const missionUsingLGRSCoordinates = useAppSelector(
    (state) => state.mission.mission.usingLGRSCoordinates,
    refEqual
  );

  const stationGridCoordinates = useAppSelector((state) => {
    if (selectedStation.location && missionUsingLGRSCoordinates) {
      return getLGRSCoordsFromLatLng(selectedStation.location.lat, selectedStation.location.lng);
    }
    if (selectedStation.location && globalGrid?.coordinates && state.map.gridCornerPoint) {
      return findGlobalGridCoordsFromPoint(
        globalGrid.coordinates,
        selectedStation.location,
        state.mission.mission.planetRadius
      );
    } else {
      return "Not set";
    }
  }, deepEqual);

  const [saveButtonState, setSaveButtonState] = useState<saveButtonState>("disabled");

  useEffect(() => {
    if (elevationPendingIndex > -1) {
      setSaveButtonState("pending");
    } else {
      setSaveButtonState("enabled");
    }
  }, [elevationPendingIndex]);

  //get names
  const consumablesDisplay: EquipmentItemDisplay[] = [];
  Object.entries(calculatedFields?.equipmentItems).forEach(([uuid, equipItemUsage]) => {
    //find item in mission
    const missionEquipItem = missionEquipItems[uuid];
    if (missionEquipItem?.singleUse) {
      consumablesDisplay.push({
        name: missionEquipItem.name,
        quantityUsed: equipItemUsage.quantityUsed,
      });
    }
  });
  //sort by name
  consumablesDisplay.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  const consumablesCol1 = consumablesDisplay.slice(0, Math.ceil(consumablesDisplay.length / 2));
  const consumablesCol2 = consumablesDisplay.slice(Math.ceil(consumablesDisplay.length / 2));

  //sort by name
  consumablesDisplay.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  const dispatchStationMapAction = (mapAction: MapAction) => {
    dispatch(
      thunkUpdateMapDirective({
        mapItemType: "station",
        uuid: selectedStation.uuid,
        mapAction,
      })
    );
  };

  const handleCreate = async () => {
    dispatchStationMapAction("createMarker");
  };
  const handleCancelCreate = () => {
    dispatchStationMapAction("cancelCreateMarker");
  };

  const handleEdit = async () => {
    dispatchStationMapAction("editMarker");
  };

  const handleCancelEdit = () => {
    dispatchStationMapAction("cancelEditMarker");
  };

  const handleCalcCentroid = () => {
    const centroid = calcCentroidofCoordinates(stationPoisLocations);
    dispatch(thunkUpdateStationLocation({ location: centroid, stationUuid: selectedStation.uuid }));
  };

  const handleEditWalkback = async () => {
    dispatch(
      thunkUpdateMapDirective({
        mapItemType: "walkback",
        uuid: selectedStation.uuid,
        mapAction: "editPolyline",
      })
    );
  };

  const handleCancelEditWalkback = () => {
    dispatch(
      thunkUpdateMapDirective({
        mapItemType: "walkback",
        uuid: selectedStation.uuid,
        mapAction: "cancelEditPolyline",
      })
    );
  };

  const handleSaveEditWalkback = () => {
    dispatch(
      thunkUpdateMapDirective({
        mapItemType: "walkback",
        uuid: selectedStation.uuid,
        mapAction: "saveEditPolyline",
      })
    );
  };

  const handleResetWalkback = useCallback(() => {
    dispatch(thunkResetWalkback({ stationUuid: selectedStation.uuid }));
  }, [dispatch, selectedStation.uuid]);

  useEffect(() => {
    if (!selectedStation.walkbackPath) {
      // if there is no walkback, set the walkback to the default
      if (selectedStation.location && landerLocation) {
        handleResetWalkback();
      }
    }
  }, [selectedStation, dispatch, handleResetWalkback, landerLocation]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Station Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
            </div>
            <div className={paneStyles.descriptionContainer}>
              <TextArea
                key={selectedStation.uuid}
                value={selectedStation.description}
                editing={editMode}
                onSubmit={(value: string) => {
                  dispatch(upsertStationByField(selectedStation.uuid, "description", value || ""));
                }}
                fieldProps={{ name: "stationDescription", ariaLabel: "Station Description" }}
              />
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "6px" }}>
              <SubpanelHeading icon={faQuestionCircle}>Estimated Dwell Time</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldLabel}>Time (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          value={selectedStation.duration?.toString()}
                          editing={editMode}
                          fieldProps={{
                            name: "duration",
                            ariaLabel: "Time in minutes",
                            style: { width: "45px" },
                            validators: [
                              validators.mustBeNumber,
                              validators.maxLength(4),
                              validators.mustBeInteger,
                              validators.mustBeNumberGTZero,
                            ],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          onSubmit={(val) => {
                            dispatch(
                              upsertStationByField(selectedStation.uuid, "duration", toDecimal(val))
                            );
                          }}
                          key={`${selectedStation.uuid}-duration`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      {isNotNumber(selectedStation?.duration) && (
                        <div
                          style={{ color: "var(--grey5)" }}
                          className={paneStyles.inputFieldLabel}
                        >{`Using Calculated Total Dwell Time: ${Math.ceil(calculatedFields?.totalDwellTime)}`}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
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
                      dispatch(setSelectedStationRightNavItem("actions_panel"));
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Number of Actions:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {calculatedFields?.actionCount}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Total Action Time (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {calculatedFields?.totalActionTime === 0 ? (
                          <>0</>
                        ) : (
                          <>{Math.ceil(calculatedFields?.totalActionTime)}</>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Total Mass (g):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {calculatedFields?.totalMass}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>&nbsp;</div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>EVAs Using this Station:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {countEvasUsingThisStation}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={paneStyles.panelColumnTable}>
                  <CalculatedDwell actionsCalculatedFields={calculatedFields} />
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
                {editMode && mapAction === null && (
                  <>
                    {!selectedStation.location ? (
                      <Button
                        onClick={() => {
                          handleCreate();
                        }}
                        label="Create Location"
                        style={{ width: "110px" }}
                      />
                    ) : saveButtonState !== "pending" ? (
                      <Button
                        onClick={() => {
                          handleEdit();
                        }}
                        label="Edit on Map"
                        style={{ width: "90px" }}
                      />
                    ) : (
                      <span className={stationStyles.statusLoading} />
                    )}
                    {selectedStation.poiUuids?.length > 0 ? (
                      saveButtonState !== "pending" && (
                        <Button
                          onClick={() => {
                            handleCalcCentroid();
                          }}
                          label="POIs Centroid"
                          style={{ width: "95px" }}
                        />
                      )
                    ) : (
                      <></>
                    )}
                    {landerLocation?.lat && landerLocation?.lng ? (
                      saveButtonState !== "pending" && (
                        <Button
                          onClick={async () => {
                            await dispatch(
                              thunkUpdateStationLocation({
                                location: landerLocation,
                                stationUuid: selectedStation.uuid,
                              })
                            );
                          }}
                          label="Set to Lander"
                          style={{ width: "95px" }}
                        />
                      )
                    ) : (
                      <></>
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
                        {!selectedStation.location ? (
                          <>Not set</>
                        ) : (
                          <InLineEditInput
                            value={round(selectedStation.location.lat, 6).toString()}
                            editing={editMode}
                            fieldProps={{
                              name: "Lat",
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
                                thunkUpdateStationLatLngField({
                                  stationUuid: selectedStation.uuid,
                                  type: "lat",
                                  value: parseFloat(val),
                                })
                              );
                            }}
                            key={`${selectedStation.uuid}-lat`}
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
                        {!selectedStation.location ? (
                          <>Not set</>
                        ) : (
                          <InLineEditInput
                            value={round(selectedStation.location.lng, 6).toString()}
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
                                thunkUpdateStationLatLngField({
                                  stationUuid: selectedStation.uuid,
                                  type: "lng",
                                  value: parseFloat(val),
                                })
                              );
                            }}
                            key={`${selectedStation.uuid}-lng`}
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
                        {!selectedStation.elevation ? (
                          <>Not set</>
                        ) : (
                          (selectedStation.elevation - landerElevation).toFixed(0)
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Grid Coords:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>{stationGridCoordinates}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelColumnItem}></div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faRoute}>Walkback</SubpanelHeading>
            </div>
            {editMode ? (
              <div className={`${paneStyles.panelSectionRow} ${paneStyles.sectionButtonRow}`}>
                {!selectedStation.location && (
                  <div className={`${paneStyles.verticalCenter} ${paneStyles.buttonPlaceholder}`}>
                    <div className={paneStyles.panelText}>Station Location not set</div>
                  </div>
                )}
                {!landerLocation && (
                  <div className={`${paneStyles.verticalCenter} ${paneStyles.buttonPlaceholder}`}>
                    <div className={paneStyles.panelText}>Mission lander location not set</div>
                  </div>
                )}

                {editMode &&
                  selectedStation.location &&
                  landerLocation &&
                  mapAction === null &&
                  (saveButtonState === "pending" ? (
                    <span className={stationStyles.statusLoading} />
                  ) : (
                    <>
                      <Button
                        onClick={() => {
                          handleEditWalkback();
                        }}
                        label="Edit Path on Map"
                        style={{ width: "115px" }}
                      />

                      <Button
                        onClick={() => {
                          handleResetWalkback();
                        }}
                        label="Reset Path"
                        style={{ width: "85px" }}
                      />
                    </>
                  ))}
                {editMode &&
                  mapAction === "editPolyline" &&
                  (saveButtonState === "pending" ? (
                    <>
                      <span className={stationStyles.statusLoading} />
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={() => {
                          handleSaveEditWalkback();
                        }}
                        icon={faFloppyDisk}
                        label="Finished"
                        style={{ width: "90px" }}
                      />

                      <Button
                        onClick={() => {
                          handleCancelEditWalkback();
                        }}
                        icon={faXmark}
                        label="Cancel"
                        style={{ width: "75px" }}
                      />
                    </>
                  ))}
              </div>
            ) : (
              <div className={paneStyles.sectionButtonRowEmpty} />
            )}

            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Distance (m):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {!selectedStation.location ? (
                          <>N/A</>
                        ) : (
                          formatNumberWithCommas(calculatedFields?.walkbackDistanceMeters)
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Time (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {!selectedStation.location ? (
                          <>N/A</>
                        ) : (
                          Math.ceil(calculatedFields?.walkbackDurationMinutes)
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Total Ascent (m):</div>
                    </div>

                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {!selectedStation.location ? (
                          <>N/A</>
                        ) : (
                          formatNumberWithCommas(
                            calculatedFields?.walkbackAscentDescent.totalMetersClimbed
                          )
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Total Descent (m):</div>
                    </div>

                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {!selectedStation.location ? (
                          <>N/A</>
                        ) : (
                          formatNumberWithCommas(
                            calculatedFields?.walkbackAscentDescent.totalMetersDescended
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className={paneStyles.panelSectionRow} style={{ marginTop: "6px" }}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldLabel}>
                        Walkback Traverse Rate (km/h):
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          value={selectedStation.walkbackTraverseRate?.toString()}
                          editing={editMode}
                          fieldProps={{
                            name: "walkbackTraverseRate",
                            ariaLabel: "Average Walkback Traverse Rate",
                            style: { width: "55px" },
                            validators: [validators.mustBeNumber, validators.maxLength(4)],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          onSubmit={(val: string) => {
                            dispatch(
                              upsertStationByField(
                                selectedStation.uuid,
                                "walkbackTraverseRate",
                                toDecimal(val)
                              )
                            );
                          }}
                          key={`${selectedStation.uuid}-walkbackTraverseRate`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div style={{ color: "var(--grey5)" }} className={paneStyles.inputFieldLabel}>
                        {makeTraverseRateString(
                          selectedStation.walkbackTraverseRate,
                          null,
                          missionWalkbackRate
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faToolbox}>Consumable Equipment Totals</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  {consumablesCol1 &&
                    consumablesCol1.map((equipmentItem, index) => {
                      return (
                        <div
                          className={paneStyles.panelColumnTableRow}
                          key={`${equipmentItem.name}${index}`}
                        >
                          <div className={paneStyles.panelColumnTableCell}>
                            <div className={paneStyles.displayFieldLabel}>{equipmentItem.name}</div>
                          </div>
                          <div className={paneStyles.panelColumnTableCell}>
                            <div className={paneStyles.displayFieldValue}>
                              {equipmentItem.quantityUsed ? `${equipmentItem.quantityUsed}` : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div className={paneStyles.panelColumnTable}>
                  {consumablesCol2 &&
                    consumablesCol2.map((equipmentItem, index) => {
                      return (
                        <div
                          className={paneStyles.panelColumnTableRow}
                          key={`${equipmentItem.name}${index}`}
                        >
                          <div className={paneStyles.panelColumnTableCell}>
                            <div className={paneStyles.displayFieldLabel}>{equipmentItem.name}</div>
                          </div>
                          <div className={paneStyles.panelColumnTableCell}>
                            <div className={paneStyles.displayFieldValue}>
                              {equipmentItem.quantityUsed ? `${equipmentItem.quantityUsed}` : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                        updatedAt={selectedStation?.updatedAt}
                        createdAt={selectedStation?.createdAt}
                        infoString={`Station UUID: ${selectedStation?.uuid}`}
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
