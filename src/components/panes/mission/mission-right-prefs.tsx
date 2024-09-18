import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, shallowEqual, deepEqual } from "utils/useAppSelector";
import _, { round } from "lodash";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import {
  faFileInvoice,
  faInfoCircle,
  faLocationDot,
  faMessage,
  faMountain,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { regExValidators, validators } from "components/interface/form/formValidators";
import { upsertMissionByField } from "store/mission";
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
                ariaLabel="missionDescription"
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
                              ariaLabel: "LatitudePref",
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
                              ariaLabel: "LongitudePref",
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
