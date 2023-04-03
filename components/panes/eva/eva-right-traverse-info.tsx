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
import { FunctionComponent } from "react";
import { useDispatch } from "react-redux";
import { upsertTraverse } from "store/traverse";
import { updateMapDirective } from "store/map";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import * as httpClient from "http-client/elevation";

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

  // planet radius value used to generate elevation profile
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const missionId = mission?.id;

  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === selectedTraverse?.uuid ? mapDirective : null;

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
    const R = parseFloat(mission?.config.msv.radius.minor);

    // dig the dem filename out of the MMGIS-formatted mission config
    const measureJson = mission?.config.tools.find((tool) => tool.name === "Measure")?.variables;
    const elevationResolutionMeters = measureJson["resolution"];
    const demFilepath: string = measureJson["dem"];

    // generate new elevation profile via api
    const newElevationProfile = await httpClient.getElevationProfile(
      missionId,
      demFilepath,
      selectedTraverse.path,
      selectedTraverse.pathSegmentDistances,
      elevationResolutionMeters || 10, // resolution in meters, default 10
      R
    );
    dispatch(
      upsertTraverse({
        ...selectedTraverse,
        pathSegmentElevations: newElevationProfile.data,
      })
    );

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
                        alert("Not implemented yet");
                      }}
                      icon={faMapLocationDot}
                      label="Reset Path"
                      style={{ width: "100px" }}
                    />
                  </>
                ) : (
                  <div className={paneStyles.buttonPlaceholder} />
                )}
                {editMode && mapAction === "editPolyline" && (
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
