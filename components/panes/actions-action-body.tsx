import {
  faAtlas,
  faClock,
  faIcons,
  faListOl,
  faLocationDot,
  faMessage,
  faTableList,
  faToolbox,
  faWeightHanging,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { faCircleDot } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { FunctionComponent, useState } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions-action.module.css";
import { upsertAction } from "store/action";
import { useAppDispatch } from "utils/useAppDispatch";
import { decodeEmoji, longdateFromDateString, toDecimal } from "utils/formatting";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import ReactDOMServer from "react-dom/server";
import STMSelector from "./stm-selector";
import { validators, regExValidators } from "components/interface/form/formValidators";
import _, { round } from "lodash";
import { EquipmentSelector, GeographicUnitSelector } from "./actions-action-body-multiselectors";
import { updateMapDirective } from "store/map";
import { thunkUpdateActionLocation } from "store/thunk/thunkAction";
import { getDistanceBetweenTwoCoordinates } from "utils/geoMath";
import Picker from "@emoji-mart/react";
import emojiPickerData from "@emoji-mart/data";

export const RightActionBody: FunctionComponent<{
  editMode: boolean;
  action: Action;
  parentType: "station" | "poi" | "eva";
  parentLocation: AEGISPoint;
  parentElevation: number;
}> = ({ editMode, action, parentType, parentLocation, parentElevation }) => {
  const dispatch = useAppDispatch();
  const parentAction = useAppSelector(
    (state) =>
      state.action.actions.find((storeAction) => storeAction.uuid === action.parentActionUuid),
    shallowEqual
  );
  const parentPoi = useAppSelector(
    (state) => state.poi.pois.find((storePoi) => storePoi.uuid === parentAction?.poiUuid),
    shallowEqual
  );

  const planetRadius = useAppSelector((state) => state.mission.mission.planetRadius, refEqual);
  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = mapDirective?.uuid === action.uuid ? mapDirective : null;
  const elevationPendingIndex = useAppSelector(
    (state) => state.interface.elevationPendingItemUuids.findIndex((uuid) => uuid === action.uuid),
    refEqual
  );

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const buildActionTooltip = () => {
    if (parentAction && parentPoi) {
      const dateString = longdateFromDateString(action.parentCopyDate) + "Z";
      return ReactDOMServer.renderToStaticMarkup(
        <>
          Copied from POI {parentPoi.name} - {parentAction.name}
          <br />
          on {dateString}
        </>
      );
    } else {
      return <></>;
    }
  };

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const dispatchStationMapAction = (mapAction: MapAction) => {
    dispatch(
      updateMapDirective({
        mapItemType: "action",
        uuid: action.uuid,
        mapAction,
      })
    );
  };

  const verifyNoActiveMapAction = (): boolean => {
    // if another mapAction is underway, fire an alert and return false

    if (mapDirective && mapDirective.mapAction !== null) {
      alert(
        "Another map action is underway. Please cancel or complete that map action before starting a new one."
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

  return (
    <div
      className={actionStyles.actionIndent}
      style={{ backgroundColor: action.enabled ? "" : "var(--grey1)" }}
    >
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle}>
          <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
        </div>
        <div className={paneStyles.descriptionContainer}>
          <WysiwygTextArea
            value={action.description}
            editing={editMode}
            onChange={(value) => {
              const updatedAction: Action = { ...action, description: value };
              dispatch(upsertAction(updatedAction));
            }} // handle innerHTML change
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
                  <div className={paneStyles.inputFieldLabel}>Nominal Duration (mins):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={action.durationLower?.toString()}
                      editing={editMode}
                      fieldProps={{
                        name: "durationLower",
                        ariaLabel: "Minimum Time in minutes",
                        style: { width: "45px" },
                        validators: [
                          validators.maxLength(4),
                          validators.mustBeInteger,
                          validators.required,
                          validators.mustBeNumberGTZero,
                        ],
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
                        },
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          upsertAction({
                            ...action,
                            durationLower: toDecimal(value),
                          })
                        );
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className={paneStyles.panelColumnTable}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.inputFieldLabel}>Max Duration (mins):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={action.durationUpper?.toString()}
                      editing={editMode}
                      fieldProps={{
                        name: "durationUpper",
                        ariaLabel: "Maximum Time in minutes",
                        style: { width: "45px" },
                        validators: [
                          validators.maxLength(4),
                          validators.mustBeInteger,
                          validators.required,
                          validators.mustBeNumberGTZero,
                        ],
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
                        },
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          upsertAction({
                            ...action,
                            durationUpper: toDecimal(value),
                          })
                        );
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
          <SubpanelHeading icon={faListOl}>Priority</SubpanelHeading>
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
                          e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
                        },
                      }}
                      onSubmit={(value: string) => {
                        dispatch(
                          upsertAction({
                            ...action,
                            priority: toDecimal(value),
                          })
                        );
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
          <SubpanelHeading icon={faWeightHanging}>Mass</SubpanelHeading>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <div className={paneStyles.panelSection2Column}>
            <div className={paneStyles.panelColumnTable}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.inputFieldLabel}>Expected Sample Mass (g):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.inputFieldValue}>
                    <InLineEditInput
                      value={action.mass?.toString()}
                      editing={editMode}
                      fieldProps={{
                        name: "mass",
                        ariaLabel: "Expected Sample Mass",
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
                          upsertAction({
                            ...action,
                            mass: toDecimal(value),
                          })
                        );
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
          <SubpanelHeading icon={faToolbox}>Equipment Required</SubpanelHeading>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <EquipmentSelector
            equipmentItemsUsage={action.equipmentItemsUsage}
            editMode={editMode}
            onChange={(e) => {
              dispatch(
                upsertAction({
                  ...action,
                  equipmentItemsUsage: e,
                })
              );
            }}
            uniqueId={action.uuid}
          />
        </div>
      </div>
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
          <SubpanelHeading icon={faAtlas}>Associated Geographic Units</SubpanelHeading>
        </div>
        <div className={paneStyles.panelSectionRow}>
          <GeographicUnitSelector
            geographicUnitsUsage={action.geographicUnitsUsage}
            editMode={editMode}
            onChange={(e) => {
              dispatch(
                upsertAction({
                  ...action,
                  geographicUnitsUsage: e,
                })
              );
            }}
            uniqueId={action.uuid}
          />
        </div>
      </div>
      <div className={paneStyles.panelSection}>
        <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
          <SubpanelHeading icon={faTableList}>STM Coverage</SubpanelHeading>
        </div>
        <div className={actionStyles.selectorContainer}>
          <STMSelector
            editMode={editMode}
            stmUuidRefs={action.stmUuidRefs}
            onSTMChange={(stmUuidRefs: string[]) => {
              const updatedAction: Action = { ...action, stmUuidRefs: stmUuidRefs };
              dispatch(upsertAction(updatedAction));
            }}
          />
        </div>
      </div>

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
                            upsertAction({
                              ...action,
                              location: {
                                lat: parseFloat(val),
                                lng: action.location.lng,
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
                            upsertAction({
                              ...action,
                              location: {
                                lat: action.location.lat,
                                lng: parseFloat(val),
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
                  <div className={paneStyles.displayFieldLabel}>
                    Elevation Relative to {parentType === "station" ? "Station" : "POI"} (m):
                  </div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldValue}>
                    {!action.elevation ? (
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
                    {!action.location ? (
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
                        dispatch(upsertAction({ ...action, icon: e.unified }));
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

      <div className={paneStyles.panelSection}>
        <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
      </div>
      <div className={paneStyles.lastEditedContainer}>
        <div className={paneStyles.displayFieldValue}>
          <LastEdited updatedAt={action?.updatedAt} />
        </div>
        {action.parentActionUuid && (
          <div style={{ flex: "0 0 20px" }}>
            <FontAwesomeIcon
              id={`${action.uuid}-${action.parentActionUuid}`}
              icon={faCircleDot}
              size="sm"
              className={actionStyles.iconFaded}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={buildActionTooltip()}
            />
          </div>
        )}
      </div>
    </div>
  );
};
