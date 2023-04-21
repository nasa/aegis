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
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { upsertTraverse } from "store/traverse";
import { updateMapDirective } from "store/map";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "./eva.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkResetTraverse } from "store/thunk/thunkTraverse";

const EvaRightTraverseInfo: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const appDispatch = useAppDispatch();
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
  const elevationPendingIndex = useAppSelector(
    (state) =>
      state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === selectedTraverse.uuid),
    refEqual
  );

  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === selectedTraverse?.uuid ? mapDirective : null;

  const [saveButtonState, setSaveButtonState] = useState<saveButtonState>("disabled");

  const calculateAscentAndDescent = () => {
    const returnValue = {
      totalMetersClimbed: 0,
      totalMetersDescended: 0,
    };
    const elevations = selectedTraverse.pathSegmentElevations;
    if (!elevations) return returnValue;

    //Loop through the multidimensional array of elevations
    for (const elevation of elevations) {
      // loop over all but the last element (note i < elevation.length - 1)
      for (let i = 0; i < elevation.length - 1; i++) {
        const difference = elevation[i + 1] - elevation[i];
        if (difference > 0) {
          returnValue.totalMetersClimbed += difference;
        } else {
          returnValue.totalMetersDescended += -difference;
        }
      }
    }
    return returnValue;
  };

  const elevationTotals = calculateAscentAndDescent();

  const totalMetersClimbed = elevationTotals.totalMetersClimbed.toFixed(2);
  const totalMetersDescended = elevationTotals.totalMetersDescended.toFixed(2);

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
    appDispatch(thunkResetTraverse({ traverseUuid: selectedTraverse.uuid }));
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
                <div className={paneStyles.panelDisplayVal}>{totalMetersClimbed}m</div>
              </div>
              <div className={paneStyles.panelMediumField}>
                <div className={paneStyles.panelSectionTitle}>Traverse Total m Descended</div>
                <div className={paneStyles.panelDisplayVal}>{totalMetersDescended}m</div>
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
