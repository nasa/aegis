import { FunctionComponent, useCallback, useRef, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, shallowEqual, deepEqual } from "utils/useAppSelector";
import _, { round } from "lodash";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import {
  faEarthAmerica,
  faFileInvoice,
  faInfoCircle,
  faLocationDot,
  faMessage,
  faMountain,
  faSun,
  faXmark,
  faMoon,
} from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  Checkbox,
  DegreesInputSlider,
  InLineEditInput,
} from "components/interface/form/globalFields";
import { regExValidators, validators } from "components/interface/form/formValidators";
import { upsertMission, upsertMissionByField } from "store/mission";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { toDecimal } from "utils/formatting";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { thunkVerifyNoStationsBeingEdited } from "store/thunk/thunkStation";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const mission = useAppSelector((state) => state.mission.mission, deepEqual);
  const thisMapDirective = useAppSelector((state) => {
    return state.map.mapDirective?.uuid === "lander" ? state.map.mapDirective : null;
  }, shallowEqual);
  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const [isDragging, setIsDragging] = useState(false);

  const dispatchMissionMapAction = (mapAction: MapAction) => {
    dispatch(
      thunkUpdateMapDirective({
        mapItemType: "lander",
        uuid: "lander",
        mapAction,
      })
    );
  };

  const verifyNoStationsBeingEdited = async (): Promise<boolean> => {
    return (await dispatch(thunkVerifyNoStationsBeingEdited())).payload;
  };

  const handleCreate = async () => {
    dispatchMissionMapAction("createMarker");
  };
  const handleCancelCreate = () => {
    dispatchMissionMapAction("cancelCreateMarker");
  };

  const handleEdit = async () => {
    if (await verifyNoStationsBeingEdited()) {
      dispatchMissionMapAction("editMarker");
    }
  };

  const handleCancelEdit = () => {
    dispatchMissionMapAction("cancelEditMarker");
  };

  const sunThrottledFunc = useRef(
    _.throttle((mission: Mission, value: number) => {
      dispatch(
        upsertMission({
          ...mission,
          sunAzimuth: value,
        })
      );
    }, 50)
  );

  const handleOnChangeSunAzimuth = useCallback(
    (mission: Mission, value: number) => {
      //hook into isDragging to prevent this from triggering when values are reset via "Cancel" button
      if (isDragging) sunThrottledFunc.current(mission, value);
    },
    [sunThrottledFunc, isDragging]
  );

  const earthThrottledFunc = useRef(
    _.throttle((mission: Mission, value: number) => {
      dispatch(
        upsertMission({
          ...mission,
          earthAzimuth: value,
        })
      );
    }, 50)
  );

  const handleOnChangeEarthAzimuth = useCallback(
    (mission: Mission, value: number) => {
      if (isDragging) earthThrottledFunc.current(mission, value);
    },
    [earthThrottledFunc, isDragging]
  );

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
        Mission Preferences
      </div>
      <div className={paneStyles.rightBodyBody}>
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
                  dispatch(upsertMissionByField("name", value));
                }}
                key={`${mission.id}-name`}
              />
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faInfoCircle}>Top Banner</SubpanelHeading>
            </div>
            <div className={paneStyles.descriptionContainer}>
              <InLineEditInput
                value={mission.missionBanner}
                editing={editMode}
                fieldProps={{
                  name: "name",
                  ariaLabel: "Mission Banner",
                  style: { width: "100%" },
                  validators: [validators.maxLength(255)],
                }}
                styleContainer={{ fontSize: "0.8rem", fontWeight: 400 }}
                onSubmit={(value) => {
                  dispatch(upsertMissionByField("missionBanner", value));
                }}
                key={`${mission.id}-banner`}
              />
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
            </div>
            <div className={paneStyles.descriptionContainer}>
              <WysiwygTextArea
                key={mission.id.toString()}
                value={mission.description}
                editing={editMode}
                onChange={(value) => {
                  dispatch(upsertMissionByField("description", value));
                }}
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
                            value={
                              editMode
                                ? mission.landerLocation.lat.toString()
                                : round(mission.landerLocation.lat, 6).toString()
                            }
                            editing={editMode}
                            fieldProps={{
                              name: "lat",
                              ariaLabel: "Latitude",
                              style: { width: "150px" },
                              validators: [validators.mustBeNumber, validators.required],
                            }}
                            styleContainer={{ fontSize: "0.8rem", fontWeight: 400 }}
                            onSubmit={(val: string) => {
                              dispatch(
                                upsertMissionByField("landerLocation", {
                                  ...mission.landerLocation,
                                  lat: toDecimal(val),
                                })
                              );
                            }}
                            key={`${mission.id}-lat`}
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
                            value={
                              editMode
                                ? mission.landerLocation.lng.toString()
                                : round(mission.landerLocation.lng, 6).toString()
                            }
                            editing={editMode}
                            fieldProps={{
                              name: "Lng",
                              ariaLabel: "Longitude",
                              style: { width: "150px" },
                              validators: [validators.mustBeNumber, validators.required],
                            }}
                            styleContainer={{ fontSize: "0.8rem", fontWeight: 400 }}
                            onSubmit={(val: string) => {
                              dispatch(
                                upsertMissionByField("landerLocation", {
                                  ...mission.landerLocation,
                                  lng: toDecimal(val),
                                })
                              );
                            }}
                            key={`${mission.id}-lng`}
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
            <div className={paneStyles.panelSectionInner2Column}>
              <div className={paneStyles.panelSectionInner2ColumnLeft}>
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
                        onChange={(value: number) => {
                          handleOnChangeSunAzimuth(mission, value);
                        }}
                        isDragging={(value: boolean) => {
                          setIsDragging(value);
                        }}
                        icon={faSun}
                      />
                    </div>
                    <div
                      className={paneStyles.displayFieldLabel}
                      style={{ margin: "6px 0 0 18px" }}
                    >
                      <div style={{ display: "flex" }}>
                        {editMode ? (
                          <>
                            <div>
                              <Checkbox
                                checked={mission.sunEnabled}
                                editable={editMode}
                                onChange={(e) => {
                                  dispatch(
                                    upsertMission({
                                      ...mission,
                                      sunEnabled: e.target.checked,
                                    })
                                  );
                                }}
                                label="Enable:"
                                labelStyle={{ marginTop: 3, marginRight: 3 }}
                                labelPlacement="left"
                                uniqueId="sunCheckbox"
                              />
                            </div>
                          </>
                        ) : (
                          <div style={{ marginTop: "3px" }}>
                            {mission?.sunEnabled ? "Enabled" : "Disabled"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div
                className={paneStyles.panelSectionInner2ColumnRight}
                style={{ marginLeft: "40px" }}
              >
                <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                  <SubpanelHeading icon={mission.earthAsMoon ? faMoon : faEarthAmerica}>
                    {mission.earthAsMoon ? "Moon" : "Earth"} Direction
                  </SubpanelHeading>
                </div>
                <div className={paneStyles.panelSectionRow}>
                  <div className={paneStyles.degreesInputContainer}>
                    <div className={paneStyles.descriptionContainer}>
                      <DegreesInputSlider
                        value={mission.earthAzimuth}
                        editable={editMode}
                        label="Azimuth"
                        onChange={(value: number) => {
                          handleOnChangeEarthAzimuth(mission, value);
                        }}
                        icon={mission.earthAsMoon ? faMoon : faEarthAmerica}
                        isDragging={(value: boolean) => {
                          setIsDragging(value);
                        }}
                      />
                    </div>
                    <div
                      className={paneStyles.displayFieldLabel}
                      style={{ margin: "6px 0 0 18px" }}
                    >
                      <div style={{ display: "flex" }}>
                        {editMode && (
                          <>
                            <div
                              className={`${paneStyles.toggleMenuItemRow} ${paneStyles.menuItemTitle}`}
                            >
                              <div
                                className={`${paneStyles.toggleLeft} ${paneStyles.center} ${
                                  !mission.earthAsMoon && paneStyles.toggleSelected
                                }`}
                                onClick={() => {
                                  if (mission.earthAsMoon)
                                    dispatch(upsertMission({ ...mission, earthAsMoon: false }));
                                }}
                              >
                                Earth
                              </div>
                              <div
                                className={`${paneStyles.toggleRight} ${paneStyles.center} ${
                                  mission.earthAsMoon && paneStyles.toggleSelected
                                }`}
                                onClick={() => {
                                  if (!mission.earthAsMoon)
                                    dispatch(upsertMission({ ...mission, earthAsMoon: true }));
                                }}
                              >
                                Moon
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={paneStyles.displayFieldLabel} style={{ marginLeft: "18px" }}>
                      <div style={{ display: "flex" }}>
                        {editMode ? (
                          <>
                            <div>
                              <Checkbox
                                checked={mission.earthEnabled}
                                editable={editMode}
                                onChange={(e) => {
                                  dispatch(
                                    upsertMission({
                                      ...mission,
                                      earthEnabled: e.target.checked,
                                    })
                                  );
                                }}
                                label="Enable:"
                                labelStyle={{ marginTop: 3, marginRight: 3 }}
                                labelPlacement="left"
                                uniqueId="earthCheckbox"
                              />
                            </div>
                          </>
                        ) : (
                          <div style={{ marginTop: "3px" }}>
                            {mission?.earthEnabled ? "Enabled" : "Disabled"}
                          </div>
                        )}
                      </div>
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
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>EVA Duration (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          editing={editMode}
                          fieldProps={{
                            name: "defaultEvaDuration",
                            ariaLabel: "Default EVA Duration",
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
                            dispatch(upsertMissionByField("defaultEvaDuration", toDecimal(val)));
                          }}
                          key={`${mission.id}-defaultEvaDuration`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>Traverse Rate (km/h):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          editing={editMode}
                          fieldProps={{
                            name: "defaultTraverseRate",
                            ariaLabel: "Average traverse rate",
                            style: { width: "45px" },
                            validators: [validators.mustBeNumber],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          value={mission.traverseRate?.toString()}
                          onSubmit={(val: string) => {
                            dispatch(upsertMissionByField("traverseRate", toDecimal(val)));
                          }}
                          key={`${mission.id}-defaultTraverseRate`}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.inputFieldLabel}>Walkback Rate (km/h):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.inputFieldValue}>
                        <InLineEditInput
                          editing={editMode}
                          fieldProps={{
                            name: "defaultWalkbackRate",
                            ariaLabel: "Default walkback rate",
                            style: { width: "45px" },
                            validators: [validators.mustBeNumber],
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                              e.target.value = e.target.value.replace(
                                regExValidators.regExNumber,
                                ""
                              );
                            },
                          }}
                          value={mission.walkbackRate?.toString()}
                          onSubmit={(val: string) => {
                            dispatch(upsertMissionByField("walkbackRate", toDecimal(val)));
                          }}
                          key={`${mission.id}-defaultWalkbackRate`}
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
                      <div className={paneStyles.displayFieldValue}>{mission.demFilePath}</div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Resolution (m):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>{mission.demResolution}</div>
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
    </div>
  );
};

export default Info_Panel;
