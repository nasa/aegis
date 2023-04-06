import {
  faFloppyDisk,
  faMapLocationDot,
  faRoute,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  ContentEditableTextArea,
  IconButton,
  InLineEditInput,
  LastEdited,
} from "components/interface/_global-elements";
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { upsertTraverse } from "store/traverse";
import { updateMapDirective } from "store/map";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
import * as httpClient from "http-client/elevation";
import { getDistanceBetweenTwoCoordinates } from "utils/geoMath";
import { insertElevationPending, removeElevationPending } from "store/interface";

const EvaRightTraverseInfo: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedTraverse = useAppSelector(
    (state) =>
      state.traverse.traverses.find((traverse) => traverse.uuid === selectedEvaSequenceItemUuid),
    shallowEqual
  );
  const defaultTraverseSpeed = useAppSelector(
    (state) => state.mission.mission.traverseSpeed,
    refEqual
  );
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const evaSequence = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid).sequence,
    shallowEqual
  );
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === selectedTraverse.uuid),
    refEqual
  );

  // planet radius value used to generate elevation profile
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);

  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === selectedTraverse?.uuid ? mapDirective : null;

  const [saveButtonState, setSaveButtonState] = useState<saveButtonState>("disabled");

  useEffect(() => {
    if (elevationPendingIndex > -1) {
      setSaveButtonState("pending");
    } else {
      setSaveButtonState("enabled");
    }
  }, [elevationPendingIndex]);

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

  //todo move to thunk. repeated in map-body-leaflet.tsx
  const getElevation = useCallback(
    async (
      path: AEGISPoint[],
      pathSegmentDistances: number[],
      uuid: string
    ): Promise<number[][]> => {
      dispatch(insertElevationPending(uuid));
      const R = parseFloat(mission?.config.msv.radius.minor);

      // dig the dem filename out of the MMGIS-formatted mission config
      const measureJson = mission?.config.tools.find((tool) => tool.name === "Measure")?.variables;
      const elevationResolutionMeters = measureJson["resolution"];
      const demFilepath: string = measureJson["dem"];

      // generate new elevation profile via api
      const newElevationProfile = await httpClient.getElevationProfile(
        mission.id,
        demFilepath,
        path,
        pathSegmentDistances,
        elevationResolutionMeters || 10, // resolution in meters, default 10
        R
      );
      dispatch(removeElevationPending(uuid));
      return newElevationProfile.data;
    },
    [mission, dispatch]
  );

  const handlePathEdit = () => {
    if (verifyNoActiveMapAction()) {
      dispatch(
        updateMapDirective({
          uuid: selectedTraverse.uuid,
          mapItemType: "traverse",
          mapAction: "editPolyline",
        })
      );
    }
  };

  const handlePathFinished = async () => {
    dispatch(
      updateMapDirective({
        ...mapDirective,
        mapAction: "saveEditPolyline",
      })
    );
  };

  const handleCancelPathEdit = () => {
    dispatch(
      updateMapDirective({
        ...mapDirective,
        mapAction: "cancelEditPolyline",
      })
    );
  };

  const handlePathReset = async () => {
    //reset path to stations endpoints
    const sequenceIndex = evaSequence.findIndex(
      (sequenceItem) => sequenceItem.uuid === selectedEvaSequenceItemUuid
    );
    if (sequenceIndex < 1) return;
    const fromStation = stations.find(
      (station) => station.uuid === evaSequence[sequenceIndex - 1].uuid
    );
    const toStation = stations.find(
      (station) => station.uuid === evaSequence[sequenceIndex + 1].uuid
    );
    const newPath = [fromStation.location, toStation.location];

    //get new distances and elevation
    const newPathSegmentDistances = [
      getDistanceBetweenTwoCoordinates(
        newPath[0],
        newPath[1],
        parseFloat(mission?.config.msv.radius.minor)
      ),
    ];
    const newPathSegmentElevations = await getElevation(
      newPath,
      newPathSegmentDistances,
      selectedTraverse.uuid
    );

    //update store
    dispatch(
      upsertTraverse({
        ...selectedTraverse,
        path: newPath,
        pathSegmentDistances: newPathSegmentDistances,
        pathSegmentElevations: newPathSegmentElevations,
      })
    );
  };

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const durationMinutes = () => {
    //convert meters to km, then divide by traverse speed to get minutes
    const distanceMeters = selectedTraverse.pathSegmentDistances?.reduce(
      (accumulator, currentVal) => {
        return accumulator + currentVal;
      },
      0
    );
    const distanceKm = distanceMeters / 1000;
    const durationHours = distanceKm / defaultTraverseSpeed;
    const durationMinutes = durationHours * 60;
    return durationMinutes.toFixed(2);
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Traverse Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Min Duration (mins)</div>
                <div className={paneStyles.inputField}>
                  <InLineEditInput
                    fieldName="Min Duration"
                    editing={editMode}
                    maxLength={3}
                    styleInput={{ width: "55px" }}
                    containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                    value={selectedTraverse.durationLower?.toString()}
                    onChange={(val) => {
                      dispatch(
                        upsertTraverse({ ...selectedTraverse, durationLower: parseFloat(val) })
                      );
                    }}
                  />
                </div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Max Duration (mins)</div>
                <div className={paneStyles.inputField}>
                  <InLineEditInput
                    fieldName="Max Duration"
                    editing={editMode}
                    maxLength={3}
                    styleInput={{ width: "55px" }}
                    containerStyle={{ fontSize: "0.8em", fontWeight: 400 }}
                    value={selectedTraverse.durationUpper?.toString()}
                    onChange={(val) => {
                      dispatch(
                        upsertTraverse({ ...selectedTraverse, durationUpper: parseFloat(val) })
                      );
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Traverse Description</div>
            <ContentEditableTextArea
              html={selectedTraverse.description} // innerHTML of the editable div
              editing={editMode}
              onChange={(evt) => {
                dispatch(
                  upsertTraverse({
                    ...selectedTraverse,
                    description: evt.target.value,
                  })
                );
              }} // handle innerHTML change
            />
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Calculated Values</div>
            <div className={paneStyles.panelSectionRow} style={{ marginTop: "8px" }}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Traverse Distance</div>
                <div className={paneStyles.panelDisplayVal}>
                  {selectedTraverse.pathSegmentDistances
                    ?.reduce((accumulator, currentVal) => accumulator + currentVal, 0)
                    .toFixed(2)}
                  &nbsp;m
                </div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Walk-back Duration (min)</div>
                <div className={paneStyles.panelText}>{durationMinutes()}</div>
              </div>
            </div>
            <div className={paneStyles.panelSectionRow} style={{ marginTop: "8px" }}>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Traverse Total m Climbed</div>
                <div className={paneStyles.panelDisplayVal}>m</div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Traverse Total m Descended</div>
                <div className={paneStyles.panelDisplayVal}>m</div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Path</div>

            <div className={paneStyles.panelSectionRow} style={{ marginTop: "3px", gap: "5px" }}>
              <>
                {(selectedTraverse.path || editMode) && (
                  <div className={paneStyles.verticalCenter}>
                    <FontAwesomeIcon icon={faRoute} />
                  </div>
                )}
                <div className={paneStyles.verticalCenter}>
                  <div className={paneStyles.panelText}>
                    {selectedTraverse.path && <>{selectedTraverse.path.length}&nbsp;points</>}
                  </div>
                </div>
                {editMode && mapAction === null ? (
                  <>
                    <IconButton
                      onClick={() => {
                        handlePathEdit();
                      }}
                      icon={faRoute}
                      label="Edit Path on Map"
                      style={{ width: "135px" }}
                    />

                    <IconButton
                      onClick={() => {
                        handlePathReset();
                      }}
                      icon={faMapLocationDot}
                      label="Reset Path"
                      style={{ width: "100px" }}
                    />
                  </>
                ) : (
                  <div className={paneStyles.buttonPlaceholder} />
                )}
                {editMode && mapAction === "editPolyline" ? (
                  saveButtonState === "pending" ? (
                    <>
                      <span className={evaStyles.statusLoading} />
                    </>
                  ) : (
                    <>
                      <IconButton
                        onClick={() => {
                          handlePathFinished();
                        }}
                        icon={faFloppyDisk}
                        label="Finished"
                        style={{ width: "90px" }}
                      />

                      <IconButton
                        onClick={() => {
                          handleCancelPathEdit();
                        }}
                        icon={faXmark}
                        label="Cancel"
                        style={{ width: "75px" }}
                      />
                    </>
                  )
                ) : (
                  <></>
                )}

                {!editMode && !selectedTraverse.path && (
                  <div className={paneStyles.panelText}>Location not yet set</div>
                )}
              </>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Last Edited</div>
            <div className={paneStyles.verticalCenter}>
              <div className={paneStyles.panelText}>
                <LastEdited updatedAt={selectedTraverse?.updatedAt} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaRightTraverseInfo;
