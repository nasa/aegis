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
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { FunctionComponent, useState } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions-action.module.css";
import { upsertActionByField } from "store/action";
import { useAppDispatch } from "utils/useAppDispatch";
import { decodeEmoji, longdateFromDateString, toDecimal } from "utils/formatting";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import STMSelector from "./stm/stm-selector";
import { validators, regExValidators } from "components/interface/form/formValidators";
import round from "lodash/round";
import isNull from "lodash/isNull";
import { EquipmentSelector, GeographicUnitSelector } from "./actions-action-body-multiselectors";
import { thunkUpdateActionLocation } from "store/thunk/thunkAction";
import {
  findGlobalGridCoordsFromPoint,
  getDistanceBetweenTwoCoordinates,
} from "utils/mapping/geoMath";
import Picker from "@emoji-mart/react";
import emojiPickerData from "@emoji-mart/data";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { thunkAddCollectionId, thunkAddRexActionMass } from "store/thunk/thunkRex";
import { globalGrid } from "utils/mapping/grid";
import { getLGRSCoordsFromLatLng } from "utils/surf-nav/surfNavWrapper";

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

  const thisMapDirective = useAppSelector((state) => {
    return state.map.mapDirective?.uuid === action.uuid ? state.map.mapDirective : null;
  }, shallowEqual);
  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const elevationPendingIndex = useAppSelector(
    (state) => state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === action.uuid),
    refEqual
  );

  const actionSystemVersion = useAppSelector(
    (state) => state.mission.mission.actionSystemVersion,
    refEqual
  );

  const actionRexEntry = useAppSelector((state) => {
    if (!rexUuid) return;
    //find all action entry that match this action uuid for the running rex. return the status of the last one.
    const rex = state.rex.rexesFromDb.find((rex) => rex.uuid === rexUuid);
    if (!rex?.actionEntries || !rex.actionEntries[action.uuid]) {
      return null;
    } else {
      return rex.actionEntries[action.uuid];
    }
  }, deepEqual);

  const actionRexMaestroControlled = useAppSelector((state) => {
    if (!rexUuid) return false;
    //find all action entry that match this action uuid for the running rex. return the status of the last one.
    const rex = state.rex.rexesFromDb.find((rex) => rex.uuid === rexUuid);
    return rex?.maestroControlled || false;
  }, deepEqual);

  const planetRadius = useAppSelector((state) => state.mission.mission.planetRadius, refEqual);

  const missionUsingLGRSCoordinates = useAppSelector(
    (state) => state.mission.mission.usingLGRSCoordinates,
    refEqual
  );

  const actionGridCoordinates = useAppSelector((state) => {
    if (action.location && missionUsingLGRSCoordinates) {
      return getLGRSCoordsFromLatLng(action.location.lat, action.location.lng);
    } else if (action.location && globalGrid?.coordinates && state.map.gridCornerPoint) {
      return findGlobalGridCoordsFromPoint(globalGrid.coordinates, action.location, planetRadius);
    } else {
      return "Not set";
    }
  }, shallowEqual);

  const actionParentPoi = useAppSelector((state) => {
    if (!action.parentActionUuid) return undefined;
    const parentAction = state.action.actions.find((a) => a.uuid === action.parentActionUuid);
    if (!parentAction || !parentAction.poiUuid) return undefined;
    const poi = state.poi.pois.find((p) => p.uuid === parentAction.poiUuid);
    return poi;
  }, refEqual);

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
      {actionSystemVersion === 2 && (
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
                    if (editMode) dispatch(upsertActionByField(action.uuid, "stmAction", true));
                  }}
                >
                  STM
                </div>

                <div
                  className={`${actionStyles.actionDualButtonsRight} ${!action.stmAction ? actionStyles.actionDualButtonsSelected : undefined}`}
                  onClick={() => {
                    if (editMode) dispatch(upsertActionByField(action.uuid, "stmAction", false));
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
          <WysiwygTextArea
            value={action.description}
            editing={editMode}
            onChange={(value) => {
              dispatch(upsertActionByField(action.uuid, "description", value));
            }}
            key={action.uuid}
          />
        </div>
      </div>
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
          <SubpanelHeading icon={faClock}>Estimated Action Time</SubpanelHeading>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <div className={paneStyles.panelSection2Column}>
            <div className={paneStyles.panelColumnTable}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.inputFieldLabel}>Duration (mins):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={action.duration?.toString()}
                      editing={editMode}
                      fieldProps={{
                        name: "duration",
                        ariaLabel: "Duration in minutes",
                        style: { width: "45px" },
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
                        dispatch(upsertActionByField(action.uuid, "duration", toDecimal(value)));
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

      {actionSystemVersion === 1 && (
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
            <SubpanelHeading icon={faListOl}>Task Priority</SubpanelHeading>
          </div>
          <div className={paneStyles.panelSectionRow}>
            <div className={paneStyles.panelSection2Column}>
              <div className={paneStyles.panelColumnTable}>
                <div className={paneStyles.panelColumnTableRow}>
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.inputFieldLabel}>Priority (1-99):</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.inputFieldValue}>
                      <InLineEditInput
                        value={action.priority?.toString()}
                        editing={editMode}
                        fieldProps={{
                          name: "priority",
                          ariaLabel: "Priority",
                          style: { width: "45px" },
                          validators: [validators.maxLength(2), validators.mustBeInteger],
                          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                            e.target.value = e.target.value.replace(
                              regExValidators.regExNumber,
                              ""
                            );
                          },
                        }}
                        onSubmit={(value: string) => {
                          dispatch(upsertActionByField(action.uuid, "priority", toDecimal(value)));
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
          {actionRexMaestroControlled && (
            <div className={paneStyles.maestroIcon}>
              <FontAwesomeIcon
                icon={faHexagonNodes}
                data-tooltip-id="aegis-tooltip"
                data-tooltip-html="Some fields in this section are Maestro controlled"
              />
            </div>
          )}
        </div>
        <div className={paneStyles.panelSectionRow}>
          <div className={paneStyles.panelSection2Column}>
            <div className={paneStyles.panelColumnTable} style={{ alignContent: "center" }}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.inputFieldLabel}>Planned Mass (g):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={action.mass?.toString()}
                      editing={editMode}
                      fieldProps={{
                        name: "mass",
                        ariaLabel: "Planned Sample Mass",
                        style: { width: "45px" },
                        validators: [
                          validators.mustBeNumber,
                          validators.maxLength(4),
                          validators.mustBeInteger,
                        ],
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
                        },
                      }}
                      onSubmit={(value: string) => {
                        dispatch(upsertActionByField(action.uuid, "mass", toDecimal(value)));
                      }}
                      key={`${action.uuid}-mass`}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className={paneStyles.panelColumnTable} style={{ marginTop: -0.5 }}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.inputFieldLabel}>Executed Mass (g):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={actionRexEntry?.mass?.toString()}
                      editing={!isNull(rexUuid) && allowRexEdit && !actionRexMaestroControlled}
                      fieldProps={{
                        name: "mass",
                        ariaLabel: "Executed Sample Mass",
                        style: { width: "45px" },
                        validators: [
                          validators.mustBeNumber,
                          validators.maxLength(4),
                          validators.mustBeInteger,
                        ],
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
                        },
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          thunkAddRexActionMass({ uuid: action.uuid, mass: toDecimal(value) })
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
                data-tooltip-html="Fields in this section are Maestro controlled"
              />
            </div>
          )}
        </div>
        <div className={paneStyles.panelSectionRow}>
          <div className={paneStyles.panelSection2Column}>
            <div className={paneStyles.panelColumnTable}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.inputFieldLabel}>Marker ID:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={actionRexEntry?.markerId?.toString()}
                      editing={!isNull(rexUuid) && allowRexEdit && !actionRexMaestroControlled}
                      fieldProps={{
                        name: "markerId",
                        ariaLabel: "Sample Marker ID",
                        style: { width: "45px" },
                        validators: [validators.maxLength(20)],
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          thunkAddCollectionId({
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
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.inputFieldLabel}>Container ID:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={actionRexEntry?.containerId?.toString()}
                      editing={!isNull(rexUuid) && allowRexEdit && !actionRexMaestroControlled}
                      fieldProps={{
                        name: "containerId",
                        ariaLabel: "Container ID",
                        style: { width: "45px" },
                        validators: [validators.maxLength(20)],
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          thunkAddCollectionId({
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
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.inputFieldLabel}>Addtl. Container ID:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={actionRexEntry?.secondaryContainerId?.toString()}
                      editing={!isNull(rexUuid) && allowRexEdit && !actionRexMaestroControlled}
                      fieldProps={{
                        name: "secondaryContainerId",
                        ariaLabel: "Secondary Container ID",
                        style: { width: "45px" },
                        validators: [validators.maxLength(20)],
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          thunkAddCollectionId({
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
            onChange={(e) => {
              dispatch(upsertActionByField(action.uuid, "equipmentItemsUsage", e));
            }}
            uniqueId={action.uuid}
          />
        </div>
      </div>
      {actionSystemVersion === 1 && (
        <>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faAtlas}>Associated Geographic Units</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <GeographicUnitSelector
                geographicUnitsUsage={action.geographicUnitsUsage}
                editMode={editMode}
                onChange={(e) => {
                  dispatch(upsertActionByField(action.uuid, "geographicUnitsUsage", e));
                }}
                uniqueId={action.uuid}
              />
            </div>
          </div>
        </>
      )}
      {actionSystemVersion === 1 && (
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
                        thunkUpdateActionLocation({
                          location: parentLocation,
                          actionUuid: action.uuid,
                        })
                      );
                    }}
                    label={parentType === "station" ? "Set to Station" : "Set to POI"}
                    style={{ width: "95px" }}
                  />
                )}
                <Button
                  onClick={() => {
                    dispatch(upsertActionByField(action.uuid, "location", null));
                    dispatch(upsertActionByField(action.uuid, "elevation", null));
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
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.displayFieldLabel}>Lat:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldValue}>
                    {!action.location ? (
                      <>Not set</>
                    ) : (
                      <InLineEditInput
                        value={round(action.location.lat, 6).toString()}
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
                            upsertActionByField(action.uuid, "location", {
                              lat: parseFloat(val),
                              lng: action.location.lng,
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
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.displayFieldLabel}>Lng:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldValue}>
                    {!action.location ? (
                      <>Not set</>
                    ) : (
                      <InLineEditInput
                        value={round(action.location.lng, 6).toString()}
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
                            upsertActionByField(action.uuid, "location", {
                              lat: action.location.lat,
                              lng: parseFloat(val),
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
                <div className={paneStyles.panelColumnTableCellLeft}>
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
                  <div className={paneStyles.panelColumnTableCellLeft}>
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
                  <div className={paneStyles.panelColumnTableCellLeft}>
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
                            planetRadius
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
            <>{decodeEmoji(action.icon ? action.icon : "2754")}</>
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
                    <Picker
                      data={emojiPickerData}
                      emojiButtonSize={30}
                      emojiSize={20}
                      perLine={10}
                      darkMode={true}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      onEmojiSelect={(e: any) => {
                        dispatch(upsertActionByField(action.uuid, "icon", e.unified));
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
                  {decodeEmoji(actionParentPoi?.icon ? actionParentPoi?.icon : "2754")}
                </span>
                <span style={{ color: "var(--grey5)" }}>{actionParentPoi?.name} </span>
                <div style={{ marginLeft: "2px" }}>
                  at {longdateFromDateString(action.parentCopyDate) + "Z"}
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
          <LastEdited updatedAt={action?.updatedAt} />
        </div>
      </div>
    </div>
  );
};

export default RightActionBody;
