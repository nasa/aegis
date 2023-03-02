import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import {
  faFloppyDisk,
  faLocationDot,
  faMapLocationDot,
  faRoute,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  ContentEditableTextArea,
  IconButton,
  InLineEditInput,
  LastEdited,
} from "components/interface/_global-elements";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { setSelectedStationRightNavItem, upsertStation } from "store/station";
import { updateMapDirective } from "store/map";
import { calcCentroidofCoordinates } from "utils/geoMath";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const selectedStation = useAppSelector(
    (state) =>
      state.station.stations.find((station) => station.uuid === state.station.selectedStationUuid),
    shallowEqual
  );
  const landerLocation = useAppSelector(
    (state) => state.mission.mission.landerLocation,
    shallowEqual
  );
  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === selectedStation.uuid ? mapDirective : null;

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

  const [totalStationTime, setTotalStationTime] = useState({
    durationLower: 0,
    durationUpper: 0,
  });
  const [actionCount, setActionCount] = useState(0);

  useEffect(() => {
    let totalDurationLower = 0;
    let totalDurationUpper = 0;
    actions.forEach((action) => {
      if (action.stationUuid === selectedStation.uuid) {
        totalDurationLower += action.durationLower;
        totalDurationUpper += action.durationUpper;
      }
    });
    setTotalStationTime({
      durationLower: totalDurationLower,
      durationUpper: totalDurationUpper,
    });

    let actionCount = 0;
    actions.forEach((action) => {
      if (action.stationUuid === selectedStation.uuid) {
        actionCount++;
      }
    });
    setActionCount(actionCount);
  }, [actions, selectedStation.uuid]);

  const displayStationTime = () => {
    if (totalStationTime.durationLower === totalStationTime.durationUpper) {
      return totalStationTime.durationLower;
    } else {
      return `${totalStationTime.durationLower} - ${totalStationTime.durationUpper}`;
    }
  };

  useEffect(() => {
    if (!selectedStation.walkbackLocation) {
      // if there is no walkback, set the walkback to the default
      if (selectedStation.location) {
        dispatch(
          upsertStation({
            ...selectedStation,
            walkbackLocation: [
              {
                lat: selectedStation.location?.lat,
                lng: selectedStation.location?.lng,
              },
              {
                lat: selectedStation.location?.lat - 0.01,
                lng: selectedStation.location?.lng - 0.01,
              },
            ],
            walkbackDistance: 50,
          })
        );
      }
    }
  }, [selectedStation, dispatch]);

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
    dispatch(
      upsertStation({
        ...selectedStation,
        location: centroid,
      })
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

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Station Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
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
            <div className={paneStyles.panelSectionRow} style={{ marginTop: "3px", gap: "5px" }}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>EVAs Using This Station</div>
                <div className={paneStyles.panelText}>{evasUsingThisStation.length}</div>
              </div>
              <div
                className={paneStyles.panelSmallField}
                onClick={() => {
                  dispatch(setSelectedStationRightNavItem("actions_panel"));
                }}
                style={{ cursor: "pointer" }}
              >
                <div className={paneStyles.panelSectionTitle}>Actions</div>
                <div className={paneStyles.panelText}>{actionCount}</div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Total Station Time</div>
                <div className={paneStyles.panelDisplayVal}>
                  <>{displayStationTime()}</>&nbsp;mins
                </div>
              </div>
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
                <div className={paneStyles.panelText}>
                  {selectedStation.location && (
                    <>
                      Lat: {`${selectedStation.location?.lat.toFixed(6)}`}
                      <br />
                      Lng: {`${selectedStation.location?.lng.toFixed(6)}`}
                    </>
                  )}
                </div>
                {editMode && mapAction === null ? (
                  <>
                    {!selectedStation.location ? (
                      <>
                        <IconButton
                          onClick={() => {
                            handleCreate();
                          }}
                          icon={faMapLocationDot}
                          label="Create Location"
                          style={{ width: "130px" }}
                        />
                      </>
                    ) : (
                      <IconButton
                        onClick={() => {
                          handleEdit();
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
                            handleCalcCentroid();
                          }}
                          icon={faMapLocationDot}
                          label="POIs Centroid"
                          style={{ width: "115px" }}
                        />
                        <IconButton
                          onClick={() => {
                            if (landerLocation?.lat && landerLocation?.lng) {
                              dispatch(
                                upsertStation({
                                  ...selectedStation,
                                  location: landerLocation,
                                })
                              );
                            } else {
                              alert("No lander location specified for this mission");
                            }
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
                {editMode && mapAction === "createMarker" && (
                  <IconButton
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
                    <IconButton
                      onClick={() => {
                        handleCancelEdit();
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

          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Walk-back Traverse</div>
            <div
              className={paneStyles.panelSectionRow}
              style={{ marginTop: "6px", marginBottom: "3px", gap: "5px" }}
            >
              {(selectedStation.location || editMode) && (
                <div className={paneStyles.verticalCenter}>
                  <FontAwesomeIcon icon={faLocationDot} />
                </div>
              )}
              <div className={paneStyles.verticalCenter}>
                <div className={paneStyles.panelText}>
                  {selectedStation.walkbackLocation && (
                    <>{selectedStation.walkbackLocation.length}&nbsp;points</>
                  )}
                </div>
              </div>

              {editMode && mapAction === null ? (
                <>
                  <IconButton
                    onClick={() => {
                      handleEditWalkback();
                    }}
                    icon={faRoute}
                    label="Edit Path on Map"
                    style={{ width: "135px" }}
                  />

                  <IconButton
                    onClick={() => {
                      alert("Not implemented yet");
                    }}
                    icon={faMapLocationDot}
                    label="Reset Path"
                    style={{ width: "100px" }}
                  />
                </>
              ) : (
                <div className={paneStyles.buttonPlaceholder}></div>
              )}
              {editMode && mapAction === "editPolyline" && (
                <>
                  <IconButton
                    onClick={() => {
                      handleSaveEditWalkback();
                    }}
                    icon={faFloppyDisk}
                    label="Finished"
                    style={{ width: "90px" }}
                  />

                  <IconButton
                    onClick={() => {
                      handleCancelEditWalkback();
                    }}
                    icon={faXmark}
                    label="Cancel"
                    style={{ width: "75px" }}
                  />
                </>
              )}
            </div>
            <div className={paneStyles.panelSectionRow} style={{ marginTop: "3px", gap: "5px" }}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Walk-back Distance</div>
                <div className={paneStyles.panelText}>
                  {selectedStation.walkbackDistance?.toFixed(2)}&nbsp;m
                </div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Walk-back Duration</div>
                <div className={paneStyles.panelText}>TBD</div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Last Edited</div>
            <div className={paneStyles.verticalCenter}>
              <div className={paneStyles.panelText}>
                <LastEdited updatedAt={selectedStation?.updatedAt} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
