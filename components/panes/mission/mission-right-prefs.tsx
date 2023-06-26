import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import _, { round } from "lodash";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import {
  faClock,
  faEarthAmerica,
  faInfoCircle,
  faLocationDot,
  faMessage,
  faMountain,
  faSun,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  Checkbox,
  DegreesInputSlider,
  InLineEditInput,
} from "components/interface/form/globalFields";
import { regExValidators, validators } from "components/interface/form/formValidators";
import { setMission } from "store/mission";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { updateMapDirective } from "store/map";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const stationsEditing = useAppSelector((state) => state.station.stationsEditing, shallowEqual);

  const thisMapDirective = mapDirective?.uuid === "lander" ? mapDirective : null;

  const dispatchMissionMapAction = (mapAction: MapAction) => {
    dispatch(
      updateMapDirective({
        mapItemType: "lander",
        uuid: "lander",
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

  const verifyNoStationsBeingEdited = (): boolean => {
    if (stationsEditing.length > 0) {
      alert(
        "You are currently editing a station. Please save or cancel your changes before attempting to move the lander location."
      );
      return false;
    } else {
      return true;
    }
  };

  const handleCreate = () => {
    if (verifyNoActiveMapAction()) {
      dispatchMissionMapAction("createMarker");
    }
  };
  const handleCancelCreate = () => {
    dispatchMissionMapAction("cancelCreateMarker");
  };

  const handleEdit = () => {
    if (verifyNoActiveMapAction() && verifyNoStationsBeingEdited()) {
      dispatchMissionMapAction("editMarker");
    }
  };

  const handleCancelEdit = () => {
    dispatchMissionMapAction("cancelEditMarker");
  };

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const measureJson = mission?.config.tools.find((tool) => tool.name === "Measure")?.variables;
  const demConfig: DemConfig = {
    dem: measureJson["dem"],
    resolution: measureJson["resolution"],
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Mission Preferences</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
            <SubpanelHeading icon={faInfoCircle}>Mission Name</SubpanelHeading>
          </div>
          <div className={paneStyles.descriptionContainer}>
            <InLineEditInput
              value={mission.name}
              editing={editMode}
              fieldProps={{
                name: "name",
                ariaLabel: "Mission Name",
                style: { width: "100%" },
                validators: [validators.required, validators.maxLength(50)],
              }}
              styleContainer={{ fontSize: "0.8rem", fontWeight: 400 }}
              onSubmit={(value) => {
                dispatch(setMission({ ...mission, name: value }));
              }}
            />
          </div>
        </div>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
            <SubpanelHeading icon={faInfoCircle}>Top Banner</SubpanelHeading>
          </div>
          <div className={paneStyles.descriptionContainer}>
            <InLineEditInput
              value={mission.config.missionBanner}
              editing={editMode}
              fieldProps={{
                name: "name",
                ariaLabel: "Mission Banner",
                style: { width: "100%" },
                validators: [validators.maxLength(50)],
              }}
              styleContainer={{ fontSize: "0.8rem", fontWeight: 400 }}
              onSubmit={(value) => {
                const newConfig = { ...mission.config, missionBanner: value };
                dispatch(setMission({ ...mission, config: newConfig }));
              }}
            />
          </div>
        </div>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>
            <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
          </div>
          <div className={paneStyles.descriptionContainer}>
            <WysiwygTextArea
              value={mission.description}
              editing={editMode}
              onChange={(value) => {
                dispatch(
                  setMission({
                    ...mission,
                    description: value,
                  })
                );
              }} // handle innerHTML change
            />
          </div>
        </div>

        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>
            <SubpanelHeading icon={faLocationDot}>Lander Location</SubpanelHeading>
          </div>

          {editMode ? (
            <div className={`${paneStyles.panelSectionRow} ${paneStyles.sectionButtonRow}`}>
              <>
                {editMode && mapAction === null && (
                  <>
                    {!mission.landerLocation ? (
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
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.displayFieldLabel}>Lat:</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>
                      {!mission.landerLocation ? (
                        <>Not set</>
                      ) : (
                        <InLineEditInput
                          value={round(mission.landerLocation.lat, 6).toString()}
                          editing={editMode}
                          fieldProps={{
                            name: "lat",
                            ariaLabel: "Latitude",
                            style: { width: "100px" },
                            validators: [validators.mustBeNumber, validators.required],
                          }}
                          styleContainer={{ fontSize: "0.8rem", fontWeight: 400 }}
                          onSubmit={(val: string) => {
                            dispatch(
                              setMission({
                                ...mission,
                                landerLocation: {
                                  ...mission.landerLocation,
                                  lat: Number(val),
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
                      {!mission.landerLocation ? (
                        <>Not set</>
                      ) : (
                        <InLineEditInput
                          value={round(mission.landerLocation.lng, 6).toString()}
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
                              setMission({
                                ...mission,
                                landerLocation: {
                                  ...mission.landerLocation,
                                  lng: Number(val),
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
                    <div className={paneStyles.displayFieldLabel}>Absolute Elevation (m):</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>
                      {!mission.landerElevationMeters ? (
                        <>Not set</>
                      ) : (
                        mission.landerElevationMeters.toFixed(0)
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
            <SubpanelHeading icon={faSun}>Sun Direction</SubpanelHeading>
          </div>
          <div className={paneStyles.panelSectionRow}>
            <div className={paneStyles.degreesInputContainer}>
              <div className={paneStyles.descriptionContainer}>
                <DegreesInputSlider
                  value={mission.sunAzimuth}
                  editable={editMode}
                  label="Azimuth"
                  onChange={(value) => {
                    dispatch(
                      setMission({
                        ...mission,
                        sunAzimuth: value,
                      })
                    );
                  }}
                />
              </div>
              <div className={paneStyles.displayFieldLabel} style={{ marginLeft: "18px" }}>
                <div style={{ display: "flex" }}>
                  <div style={{ marginTop: "3px" }}>Visible:</div>
                  <div style={{ marginLeft: "3px" }}>
                    <Checkbox
                      checked={mission.sunAzimuthVisible}
                      editable={editMode}
                      onChange={(e) => {
                        dispatch(setMission({ ...mission, sunAzimuthVisible: e.target.checked }));
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
            <SubpanelHeading icon={faEarthAmerica}>Earth Direction</SubpanelHeading>
          </div>
          <div className={paneStyles.panelSectionRow}>
            <div className={paneStyles.degreesInputContainer}>
              <div className={paneStyles.descriptionContainer}>
                <DegreesInputSlider
                  value={mission.earthAzimuth}
                  editable={editMode}
                  label="Azimuth"
                  onChange={(value) => {
                    dispatch(
                      setMission({
                        ...mission,
                        earthAzimuth: value,
                      })
                    );
                  }}
                />
              </div>
              <div className={paneStyles.displayFieldLabel} style={{ marginLeft: "18px" }}>
                <div style={{ display: "flex" }}>
                  <div style={{ marginTop: "3px" }}>Visible:</div>
                  <div style={{ marginLeft: "3px" }}>
                    <Checkbox
                      checked={mission.earthAzimuthVisible}
                      editable={editMode}
                      onChange={(e) => {
                        dispatch(setMission({ ...mission, earthAzimuthVisible: e.target.checked }));
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "6px" }}>
            <SubpanelHeading icon={faClock}>Mission Defaults</SubpanelHeading>
          </div>
          <div className={paneStyles.panelSectionRow}>
            <div className={paneStyles.panelSection2Column}>
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.inputFieldLabel}>EVA Duration (mins):</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.inputFieldValue}>
                      <InLineEditInput
                        editing={editMode}
                        fieldProps={{
                          name: "defaultEvaDuration",
                          ariaLabel: "Time in minutes",
                          style: { width: "45px" },
                          validators: [
                            validators.mustBeNumber,
                            validators.maxLength(4),
                            validators.mustBeInteger,
                          ],
                          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                            e.target.value = e.target.value.replace(
                              regExValidators.regExNumber,
                              ""
                            );
                          },
                        }}
                        value={mission.defaultEvaDuration?.toString()}
                        onSubmit={(val: string) => {
                          dispatch(setMission({ ...mission, defaultEvaDuration: Number(val) }));
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.inputFieldLabel}>Traverse Speed (km/h):</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.inputFieldValue}>
                      <InLineEditInput
                        editing={editMode}
                        fieldProps={{
                          name: "defaultTraverseSpeed",
                          ariaLabel: "Time in minutes",
                          style: { width: "45px" },
                          validators: [
                            validators.mustBeNumber,
                            validators.maxLength(2),
                            validators.mustBeInteger,
                          ],
                          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                            e.target.value = e.target.value.replace(
                              regExValidators.regExNumber,
                              ""
                            );
                          },
                        }}
                        value={mission.traverseSpeed?.toString()}
                        onSubmit={(val: string) => {
                          dispatch(setMission({ ...mission, traverseSpeed: Number(val) }));
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.inputFieldLabel}>Walkback Speed (km/h):</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.inputFieldValue}>
                      <InLineEditInput
                        editing={editMode}
                        fieldProps={{
                          name: "defaultWalkbackSpeed",
                          ariaLabel: "Time in minutes",
                          style: { width: "45px" },
                          validators: [
                            validators.mustBeNumber,
                            validators.maxLength(2),
                            validators.mustBeInteger,
                          ],
                          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                            e.target.value = e.target.value.replace(
                              regExValidators.regExNumber,
                              ""
                            );
                          },
                        }}
                        value={mission.walkbackSpeed?.toString()}
                        onSubmit={(val: string) => {
                          dispatch(setMission({ ...mission, walkbackSpeed: Number(val) }));
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
            <SubpanelHeading icon={faMountain}>DEM Information</SubpanelHeading>
          </div>
          <div className={paneStyles.panelSectionRow}>
            <div className={paneStyles.panelSection2Column}>
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.displayFieldLabel}>Filename:</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>{demConfig.dem}</div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.displayFieldLabel}>Resolution (m):</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>{demConfig.resolution}</div>
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
                    <LastEdited updatedAt={mission?.updatedAt} />
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
