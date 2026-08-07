import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { LastEditedNumeric, SubpanelHeading } from "components/interface/_global-elements";
import { Button } from "components/interface/form/globalFields";
import {
  ValidatedInputField,
  ValidatedLatLngField,
  ValidatedTextArea,
} from "components/interface/form/globalFieldsAutomerge";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import { setSelectedStationRightNavItem } from "store/station";
import { calcCentroidofCoordinates, findGlobalGridCoordsFromPoint } from "utils/mapping/geoMath";
import { formatNumberWithCommas, isNotNumber, toDecimal } from "utils/formatting";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDocResetWalkback, thunkDocUpdateStationLocation } from "store/thunk/thunkStation";
import { makeTraverseRateString } from "utils/component-helpers";
import { validators, regExValidators } from "components/interface/form/formValidators";
import CalculatedDwell from "../calculated-dwell";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { setOriginalPoints, updateMapDirective } from "store/map";
import { getCalculatedFieldsByStation } from "store/processing/calculatedFields";
import { getLGRSCoordsFromLatLng } from "utils/surf-nav/surfNavWrapper";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdateStationByField } from "operations/apply/apply-station";
import { useResolvedMissionGrid } from "components/interface/map/hooks/useResolvedMissionGrid";

const Info_Panel: FunctionComponent<{
  editMode: boolean;
}> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const resolvedGrid = useResolvedMissionGrid();
  const partialMission = useMissionDocSelector(
    (mission) => ({
      walkbackRate: mission.walkbackRate,
      usingLGRSCoordinates: mission.usingLGRSCoordinates,
      planetRadius: mission.planetRadius,
      equipmentItems: mission.equipmentItems,
      landerLocation: mission.landerLocation,
      projBoundsMinY: mission.projBoundsMinY,
      projBoundsMaxY: mission.projBoundsMaxY,
      projBoundsMinX: mission.projBoundsMinX,
      projBoundsMaxX: mission.projBoundsMaxX,
      landerElevationMeters: mission.landerElevationMeters,
    }),
    deepEqual
  );

  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const docMaps = useMissionDocSelector(
    (mission) => ({
      stations: mission.stations,
      actions: mission.actions,
      pois: mission.pois,
    }),
    shallowEqual
  );
  const selectedStation = useMemo(
    () => docMaps?.stations[selectedStationUuid],
    [docMaps, selectedStationUuid]
  );
  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = useMemo(
    () => (mapDirective?.uuid === selectedStationUuid ? mapDirective : null),
    [mapDirective, selectedStationUuid]
  );
  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === selectedStationUuid),
    refEqual
  );
  const stationPoisLocations = useMemo(() => {
    if (!docMaps || !selectedStation) return [];
    return selectedStation.poiUuids.map((poiUuid) => {
      const poi = docMaps.pois[poiUuid];
      return poi?.location;
    });
  }, [docMaps, selectedStation]);

  const countEvasUsingThisStation = useMissionDocSelector((mission) => {
    let numEvas = 0;
    Object.values(mission?.evas ?? {}).forEach((eva) => {
      if (
        eva.ingressLocationUuid === selectedStationUuid ||
        eva.egressLocationUuid === selectedStationUuid
      ) {
        numEvas++;
      } else {
        eva.sequence.forEach((sequenceItem) => {
          if (sequenceItem.uuid === selectedStationUuid) {
            numEvas++;
          }
        });
      }
    });
    return numEvas;
  }, refEqual);

  const calculatedFields = useMemo(() => {
    if (!docMaps) return undefined;
    const stationActions = Object.values(docMaps.actions).filter(
      (a) => a.stationUuid === selectedStation?.uuid && a.enabled
    );
    return getCalculatedFieldsByStation({
      station: selectedStation,
      missionWalkbackRate: partialMission.walkbackRate,
      stationActions,
    });
  }, [docMaps, selectedStation, partialMission.walkbackRate]);

  const gridCornerPoint = useAppSelector((state) => state.map.gridCornerPoint, refEqual);
  const stationGridCoordinates = useMemo(() => {
    if (selectedStation?.location && partialMission.usingLGRSCoordinates) {
      return getLGRSCoordsFromLatLng(selectedStation.location.lat, selectedStation.location.lng);
    }
    if (selectedStation?.location && resolvedGrid.kind === "server-file" && gridCornerPoint) {
      return findGlobalGridCoordsFromPoint(
        resolvedGrid.grid.coordinates,
        selectedStation.location,
        partialMission.planetRadius
      );
    } else {
      return "Not set";
    }
  }, [
    selectedStation,
    partialMission.usingLGRSCoordinates,
    partialMission.planetRadius,
    gridCornerPoint,
    resolvedGrid,
  ]);

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
    const missionEquipItem = partialMission.equipmentItems[uuid];
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
    dispatch(
      thunkDocUpdateStationLocation({ location: centroid, stationUuid: selectedStation.uuid })
    );
  };

  const handleEditWalkback = async () => {
    dispatch(setOriginalPoints(selectedStation.walkbackPath));
    dispatch(
      thunkUpdateMapDirective({
        mapItemType: "walkback",
        uuid: selectedStation.uuid,
        mapAction: "editPolyline",
      })
    );
  };

  const handleCancelEditWalkback = () => {
    // Dispatched synchronously instead of via thunkUpdateMapDirective so the
    // 200ms delay can't let a trailing throttled drag write the edited path
    // to Automerge after the user already clicked Cancel.
    dispatch(
      updateMapDirective({
        uuid: selectedStation.uuid,
        mapItemType: "walkback",
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
    dispatch(thunkDocResetWalkback({ stationUuid: selectedStation.uuid }));
  }, [dispatch, selectedStation.uuid]);

  useEffect(() => {
    if (!selectedStation.walkbackPath) {
      // if there is no walkback, set the walkback to the default
      if (selectedStation.location && partialMission.landerLocation) {
        handleResetWalkback();
      }
    }
  }, [selectedStation, dispatch, handleResetWalkback, partialMission.landerLocation]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Station Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
            </div>
            <div className={paneStyles.fieldContainerAutomerge}>
              <ValidatedTextArea
                key={selectedStation.uuid}
                value={selectedStation.description || ""}
                editMode={editMode}
                onSubmit={(value: string) => {
                  withMissionChange((m) =>
                    applyUpdateStationByField(m, {
                      stationUuid: selectedStation.uuid,
                      fieldName: "description",
                      value: value || "",
                    })
                  );
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
                        <ValidatedInputField
                          value={selectedStation.duration?.toString()}
                          editMode={editMode}
                          fieldProps={{
                            name: "duration",
                            ariaLabel: "Time in minutes",
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
                          onSubmit={(val: string) => {
                            withMissionChange((m) =>
                              applyUpdateStationByField(m, {
                                stationUuid: selectedStation.uuid,
                                fieldName: "duration",
                                value: toDecimal(val),
                              })
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
                    {partialMission.landerLocation?.lat && partialMission.landerLocation?.lng ? (
                      saveButtonState !== "pending" && (
                        <Button
                          onClick={async () => {
                            await dispatch(
                              thunkDocUpdateStationLocation({
                                location: partialMission.landerLocation,
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
                  <ValidatedLatLngField
                    value={selectedStation.location}
                    editMode={editMode}
                    fieldPropsLat={{
                      name: "Lat",
                      ariaLabel: "LatitudeStation",
                      validators: [
                        validators.mustBeNumber,
                        validators.required,
                        validators.withinBoundary(
                          partialMission.projBoundsMinY,
                          partialMission.projBoundsMaxY
                        ),
                      ],
                    }}
                    fieldPropsLng={{
                      name: "Lng",
                      ariaLabel: "LongitudeStation",
                      validators: [
                        validators.mustBeNumber,
                        validators.required,
                        validators.withinBoundary(
                          partialMission.projBoundsMinX,
                          partialMission.projBoundsMaxX
                        ),
                      ],
                    }}
                    onSubmit={(val: AEGISPoint) => {
                      dispatch(
                        thunkDocUpdateStationLocation({
                          location: val,
                          stationUuid: selectedStation.uuid,
                        })
                      );
                    }}
                    key={`${selectedStation.uuid}-latlng`}
                  />
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
                          (
                            selectedStation.elevation - partialMission.landerElevationMeters
                          ).toFixed(0)
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
                {!partialMission.landerLocation && (
                  <div className={`${paneStyles.verticalCenter} ${paneStyles.buttonPlaceholder}`}>
                    <div className={paneStyles.panelText}>Mission lander location not set</div>
                  </div>
                )}

                {editMode &&
                  selectedStation.location &&
                  partialMission.landerLocation &&
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
                        <ValidatedInputField
                          value={selectedStation.walkbackTraverseRate?.toString()}
                          editMode={editMode}
                          fieldProps={{
                            name: "walkbackTraverseRate",
                            ariaLabel: "Average Walkback Traverse Rate",
                            validators: [validators.mustBeNumber, validators.maxLength(4)],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          onSubmit={(val: string) => {
                            withMissionChange((m) =>
                              applyUpdateStationByField(m, {
                                stationUuid: selectedStation.uuid,
                                fieldName: "walkbackTraverseRate",
                                value: toDecimal(val),
                              })
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
                          partialMission.walkbackRate
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
                      <LastEditedNumeric
                        updatedAt={selectedStation?.updatedAt}
                        createdAt={selectedStation?.createdAt}
                        info={[
                          ["Station UUID", selectedStation?.uuid],
                          ["Station RefUUID", selectedStation?.refUuid],
                        ]}
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
