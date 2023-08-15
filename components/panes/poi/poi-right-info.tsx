import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faCalculator, faLocationDot, faMessage, faXmark } from "@fortawesome/free-solid-svg-icons";
import { LastEdited, SubpanelHeading } from "components/interface/_global-elements";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { setSelectedPOIRightNavItem, upsertPoi } from "store/poi";
import { updateMapDirective } from "store/map";
import { displayFormattedTotalTimeObj } from "utils/component-helpers";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { round } from "lodash";
import { validators } from "components/interface/form/formValidators";

const Info_Panel: FunctionComponent<{
  editMode: boolean;
  actionCount: number;
}> = ({ editMode, actionCount }) => {
  const dispatch = useAppDispatch();
  const selectedPoi = useAppSelector(
    (state) => state.poi.pois.find((poi) => poi.uuid === state.poi.selectedPoiUuid),
    shallowEqual
  );
  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const stationsUsingThisPoi = useAppSelector(
    (state) =>
      state.station.stations.filter((station) => station.poiUuids.includes(selectedPoi.uuid)),
    shallowEqual
  );
  const landerElevation = useAppSelector(
    (state) => state.mission.mission.landerElevationMeters,
    shallowEqual
  );

  const calculatedFields = useAppSelector(
    (state) =>
      state.poi.calculatedFields.find((calculated) => calculated.uuid === selectedPoi.uuid),
    shallowEqual
  );

  const thisMapDirective = mapDirective?.uuid === selectedPoi?.uuid ? mapDirective : null;

  const dispatchPoiMapAction = (mapAction: MapAction) => {
    dispatch(
      updateMapDirective({
        mapItemType: "poi",
        uuid: selectedPoi.uuid,
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

  const handleCreate = () => {
    if (verifyNoActiveMapAction()) {
      dispatchPoiMapAction("createMarker");
    }
  };
  const handleCancelCreate = () => {
    dispatchPoiMapAction("cancelCreateMarker");
  };

  const handleEdit = () => {
    if (verifyNoActiveMapAction()) {
      dispatchPoiMapAction("editMarker");
    }
  };

  const handleCancelEdit = () => {
    dispatchPoiMapAction("cancelEditMarker");
  };

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>POI Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
            </div>
            <div className={paneStyles.descriptionContainer}>
              <WysiwygTextArea
                value={selectedPoi.description}
                editing={editMode}
                onChange={(value) => {
                  dispatch(
                    upsertPoi({
                      ...selectedPoi,
                      description: value,
                    })
                  );
                }}
                key={selectedPoi.uuid}
              />
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faCalculator}>Calculated Totals</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionRow}>
              <div className={paneStyles.panelSection2Column}>
                <div className={paneStyles.panelColumnTable}>
                  <div
                    className={paneStyles.panelColumnTableRow}
                    onClick={() => {
                      dispatch(setSelectedPOIRightNavItem("actions_panel"));
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Number of Actions:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>{actionCount}</div>
                    </div>
                  </div>
                  <div
                    className={paneStyles.panelColumnTableRow}
                    onClick={() => {
                      dispatch(setSelectedPOIRightNavItem("actions_panel"));
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Total Action Time (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {calculatedFields?.totalTime?.durationLower === 0 ? (
                          <>0</>
                        ) : (
                          <>{displayFormattedTotalTimeObj(calculatedFields?.totalTime)}</>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Stations using this POI:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {stationsUsingThisPoi.length}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faLocationDot}>Location</SubpanelHeading>
            </div>

            {editMode ? (
              <div className={`${paneStyles.panelSectionRow} ${paneStyles.sectionButtonRow}`}>
                <>
                  {editMode && mapAction === null && (
                    <>
                      {!selectedPoi.location ? (
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
                        {!selectedPoi.location ? (
                          <>Not set</>
                        ) : (
                          <InLineEditInput
                            value={round(selectedPoi.location.lat, 6).toString()}
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
                                upsertPoi({
                                  ...selectedPoi,
                                  location: {
                                    lat: parseFloat(val),
                                    lng: selectedPoi.location.lng,
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
                        {!selectedPoi.location ? (
                          <>Not set</>
                        ) : (
                          <InLineEditInput
                            value={round(selectedPoi.location.lng, 6).toString()}
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
                                upsertPoi({
                                  ...selectedPoi,
                                  location: {
                                    lat: selectedPoi.location.lat,
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
                      <div className={paneStyles.displayFieldLabel}>Relative Elevation (m):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {!selectedPoi.elevation ? (
                          <>Not set</>
                        ) : (
                          (selectedPoi.elevation - landerElevation).toFixed(0)
                        )}
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
                  <div className={paneStyles.panelColumnTableCellLeft}>
                    <div className={paneStyles.displayFieldLabel}>Last Edited:</div>
                  </div>
                  <div className={paneStyles.panelColumnTableCell}>
                    <div className={paneStyles.displayFieldValue}>
                      <LastEdited updatedAt={selectedPoi?.updatedAt} />
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
