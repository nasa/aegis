import type { FunctionComponent } from "react";
import { useCallback, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import missionStyles from "./mission.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, shallowEqual, deepEqual } from "utils/useAppSelector";
import {
  LastEditedNumeric,
  LoadingOverlay,
  SubpanelHeading,
} from "components/interface/_global-elements";
import {
  faFileInvoice,
  faInfoCircle,
  faMessage,
  faMountain,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import {
  ValidatedInputField,
  ValidatedLatLngField,
  ValidatedTextArea,
} from "components/interface/form/globalFieldsAutomerge";
import { regExValidators, validators } from "components/interface/form/formValidators";
import { toDecimal } from "utils/formatting";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { globalGrid } from "utils/mapping/grid";
import { findGlobalGridCoordsFromPoint } from "utils/mapping/geoMath";
import { getLGRSCoordsFromLatLng } from "utils/surf-nav/surfNavWrapper";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { thunkDocUpdateLanderLocation } from "store/thunk/thunkMission";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  // Access the automerge mission document via the useDocument hook instead of the
  // useMissionDocSelector (to read) and updateMissionByField (to write). This is because for this
  // component, in particular, we access most/all of the properties of mission and it is simpler
  const automergeUrl = useAppSelector((state) => state.mission.automergeUrl, shallowEqual);
  const [automergeMission, changeMissionDoc] = useDocument<Mission>(automergeUrl as AutomergeUrl);

  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);

  // Wrapper to also update the updatedAt field when any change is made
  const changeAutomergeMission = useCallback(
    (updateFn: (m: Mission) => void) => {
      changeMissionDoc((m: Mission) => {
        updateFn(m);
        m.updatedAt = new Date().getTime();
      });
    },
    [changeMissionDoc]
  );

  const thisMapDirective = useAppSelector((state) => {
    return state.map.mapDirective?.uuid === "lander" ? state.map.mapDirective : null;
  }, shallowEqual);

  const landerGridCoordinates = useAppSelector((state) => {
    if (automergeMission.landerLocation && automergeMission.usingLGRSCoordinates) {
      return getLGRSCoordsFromLatLng(
        automergeMission.landerLocation.lat,
        automergeMission.landerLocation.lng
      );
    } else if (
      automergeMission.landerLocation &&
      globalGrid?.coordinates &&
      state.map.gridCornerPoint
    ) {
      return findGlobalGridCoordsFromPoint(
        globalGrid.coordinates,
        automergeMission.landerLocation,
        automergeMission.planetRadius
      );
    } else {
      return "Not set";
    }
  }, deepEqual);

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const dispatchMissionMapAction = (mapAction: MapAction) => {
    dispatch(
      thunkUpdateMapDirective({
        mapItemType: "lander",
        uuid: "lander",
        mapAction,
      })
    );
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
        Mission Preferences
      </div>
      {automergeMission && (
        <div className={paneStyles.rightBodyBody}>
          <div className={paneStyles.panelContainer}>
            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                <SubpanelHeading icon={faInfoCircle}>Mission Name</SubpanelHeading>
              </div>
              <div className={paneStyles.fieldContainerAutomerge}>
                {automergeMission && (
                  <ValidatedInputField
                    value={automergeMission.name}
                    fieldProps={{
                      name: "name",
                      ariaLabel: "Mission Name",
                      validators: [validators.required, validators.maxLength(50)],
                    }}
                    onSubmit={(value) => {
                      changeAutomergeMission((m) => {
                        m.name = value;
                      });
                    }}
                    key={`${automergeMission.id}-name`}
                    editMode={editMode}
                  />
                )}
              </div>
            </div>
            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                <SubpanelHeading icon={faInfoCircle}>Top Banner</SubpanelHeading>
              </div>
              <div className={paneStyles.fieldContainerAutomerge}>
                <ValidatedInputField
                  value={automergeMission.missionBanner}
                  fieldProps={{
                    name: "missionBanner",
                    ariaLabel: "Mission Banner",
                    validators: [validators.maxLength(255)],
                  }}
                  onSubmit={(value) => {
                    changeAutomergeMission((m) => {
                      m.missionBanner = value || "";
                    });
                  }}
                  key={`${automergeMission.id}-banner`}
                  editMode={editMode}
                />
              </div>
            </div>
            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
              </div>
              <div className={paneStyles.fieldContainerAutomerge}>
                <ValidatedTextArea
                  value={automergeMission.description || ""}
                  fieldProps={{
                    name: "description",
                    ariaLabel: "Mission Description",
                  }}
                  onSubmit={(value) => {
                    changeAutomergeMission((m) => {
                      m.description = value || "";
                    });
                  }}
                  key={`${automergeMission.id}-description`}
                  editMode={editMode}
                />
              </div>
            </div>

            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle}>
                <div className={missionStyles.lander}>
                  <img
                    src="/images/lander.svg"
                    alt="Lander Icon"
                    style={{ width: "15px", marginRight: "3px" }}
                  />
                  <div>Lander Location</div>
                </div>
              </div>

              {editMode ? (
                <div className={`${paneStyles.panelSectionRow} ${paneStyles.sectionButtonRow}`}>
                  <>
                    {editMode && mapAction === null && (
                      <>
                        {!automergeMission.landerLocation ? (
                          <Button
                            onClick={() => {
                              dispatchMissionMapAction("createMarker");
                            }}
                            label="Create Location"
                            style={{ width: "110px" }}
                          />
                        ) : (
                          <Button
                            onClick={() => {
                              dispatchMissionMapAction("editMarker");
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
                          dispatchMissionMapAction("cancelCreateMarker");
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
                            dispatchMissionMapAction("cancelEditMarker");
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
                    <ValidatedLatLngField
                      value={automergeMission.landerLocation}
                      editMode={editMode}
                      fieldPropsLat={{
                        name: "lat",
                        ariaLabel: "LatitudePref",
                        validators: [
                          validators.mustBeNumber,
                          validators.required,
                          validators.withinBoundary(
                            automergeMission.projBoundsMinY,
                            automergeMission.projBoundsMaxY
                          ),
                        ],
                      }}
                      fieldPropsLng={{
                        name: "Lng",
                        ariaLabel: "LongitudePref",
                        validators: [
                          validators.mustBeNumber,
                          validators.required,
                          validators.withinBoundary(
                            automergeMission.projBoundsMinX,
                            automergeMission.projBoundsMaxX
                          ),
                        ],
                      }}
                      onSubmit={async (val: AEGISPoint) => {
                        setShowLoadingOverlay(true);
                        await dispatch(thunkDocUpdateLanderLocation({ location: val }));
                        setShowLoadingOverlay(false);
                      }}
                      key={`${automergeMission.id}-latlng`}
                    />
                  </div>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldLabel}>Absolute Elevation (m):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {!automergeMission.landerElevationMeters ? (
                            <>Not set</>
                          ) : (
                            automergeMission.landerElevationMeters.toFixed(0)
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldLabel}>Grid Coords:</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>{landerGridCoordinates}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className={paneStyles.panelSection}>
              <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "6px" }}>
                <SubpanelHeading icon={faFileInvoice}>Mission Defaults</SubpanelHeading>
              </div>
              <div className={paneStyles.panelSectionRow}>
                <div className={paneStyles.panelSection2Column}>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.inputFieldLabel}>EVA Duration (mins):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.fieldContainerAutomergeInline}>
                          <ValidatedInputField
                            value={automergeMission.defaultEvaDuration?.toString() || ""}
                            editMode={editMode}
                            fieldProps={{
                              name: "defaultEvaDuration",
                              ariaLabel: "Default EVA Duration",
                              validators: [
                                validators.mustBeNumber,
                                validators.maxLength(4),
                                validators.mustBeInteger,
                              ],
                            }}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            }}
                            onSubmit={(val: string) => {
                              changeAutomergeMission((m) => {
                                m.defaultEvaDuration = toDecimal(val);
                              });
                            }}
                            key={`${automergeMission.id}-defaultEvaDuration`}
                          />
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.inputFieldLabel}>Traverse Rate (km/h):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.fieldContainerAutomergeInline}>
                          <ValidatedInputField
                            value={automergeMission.traverseRate?.toString() || ""}
                            editMode={editMode}
                            fieldProps={{
                              name: "defaultTraverseRate",
                              ariaLabel: "Average traverse rate",
                              validators: [validators.mustBeNumber, validators.maxLength(8)],
                            }}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            }}
                            onSubmit={(val: string) => {
                              changeAutomergeMission((m) => {
                                m.traverseRate = toDecimal(val);
                              });
                            }}
                            key={`${automergeMission.id}-defaultTraverseRate`}
                          />
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.inputFieldLabel}>Walkback Rate (km/h):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.fieldContainerAutomergeInline}>
                          <ValidatedInputField
                            value={automergeMission.walkbackRate?.toString() || ""}
                            editMode={editMode}
                            fieldProps={{
                              name: "defaultWalkbackRate",
                              ariaLabel: "Default walkback rate",
                              validators: [validators.mustBeNumber, validators.maxLength(8)],
                            }}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            }}
                            onSubmit={(val: string) => {
                              changeAutomergeMission((m) => {
                                m.walkbackRate = toDecimal(val);
                              });
                            }}
                            key={`${automergeMission.id}-defaultWalkbackRate`}
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
                <SubpanelHeading icon={faMountain}>DEM Information</SubpanelHeading>
              </div>
              <div className={paneStyles.panelSectionRow}>
                <div className={paneStyles.panelSection2Column}>
                  <div className={paneStyles.panelColumnTable}>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldLabel}>Filename:</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {automergeMission.demFilePath}
                        </div>
                      </div>
                    </div>
                    <div className={paneStyles.panelColumnTableRow}>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldLabel}>Resolution (m):</div>
                      </div>
                      <div className={paneStyles.panelColumnTableCell}>
                        <div className={paneStyles.displayFieldValue}>
                          {automergeMission.demResolution}
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
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        <LastEditedNumeric
                          updatedAt={automergeMission?.updatedAt}
                          createdAt={automergeMission?.createdAt}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showLoadingOverlay && <LoadingOverlay message="Please Wait..." />}
    </div>
  );
};

export default Info_Panel;
