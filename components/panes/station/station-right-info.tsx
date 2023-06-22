import { FunctionComponent, useCallback, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import stationStyles from "./station.module.css";
import {
  faCalculator,
  faClock,
  faFloppyDisk,
  faLocationDot,
  faMessage,
  faRoute,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { setSelectedStationRightNavItem, upsertStation } from "store/station";
import { updateMapDirective } from "store/map";
import { calcCentroidofCoordinates } from "utils/geoMath";
import { formatNumberWithCommas, toDecimal } from "utils/formatting";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkResetWalkback, thunkUpdateStationLocation } from "store/thunk/thunkStation";
import { displayFormattedTotalTimeObj } from "utils/component-helpers";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { round } from "lodash";
import { validators, regExValidators } from "components/interface/form/formValidators";

const Info_Panel: FunctionComponent<{
  editMode: boolean;
  totalStationTime: TotalTimeObj;
  actionCount: number;
}> = ({ editMode, totalStationTime, actionCount }) => {
  const dispatch = useDispatch();
  const thunkDispatch = useAppDispatch();
  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);

  const selectedStation = useAppSelector(
    (state) =>
      state.station.stations.find((station) => station.uuid === state.station.selectedStationUuid),
    shallowEqual
  );
  const landerLocation = useAppSelector(
    (state) => state.mission.mission.landerLocation,
    shallowEqual
  );
  const landerElevation = useAppSelector(
    (state) => state.mission.mission.landerElevationMeters,
    shallowEqual
  );
  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === selectedStation.uuid ? mapDirective : null;
  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === selectedStation.uuid),
    refEqual
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

  const calculatedFields = useAppSelector(
    (state) =>
      state.station.calculatedFields.find((calculated) => calculated.uuid === selectedStation.uuid),
    shallowEqual
  );

  const [saveButtonState, setSaveButtonState] = useState<saveButtonState>("disabled");

  useEffect(() => {
    if (elevationPendingIndex > -1) {
      setSaveButtonState("pending");
    } else {
      setSaveButtonState("enabled");
    }
  }, [elevationPendingIndex]);

  const dispatchStationMapAction = (mapAction: MapAction) => {
    dispatch(
      updateMapDirective({
        mapItemType: "station",
        uuid: selectedStation.uuid,
        mapAction,
      })
    );
  };

  const verifyNoActiveMapAction = (): boolean => {
    // if another mapAction is underway, fire an alert and return false

    if (mapDirective && mapDirective.mapAction !== null) {
      alert(
        "Another map action is underway. Please cancel or complete that action before creating a new one."
      );
      return false;
    } else {
      return true;
    }
  };

  const handleCreate = () => {
    if (verifyNoActiveMapAction()) {
      dispatchStationMapAction("createMarker");
    }
  };
  const handleCancelCreate = () => {
    dispatchStationMapAction("cancelCreateMarker");
  };

  const handleEdit = () => {
    if (verifyNoActiveMapAction()) {
      dispatchStationMapAction("editMarker");
    }
  };

  const handleCancelEdit = () => {
    dispatchStationMapAction("cancelEditMarker");
  };

  const handleCalcCentroid = () => {
    const poiLocs = selectedStation.poiUuids.map((poiUuid) => {
      const poi = pois.find((poi) => poi.uuid === poiUuid);
      return poi.location;
    });
    const centroid = calcCentroidofCoordinates(poiLocs);
    thunkDispatch(
      thunkUpdateStationLocation({ location: centroid, stationUuid: selectedStation.uuid })
    );
  };

  const handleEditWalkback = () => {
    if (verifyNoActiveMapAction()) {
      dispatch(
        updateMapDirective({
          mapItemType: "walkback",
          uuid: selectedStation.uuid,
          mapAction: "editPolyline",
        })
      );
    }
  };

  const handleCancelEditWalkback = () => {
    dispatch(
      updateMapDirective({
        ...mapDirective,
        mapAction: "cancelEditPolyline",
      })
    );
  };

  const handleSaveEditWalkback = () => {
    dispatch(
      updateMapDirective({
        ...mapDirective,
        mapAction: "saveEditPolyline",
      })
    );
  };

  const handleResetWalkback = useCallback(() => {
    thunkDispatch(thunkResetWalkback({ stationUuid: selectedStation.uuid }));
  }, [thunkDispatch, selectedStation.uuid]);

  useEffect(() => {
    if (!selectedStation.walkbackPath) {
      // if there is no walkback, set the walkback to the default
      if (selectedStation.location && landerLocation) {
        handleResetWalkback();
      }
    }
  }, [selectedStation, dispatch, handleResetWalkback, landerLocation]);

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

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
              <WysiwygTextArea
                value={selectedStation.description}
                editing={editMode}
                onChange={(value) => {
                  dispatch(
                    upsertStation({
                      ...selectedStation,
                      description: value,
                    })
                  );
                }} // handle innerHTML change
              />
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "6px" }}>
              <SubpanelHeading icon={faClock}>Estimated Dwell Time</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>Nominal (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          editing={editMode}
                          fieldProps={{
                            name: "durationLower",
                            ariaLabel: "Minimum Time in minutes",
                            style: { width: "45px" },
                            validators: [
                              validators.mustBeNumber,
                              validators.maxLength(4),
                              validators.cannotContainDecimals,
                            ],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          value={selectedStation.durationLower?.toString()}
                          onSubmit={(val: string) => {
                            dispatch(
                              upsertStation({
                                ...selectedStation,
                                durationLower: toDecimal(val),
                              })
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>Maximum (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          value={selectedStation.durationUpper?.toString()}
                          editing={editMode}
                          fieldProps={{
                            name: "durationUpper",
                            ariaLabel: "Maximum Time in minutes",
                            style: { width: "45px" },
                            validators: [
                              validators.mustBeNumber,
                              validators.maxLength(4),
                              validators.cannotContainDecimals,
                            ],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          onSubmit={(val: string) => {
                            dispatch(
                              upsertStation({
                                ...selectedStation,
                                durationUpper: toDecimal(val),
                              })
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faCalculator}>Totals</SubpanelHeading>
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
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Actions in this Station:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>{actionCount}</div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>EVAs Using this Station:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {evasUsingThisStation.length}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Total Action Time (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {totalStationTime?.durationLower === 0 &&
                        totalStationTime?.durationUpper === 0 ? (
                          <>N/A</>
                        ) : (
                          <>{displayFormattedTotalTimeObj(totalStationTime)}</>
                        )}
                      </div>
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
                {editMode && mapAction === null && (
                  <>
                    {!selectedStation.location ? (
                      <>
                        <Button
                          onClick={() => {
                            handleCreate();
                          }}
                          label="Create Location"
                          style={{ width: "110px" }}
                        />
                      </>
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
                        <>
                          <Button
                            onClick={() => {
                              handleCalcCentroid();
                            }}
                            label="POIs Centroid"
                            style={{ width: "95px" }}
                          />
                          <Button
                            onClick={async () => {
                              if (landerLocation?.lat && landerLocation?.lng) {
                                await thunkDispatch(
                                  thunkUpdateStationLocation({
                                    location: landerLocation,
                                    stationUuid: selectedStation.uuid,
                                  })
                                );
                              } else {
                                alert("No lander location specified for this mission");
                              }
                            }}
                            label="Set to Lander"
                            style={{ width: "95px" }}
                          />
                        </>
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
                    <div className={paneStyles.panelColumnTableCellLeft}>
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
                              validators: [validators.mustBeNumber, validators.required],
                            }}
                            styleContainer={{ fontSize: "0.8rem", fontWeight: 400 }}
                            onSubmit={(val: string) => {
                              dispatch(
                                upsertStation({
                                  ...selectedStation,
                                  location: {
                                    lat: parseFloat(val),
                                    lng: selectedStation.location.lng,
                                  },
                                })
                              );
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
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
                              validators: [validators.mustBeNumber, validators.required],
                            }}
                            styleContainer={{ fontSize: "0.8rem", fontWeight: 400 }}
                            onSubmit={(val: string) => {
                              dispatch(
                                upsertStation({
                                  ...selectedStation,
                                  location: {
                                    lat: selectedStation.location.lat,
                                    lng: parseFloat(val),
                                  },
                                })
                              );
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
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
                </div>
              </div>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelColumnItem}></div>
            </div>
          </div>

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faRoute}>Walkback Path</SubpanelHeading>
            </div>
            {editMode ? (
              <div className={`${paneStyles.panelSectionRow} ${paneStyles.sectionButtonRow}`}>
                {!selectedStation.location && (
                  <div className={`${paneStyles.verticalCenter} ${paneStyles.buttonPlaceholder}`}>
                    <div className={paneStyles.panelText}>Station Locaton not set</div>
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
                    <div className={paneStyles.panelColumnTableCellLeft}>
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
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Duration (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {!selectedStation.location ? (
                          <>N/A</>
                        ) : (
                          calculatedFields?.walkbackDurationMinutes?.toFixed(0)
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
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
                    <div className={paneStyles.panelColumnTableCellLeft}>
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
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSection2Column}>
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>
                      <LastEdited updatedAt={selectedStation?.updatedAt} />
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
