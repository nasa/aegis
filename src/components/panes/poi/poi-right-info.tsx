import type { FunctionComponent } from "react";
import { useMemo } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faCalculator, faLocationDot, faMessage, faXmark } from "@fortawesome/free-solid-svg-icons";
import { LastEditedNumeric, SubpanelHeading } from "components/interface/_global-elements";
import { Button } from "components/interface/form/globalFields";
import {
  ValidatedTextArea,
  ValidatedLatLngField,
} from "components/interface/form/globalFieldsAutomerge";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, shallowEqual, deepEqual, refEqual } from "utils/useAppSelector";
import { setSelectedPOIRightNavItem } from "store/poi";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdatePoiByField } from "operations/apply/apply-poi";
import { validators } from "components/interface/form/formValidators";
import { thunkDocUpdatePoiLocation } from "store/thunk/thunkPoi";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { getCalculatedFieldsByPoi } from "store/processing/calculatedFields";
import { findGlobalGridCoordsFromPoint } from "utils/mapping/geoMath";
import { getLGRSCoordsFromLatLng } from "utils/surf-nav/surfNavWrapper";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useResolvedMissionGrid } from "components/interface/map/hooks/useResolvedMissionGrid";

const Info_Panel: FunctionComponent<{
  editMode: boolean;
}> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const resolvedGrid = useResolvedMissionGrid();
  const partialMission = useMissionDocSelector(
    (mission) => ({
      usingLGRSCoordinates: mission.usingLGRSCoordinates,
      planetRadius: mission.planetRadius,
      projBoundsMinY: mission.projBoundsMinY,
      projBoundsMaxY: mission.projBoundsMaxY,
      projBoundsMinX: mission.projBoundsMinX,
      projBoundsMaxX: mission.projBoundsMaxX,
      landerElevationMeters: mission.landerElevationMeters,
    }),
    deepEqual
  );

  const selectedPoiUuid = useAppSelector((state) => state.poi.selectedPoiUuid, refEqual);
  const docMaps = useMissionDocSelector(
    (mission) => ({
      pois: mission.pois,
      stations: mission.stations,
      actions: mission.actions,
    }),
    shallowEqual
  );
  const selectedPoi = useMemo(
    () => (selectedPoiUuid ? docMaps?.pois[selectedPoiUuid] : undefined),
    [docMaps, selectedPoiUuid]
  );
  const numStationsUsingPoi = useMemo(
    () =>
      selectedPoi && docMaps
        ? Object.values(docMaps.stations).filter((station) =>
            station.poiUuids.includes(selectedPoi.uuid)
          ).length
        : 0,
    [docMaps, selectedPoi]
  );

  const poiCalcFields = useMemo(() => {
    if (!docMaps || !selectedPoi) return undefined;
    const poiActions = Object.values(docMaps.actions).filter(
      (a) => a.poiUuid === selectedPoi.uuid && a.enabled
    );
    return getCalculatedFieldsByPoi({
      poiUuid: selectedPoi.uuid,
      poiActions,
    });
  }, [docMaps, selectedPoi]);

  const mapDirective = useAppSelector((state) => state.map.mapDirective, shallowEqual);
  const thisMapDirective = useMemo(
    () => (mapDirective?.uuid === selectedPoiUuid ? mapDirective : null),
    [mapDirective, selectedPoiUuid]
  );

  const gridCornerPoint = useAppSelector((state) => state.map.gridCornerPoint, refEqual);
  const poiGridCoordinates = useMemo(() => {
    if (selectedPoi?.location && partialMission.usingLGRSCoordinates) {
      return getLGRSCoordsFromLatLng(selectedPoi.location.lat, selectedPoi.location.lng);
    } else if (selectedPoi?.location && resolvedGrid.kind === "server-file" && gridCornerPoint) {
      return findGlobalGridCoordsFromPoint(
        resolvedGrid.grid.coordinates,
        selectedPoi.location,
        partialMission.planetRadius
      );
    } else {
      return "Not set";
    }
  }, [
    selectedPoi,
    partialMission.usingLGRSCoordinates,
    partialMission.planetRadius,
    gridCornerPoint,
    resolvedGrid,
  ]);

  const mapAction = thisMapDirective?.mapAction ? thisMapDirective.mapAction : null;

  const dispatchPoiMapAction = (mapAction: MapAction) => {
    dispatch(
      thunkUpdateMapDirective({
        mapItemType: "poi",
        uuid: selectedPoi.uuid,
        mapAction,
      })
    );
  };

  const handleCreate = async () => {
    dispatchPoiMapAction("createMarker");
  };
  const handleCancelCreate = () => {
    dispatchPoiMapAction("cancelCreateMarker");
  };

  const handleEdit = async () => {
    dispatchPoiMapAction("editMarker");
  };

  const handleCancelEdit = () => {
    dispatchPoiMapAction("cancelEditMarker");
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>POI Information</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
            </div>
            <div className={paneStyles.fieldContainerAutomerge}>
              <ValidatedTextArea
                value={selectedPoi.description || ""}
                editMode={editMode}
                onSubmit={(value: string) => {
                  withMissionChange((m) =>
                    applyUpdatePoiByField(m, {
                      poiUuid: selectedPoi.uuid,
                      fieldName: "description",
                      value: value || "",
                    })
                  );
                }}
                fieldProps={{
                  name: "poiDescription",
                  ariaLabel: "POI Description",
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
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Number of Actions:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {poiCalcFields?.actionCount}
                      </div>
                    </div>
                  </div>
                  <div
                    className={paneStyles.panelColumnTableRow}
                    onClick={() => {
                      dispatch(setSelectedPOIRightNavItem("actions_panel"));
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Total Action Time (mins):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {poiCalcFields?.totalActionTime === 0 ? (
                          <>0</>
                        ) : (
                          <>{Math.ceil(poiCalcFields?.totalActionTime)}</>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Total Mass (g):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>{poiCalcFields?.totalMass}</div>
                    </div>
                  </div>
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Stations using this POI:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>{numStationsUsingPoi}</div>
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
                  <ValidatedLatLngField
                    value={selectedPoi.location}
                    editMode={editMode}
                    fieldPropsLat={{
                      name: "lat",
                      ariaLabel: "LatitudePoi",
                      validators: [
                        validators.mustBeNumber,
                        validators.required,
                        validators.withinBoundary(
                          partialMission.projBoundsMinY,
                          partialMission.projBoundsMaxY
                        ),
                      ],
                    }}
                    fieldPropsLng={{
                      name: "Lng",
                      ariaLabel: "LongitudePoi",
                      validators: [
                        validators.mustBeNumber,
                        validators.required,
                        validators.withinBoundary(
                          partialMission.projBoundsMinX,
                          partialMission.projBoundsMaxX
                        ),
                      ],
                    }}
                    onSubmit={(val: AEGISPoint) => {
                      dispatch(
                        thunkDocUpdatePoiLocation({ location: val, poiUuid: selectedPoi.uuid })
                      );
                    }}
                    key={`${selectedPoi.uuid}-latlng`}
                  />
                </div>
                <div className={paneStyles.panelColumnTable}>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Relative Elevation (m):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>
                        {!selectedPoi.elevation ? (
                          <>Not set</>
                        ) : (
                          (selectedPoi.elevation - partialMission.landerElevationMeters).toFixed(0)
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Grid Coords:</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldValue}>{poiGridCoordinates}</div>
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
                        updatedAt={selectedPoi?.updatedAt}
                        createdAt={selectedPoi?.createdAt}
                        info={[["POI UUID", selectedPoi?.uuid]]}
                      />
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
