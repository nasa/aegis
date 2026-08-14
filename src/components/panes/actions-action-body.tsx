import {
  faAtlas,
  faBarcode,
  faCircle,
  faClock,
  faHexagonNodes,
  faIcons,
  faListOl,
  faLocationDot,
  faMessage,
  faPersonDigging,
  faTableList,
  faToolbox,
  faWeightHanging,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { LastEditedNumeric, SubpanelHeading } from "components/interface/_global-elements";
import { Button } from "components/interface/form/globalFields";
import {
  ValidatedInputField,
  ValidatedTextArea,
} from "components/interface/form/globalFieldsAutomerge";
import type { FunctionComponent } from "react";
import { useState } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions-action.module.css";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdateActionByField } from "operations/apply/apply-action";
import { useAppDispatch } from "utils/useAppDispatch";
import { longDateFromDateString, toDecimal } from "utils/formatting";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import STMSelector from "./stm/stm-selector";
import { validators, regExValidators } from "components/interface/form/formValidators";
import round from "lodash/round";
import isNull from "lodash/isNull";
import { EquipmentSelector, GeographicUnitSelector } from "./actions-action-body-multiselectors";
import { thunkDocUpdateActionLocation } from "store/thunk/thunkAction";
import {
  findGlobalGridCoordsFromPoint,
  getDistanceBetweenTwoCoordinates,
} from "utils/mapping/geoMath";
import { EmojiPicker, EmojiRenderer } from "components/interface/emojis";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { thunkDocAddCollectionId, thunkDocAddRexActionMass } from "store/thunk/thunkRex";
import { getSouthLpsDisplayCoordinate } from "utils/lgrs/southLps";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useResolvedMissionGrid } from "components/interface/map/hooks/useResolvedMissionGrid";

const RightActionBody: FunctionComponent<{
  editMode: boolean;
  action: Action;
  parentType: ActionParentType;
  parentLocation: AEGISPoint;
  parentElevation: number;
  rexUuid: string;
  allowRexEdit: boolean;
}> = ({ editMode, action, parentType, parentLocation, parentElevation, rexUuid, allowRexEdit }) => {
  const dispatch = useAppDispatch();
  const resolvedGrid = useResolvedMissionGrid();
  const partialMission = useMissionDocSelector(
    (mission) => ({
      usingLGRSCoordinates: mission.usingLGRSCoordinates,
      planetRadius: mission.planetRadius,
      actionSystemVersion: mission.actionSystemVersion,
    }),
    deepEqual
  );

  const thisMapDirective = useAppSelector((state) => {
    return state.map.mapDirective?.uuid === action.uuid ? state.map.mapDirective : null;
  }, shallowEqual);
  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const elevationPendingIndex = useAppSelector(
    (state) => state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === action.uuid),
    refEqual
  );

  const actionRexEntry = useMissionDocSelector((mission) => {
    if (!rexUuid || !mission?.rexes) return null;
    const rex = mission.rexes[rexUuid];
    if (!rex?.actionEntries || !rex.actionEntries[action.uuid]) return null;
    return rex.actionEntries[action.uuid];
  }, deepEqual);

  const actionRexMaestroControlled = useMissionDocSelector((mission) => {
    if (!rexUuid || !mission?.rexes) return false;
    return mission.rexes[rexUuid]?.maestroControlled ?? false;
  }, deepEqual);

  const actionGridCoordinates = useAppSelector((state) => {
    if (action.location && partialMission.usingLGRSCoordinates) {
      return (
        getSouthLpsDisplayCoordinate(
          action.location,
          resolvedGrid.kind === "dynamic-lgrs" ? "full" : "condensed"
        ) ?? "Not set"
      );
    } else if (
      action.location &&
      resolvedGrid.kind === "server-file" &&
      state.map.gridCornerPoint
    ) {
      return findGlobalGridCoordsFromPoint(
        resolvedGrid.grid.coordinates,
        action.location,
        partialMission.planetRadius
      );
    } else {
      return "Not set";
    }
  }, shallowEqual);

  const parentPoiUuid = useMissionDocSelector((mission) => {
    if (!action.parentActionUuid) return undefined;
    const parentAction = mission.actions[action.parentActionUuid];
    return parentAction?.poiUuid;
  }, refEqual);
  const actionParentPoi = useMissionDocSelector(
    (mission) => (parentPoiUuid ? mission.pois[parentPoiUuid] : undefined),
    deepEqual
  );

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const dispatchStationMapAction = (mapAction: MapAction) => {
    dispatch(
      thunkUpdateMapDirective({
        mapItemType: "action",
        uuid: action.uuid,
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

  return (
    <div
      className={actionStyles.actionIndent}
      style={{ backgroundColor: action.enabled ? "" : "var(--grey1)" }}
    >
      {partialMission.actionSystemVersion === 2 && (
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
            <SubpanelHeading icon={faPersonDigging}>Action Type</SubpanelHeading>
          </div>
          <div className={paneStyles.descriptionContainer}>
            {editMode ? (
              <div
                className={actionStyles.actionDualButtons}
                style={{ cursor: editMode ? "pointer" : "default" }}
              >
                <div
                  className={`${actionStyles.actionDualButtonsLeft} ${action.stmAction ? actionStyles.actionDualButtonsSelected : undefined}`}
                  onClick={() => {
                    if (editMode)
                      withMissionChange((m) =>
                        applyUpdateActionByField(m, {
                          actionUuid: action.uuid,
                          fieldName: "stmAction",
                          value: true,
                        })
                      );
                  }}
                >
                  STM
                </div>

                <div
                  className={`${actionStyles.actionDualButtonsRight} ${!action.stmAction ? actionStyles.actionDualButtonsSelected : undefined}`}
                  onClick={() => {
                    if (editMode)
                      withMissionChange((m) =>
                        applyUpdateActionByField(m, {
                          actionUuid: action.uuid,
                          fieldName: "stmAction",
                          value: false,
                        })
                      );
                  }}
                >
                  Non-STM
                </div>
              </div>
            ) : (
              <div className={paneStyles.displayFieldValue}>
                {action.stmAction ? "STM" : "Non-STM"}
              </div>
            )}
          </div>
        </div>
      )}
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle}>
          <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
        </div>
        <div className={paneStyles.descriptionContainer}>
          <ValidatedTextArea
            value={action.description || ""}
            editMode={editMode}
            onSubmit={(value: string) => {
              withMissionChange((m) =>
                applyUpdateActionByField(m, {
                  actionUuid: action.uuid,
                  fieldName: "description",
                  value: value || "",
                })
              );
            }}
            fieldProps={{ name: "description", ariaLabel: "Action Description" }}
            key={`${action.uuid}-description`}
          />
        </div>
        {parentType !== "poi" && (
          <>
            <div className={paneStyles.panelSectionTitle} style={{ marginTop: "15px" }}>
              <SubpanelHeading
                icon={faMessage}
                helpCopy="Visible in Maestro. Task description to be read to crew."
              >
                Task Description
              </SubpanelHeading>
            </div>
            <div className={paneStyles.descriptionContainer}>
              <ValidatedTextArea
                value={action.descriptionTask || ""}
                editMode={editMode}
                onSubmit={(value: string) => {
                  withMissionChange((m) =>
                    applyUpdateActionByField(m, {
                      actionUuid: action.uuid,
                      fieldName: "descriptionTask",
                      value,
                    })
                  );
                }}
                fieldProps={{ name: "descriptionTask", ariaLabel: "Task Description" }}
                key={action.uuid}
              />
            </div>
          </>
        )}
      </div>
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
          <SubpanelHeading icon={faClock}>Estimated Action Time</SubpanelHeading>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <div className={paneStyles.panelSection2Column}>
            <div className={paneStyles.panelColumnTable}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldLabel}>Duration (mins):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <ValidatedInputField
                      value={action.duration?.toString()}
                      editMode={editMode}
                      fieldProps={{
                        name: "duration",
                        ariaLabel: "Duration in minutes",
                        validators: [
                          validators.maxLength(4),
                          validators.mustBeInteger,
                          validators.required,
                          // validators.mustBeNumberGTZero,
                        ],
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
                        },
                      }}
                      onSubmit={(value: string) => {
                        withMissionChange((m) =>
                          applyUpdateActionByField(m, {
                            actionUuid: action.uuid,
                            fieldName: "duration",
                            value: toDecimal(value),
                          })
                        );
                      }}
                      key={`${action.uuid}-duration`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {partialMission.actionSystemVersion === 1 && (
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
            <SubpanelHeading icon={faListOl}>Task Priority</SubpanelHeading>
          </div>
          <div className={paneStyles.panelSectionRow}>
            <div className={paneStyles.panelSection2Column}>
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.inputFieldLabel}>Priority (1-99):</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.inputFieldValue}>
                      <ValidatedInputField
                        value={action.priority?.toString()}
                        editMode={editMode}
                        fieldProps={{
                          name: "priority",
                          ariaLabel: "Priority",
                          validators: [validators.maxLength(2), validators.mustBeInteger],
                          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                            e.target.value = e.target.value.replace(
                              regExValidators.regExNumber,
                              ""
                            );
                          },
                        }}
                        onSubmit={(value: string) => {
                          withMissionChange((m) =>
                            applyUpdateActionByField(m, {
                              actionUuid: action.uuid,
                              fieldName: "priority",
                              value: toDecimal(value),
                            })
                          );
                        }}
                        key={`${action.uuid}-priority`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.titleWithMaestro}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
            <SubpanelHeading icon={faWeightHanging}>Sample Mass</SubpanelHeading>
          </div>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <div className={paneStyles.panelSection2Column}>
            <div className={paneStyles.panelColumnTable} style={{ alignContent: "center" }}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldLabel}>Planned Mass (g):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <ValidatedInputField
                      value={action.mass?.toString()}
                      editMode={editMode}
                      fieldProps={{
                        name: "mass",
                        ariaLabel: "Planned Sample Mass",
                        validators: [
                          validators.mustBeNumber,
                          validators.maxLength(4),
                          validators.mustBeInteger,
                        ],
                      }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
                      }}
                      onSubmit={(value: string) => {
                        withMissionChange((m) =>
                          applyUpdateActionByField(m, {
                            actionUuid: action.uuid,
                            fieldName: "mass",
                            value: toDecimal(value),
                          })
                        );
                      }}
                      key={`${action.uuid}-mass`}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className={paneStyles.panelColumnTable} style={{ marginTop: -0.5 }}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldLabel}>Executed Mass (g):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <ValidatedInputField
                      value={actionRexEntry?.mass?.toString()}
                      editMode={!isNull(rexUuid) && allowRexEdit}
                      fieldProps={{
                        name: "mass",
                        ariaLabel: "Executed Sample Mass",
                        validators: [
                          validators.maxLength(4),
                          validators.mustBeInteger,
                          validators.mustBeNumberGTEZero,
                        ],
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
                        },
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          thunkDocAddRexActionMass({ uuid: action.uuid, mass: toDecimal(value) })
                        );
                      }}
                      key={`${action.uuid}-mass`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={paneStyles.panelSection}>
        <div className={paneStyles.titleWithMaestro}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
            <SubpanelHeading icon={faBarcode}>Sample Collection IDs</SubpanelHeading>
          </div>
          {actionRexMaestroControlled && (
            <div className={paneStyles.maestroIcon}>
              <FontAwesomeIcon
                icon={faHexagonNodes}
                data-tooltip-id="aegis-tooltip"
                data-tooltip-content="Fields in this section are Maestro controlled"
              />
            </div>
          )}
        </div>
        <div className={paneStyles.panelSectionRow}>
          <div className={paneStyles.panelSection2Column}>
            <div className={paneStyles.panelColumnTable}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldLabel}>Marker ID:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <ValidatedInputField
                      value={actionRexEntry?.markerId?.toString()}
                      editMode={!isNull(rexUuid) && allowRexEdit && !actionRexMaestroControlled}
                      fieldProps={{
                        name: "markerId",
                        ariaLabel: "Sample Marker ID",
                        validators: [validators.maxLength(20)],
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          thunkDocAddCollectionId({
                            uuid: action.uuid,
                            id: value,
                            collectionType: "marker",
                          })
                        );
                      }}
                      key={`${action.uuid}-markerId`}
                    />
                  </div>
                </div>
              </div>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldLabel}>Container ID:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <ValidatedInputField
                      value={actionRexEntry?.containerId?.toString()}
                      editMode={!isNull(rexUuid) && allowRexEdit && !actionRexMaestroControlled}
                      fieldProps={{
                        name: "containerId",
                        ariaLabel: "Container ID",
                        validators: [validators.maxLength(20)],
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          thunkDocAddCollectionId({
                            uuid: action.uuid,
                            id: value,
                            collectionType: "container",
                          })
                        );
                      }}
                      key={`${action.uuid}-containerId`}
                    />
                  </div>
                </div>
              </div>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldLabel}>2nd Container ID:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <ValidatedInputField
                      value={actionRexEntry?.secondaryContainerId?.toString()}
                      editMode={!isNull(rexUuid) && allowRexEdit && !actionRexMaestroControlled}
                      fieldProps={{
                        name: "secondaryContainerId",
                        ariaLabel: "Secondary Container ID",
                        validators: [validators.maxLength(20)],
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          thunkDocAddCollectionId({
                            uuid: action.uuid,
                            id: value,
                            collectionType: "secondaryContainer",
                          })
                        );
                      }}
                      key={`${action.uuid}-mass`}
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
          <SubpanelHeading icon={faToolbox}>Equipment Required</SubpanelHeading>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <EquipmentSelector
            equipmentItemsUsage={action.equipmentItemsUsage}
            editMode={editMode}
            actionUuid={action.uuid}
            uniqueId={action.uuid}
          />
        </div>
      </div>
      {partialMission.actionSystemVersion === 1 && (
        <>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faAtlas}>Associated Geographic Units</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <GeographicUnitSelector
                geographicUnitsUsage={action.geographicUnitsUsage}
                editMode={editMode}
                actionUuid={action.uuid}
                uniqueId={action.uuid}
              />
            </div>
          </div>
        </>
      )}
      {partialMission.actionSystemVersion === 1 && (
        <>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faTableList}>STM Coverage</SubpanelHeading>
            </div>
            <div className={actionStyles.selectorContainer}>
              <STMSelector
                editMode={editMode}
                stmPriorities={action.stmPriorities}
                actionUuid={action.uuid}
              />
            </div>
          </div>
        </>
      )}

      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle}>
          <SubpanelHeading icon={faLocationDot}>Location</SubpanelHeading>
        </div>
        {editMode ? (
          <div className={`${paneStyles.panelSectionRow} ${paneStyles.sectionButtonRow}`}>
            {editMode && mapAction === null && (
              <>
                {!action.location ? (
                  <>
                    <Button
                      onClick={() => {
                        handleCreate();
                      }}
                      label="Create Location"
                      style={{ width: "110px" }}
                    />
                  </>
                ) : elevationPendingIndex === -1 ? (
                  <Button
                    onClick={() => {
                      handleEdit();
                    }}
                    label="Edit on Map"
                    style={{ width: "90px" }}
                  />
                ) : (
                  <span className={actionStyles.statusLoading} />
                )}
                {(parentType === "station" || parentType === "poi") && (
                  <Button
                    onClick={() => {
                      dispatch(
                        thunkDocUpdateActionLocation({
                          location: parentLocation,
                          actionUuid: action.uuid,
                        })
                      );
                    }}
                    label={parentType === "station" ? "Set to Station" : "Set to POI"}
                    style={{ width: "95px" }}
                    enabled={!!parentLocation}
                  />
                )}
                <Button
                  onClick={() => {
                    withMissionChange((m) => {
                      applyUpdateActionByField(m, {
                        actionUuid: action.uuid,
                        fieldName: "location",
                        value: null,
                      });
                      applyUpdateActionByField(m, {
                        actionUuid: action.uuid,
                        fieldName: "elevation",
                        value: null,
                      });
                    });
                  }}
                  label="Clear Location"
                  style={{ width: "99px" }}
                />
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
            <div className={paneStyles.panelColumnTable} style={{ flex: "0 0 160px" }}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldLabel}>Lat:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldValue}>
                    {!action.location ? (
                      <>Not set</>
                    ) : (
                      <ValidatedInputField
                        value={round(action.location.lat, 6).toString()}
                        editMode={editMode}
                        fieldProps={{
                          name: "Lat",
                          ariaLabel: "Latitude",
                          validators: [validators.mustBeNumber, validators.required],
                        }}
                        styleContainer={{ fontSize: "0.8rem", fontWeight: 400 }}
                        onSubmit={(val: string) => {
                          withMissionChange((m) =>
                            applyUpdateActionByField(m, {
                              actionUuid: action.uuid,
                              fieldName: "location",
                              value: {
                                lat: parseFloat(val),
                                lng: action.location.lng,
                              },
                            })
                          );
                        }}
                        key={`${action.uuid}-lat`}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldLabel}>Lng:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldValue}>
                    {!action.location ? (
                      <>Not set</>
                    ) : (
                      <ValidatedInputField
                        value={round(action.location.lng, 6).toString()}
                        editMode={editMode}
                        fieldProps={{
                          name: "Lng",
                          ariaLabel: "Longitude",
                          validators: [validators.mustBeNumber, validators.required],
                        }}
                        styleContainer={{ fontSize: "0.8rem", fontWeight: 400 }}
                        onSubmit={(val: string) => {
                          withMissionChange((m) =>
                            applyUpdateActionByField(m, {
                              actionUuid: action.uuid,
                              fieldName: "location",
                              value: {
                                lat: action.location.lat,
                                lng: parseFloat(val),
                              },
                            })
                          );
                        }}
                        key={`${action.uuid}-lng`}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldLabel}>Grid Coords:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldValue}>{actionGridCoordinates}</div>
                </div>
              </div>
            </div>
            {(parentType === "station" || parentType === "poi") && (
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldLabel}>
                      Elevation Relative to {parentType === "station" ? "Station" : "POI"} (m):
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>
                      {!action.elevation || !parentElevation ? (
                        <>Not set</>
                      ) : (
                        (action.elevation - parentElevation).toFixed(0)
                      )}
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldLabel}>
                      Distance to {parentType === "station" ? "Station" : "POI"} (m):
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>
                      {!action.location || !parentLocation ? (
                        <>Not set</>
                      ) : (
                        <>
                          {getDistanceBetweenTwoCoordinates(
                            action.location,
                            parentLocation,
                            partialMission.planetRadius
                          ).toFixed(0)}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <div className={paneStyles.panelColumnItem}></div>
        </div>
      </div>
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
          <SubpanelHeading icon={faIcons}>Icon</SubpanelHeading>
        </div>

        <div className={paneStyles.panelSectionRow} style={{ marginLeft: "18px" }}>
          <div className={paneStyles.rightTopTitleIcon}>
            <EmojiRenderer iconValue={action.icon ? action.icon : "2754"} />
          </div>
          {editMode && (
            <>
              <div className={actionStyles.iconDisplayButton}>
                <Button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  label={!showEmojiPicker ? "Pick Icon" : "Close"}
                  style={{ width: "75px" }}
                />
              </div>
              <div className={actionStyles.iconPickerContainer}>
                {showEmojiPicker && (
                  <div className={actionStyles.iconPicker}>
                    <EmojiPicker
                      emojiButtonSize={30}
                      emojiSize={20}
                      perLine={10}
                      darkMode={true}
                      onEmojiSelect={(e) => {
                        // Handle both standard emojis (unified) and custom emojis (id)
                        const iconValue = e.unified || e.id;
                        withMissionChange((m) =>
                          applyUpdateActionByField(m, {
                            actionUuid: action.uuid,
                            fieldName: "icon",
                            value: iconValue,
                          })
                        );
                        setShowEmojiPicker(false);
                      }}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {actionParentPoi && (
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
            <SubpanelHeading icon={faCircle}>Copied from POI</SubpanelHeading>
          </div>

          <div className={paneStyles.panelSectionRow} style={{ marginLeft: "18px" }}>
            <div className={paneStyles.displayFieldLabel}>
              <div style={{ lineHeight: "1.4em" }}>
                <span style={{ marginRight: "4px" }}>
                  <EmojiRenderer
                    iconValue={actionParentPoi?.icon ? actionParentPoi?.icon : "2754"}
                  />
                </span>
                <span style={{ color: "var(--grey5)" }}>{actionParentPoi?.name} </span>
                <div style={{ marginLeft: "2px" }}>
                  at {longDateFromDateString(new Date(action.parentCopyDate).toISOString())}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={paneStyles.panelSection}>
        <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
      </div>
      <div className={paneStyles.lastEditedContainer}>
        <div className={paneStyles.displayFieldValue}>
          <LastEditedNumeric
            updatedAt={action?.updatedAt}
            createdAt={action?.createdAt}
            info={[
              ["Action UUID", action?.uuid],
              ["Action RefUUID", action?.refUuid],
            ]}
          />
        </div>
      </div>
    </div>
  );
};

export default RightActionBody;
