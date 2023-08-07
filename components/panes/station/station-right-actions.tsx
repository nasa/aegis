import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import stationStyles from "./station.module.css";
import actionStyles from "../actions-action.module.css";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { faCaretDown, faCaretRight, faClone } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setSelectedPoiUuid } from "store/poi";
import { setSectionSelected } from "store/interface";
import Actions from "../actions";
import { setStationEditMode, upsertStation } from "store/station";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDuplicateAction } from "store/thunk/thunkAction";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";

const Actions_Panel: FunctionComponent<{
  editMode: boolean;
}> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const selectedStation = useAppSelector(
    (state) => state.station.stations.find((station) => station.uuid === selectedStationUuid),
    shallowEqual
  );
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const stationPois = useAppSelector(
    (state) => state.poi.pois.filter((poi) => selectedStation?.poiUuids?.includes(poi.uuid)),
    shallowEqual
  );
  const [stationActions, setStationActions] = useState<Action[]>(null); //contains all station actions
  const [poiExpanded, setPoiExpanded] = useState(false);

  const calculatedFields = useAppSelector(
    (state) =>
      state.station.calculatedFields.find(
        (calculatedFields) => calculatedFields.uuid === selectedStationUuid
      ),
    shallowEqual
  );

  const [actionsCalculatedFields, setActionsCalculatedField] =
    useState<ActionsCalculatedFields>(null);

  //gather all actions, then order them
  useEffect(() => {
    if (!selectedStationUuid || !actions || !selectedStation) return;

    const allStationActions: Action[] = [];

    //get actions directly attached to this station
    allStationActions.push(
      ...actions.filter((action) => {
        return action.stationUuid === selectedStationUuid;
      })
    );
    setStationActions(allStationActions);
  }, [selectedStationUuid, actions, stationPois, selectedStation]);

  useEffect(() => {
    if (!calculatedFields) return;
    // create the calculated action fields for the action tab
    const newActionsCalculatedFields: ActionsCalculatedFields = {
      actionCount: calculatedFields.actionCount,
      totalTime: calculatedFields.totalTime,
      totalEv1Time: calculatedFields.totalEv1Time,
      totalEv2Time: calculatedFields.totalEv2Time,
      totalUnassignedTime: calculatedFields.totalUnassignedTime,
      totalDwellTime: calculatedFields.totalDwellTime,
    };
    setActionsCalculatedField(newActionsCalculatedFields);
  }, [calculatedFields]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitleContainer}>
        <div className={paneStyles.rightBodyTitle}>Station Actions</div>
        <ExpandCollapseActionsButtons actionUuids={stationActions?.map((action) => action.uuid)} />
      </div>
      <div className={paneStyles.rightBodyBody} style={{ overflowY: "hidden" }}>
        <Actions
          editMode={editMode}
          setEditMode={(newEditMode: boolean) => {
            dispatch(
              setStationEditMode({ stationUuid: selectedStationUuid, editMode: newEditMode })
            );
          }}
          actions={stationActions}
          actionColor={{ color: "white" }}
          actionOrderUuids={selectedStation.actionOrderUuids}
          setActionOrderUuids={(actionOrderUuids) => {
            dispatch(upsertStation({ ...selectedStation, actionOrderUuids: actionOrderUuids }));
          }}
          actionParentUuid={{ stationUuid: selectedStationUuid }}
          parentType="station"
          actionsCalculatedFields={actionsCalculatedFields}
        />

        <div className={paneStyles.panelContainer}>
          <div
            className={paneStyles.bigHeading}
            onClick={() => {
              setPoiExpanded(!poiExpanded);
            }}
          >
            <div className={`${paneStyles.bigHeadingCaret} `}>
              {poiExpanded ? (
                <FontAwesomeIcon
                  icon={faCaretDown}
                  size="sm"
                  className={paneStyles.bigHeadingCaretDown}
                />
              ) : (
                <FontAwesomeIcon
                  icon={faCaretRight}
                  size="sm"
                  className={paneStyles.bigHeadingCaretRight}
                />
              )}
            </div>
            <div className={`${stationStyles.stationPoiTitle}`}>Associated POI Actions</div>
          </div>
          {poiExpanded && (
            <div className={stationStyles.stationPoiSection}>
              {stationPois?.map((poi) => (
                <div key={poi.uuid}>
                  <div
                    className={stationStyles.stationPoiHeading}
                    onClick={() => {
                      dispatch(setSelectedPoiUuid(poi.uuid));
                      // set the active section to the POI section
                      dispatch(setSectionSelected("poi"));
                    }}
                  >
                    <div className={stationStyles.poiIcon}>
                      {String.fromCodePoint(parseInt(poi.icon, 16))}
                    </div>
                    <div className={stationStyles.stationPoiSubheading}>{poi.name}</div>
                  </div>
                  <div className={stationStyles.stationPoiActions}>
                    {actions
                      .filter((action) => action.poiUuid === poi.uuid)
                      .map((action) => {
                        const inStation: boolean =
                          stationActions.findIndex(
                            (stationAction) => stationAction.parentActionUuid === action.uuid
                          ) > -1;
                        return (
                          <div
                            className={`${stationStyles.actionsHeading} ${
                              inStation && stationStyles.actionHeadingFaded
                            }`}
                            key={action.uuid}
                          >
                            <div className={stationStyles.stationPoiActionItems}>
                              <div className={actionStyles.actionsHeading}>
                                <div
                                  className={`${actionStyles.actionsHeadingType} ${stationStyles.stationActionsHeadingTitle}`}
                                >
                                  {action.type}
                                </div>
                                <div className={actionStyles.actionsHeadingTitle}>
                                  {action.name}
                                </div>
                              </div>
                            </div>
                            <div
                              className={actionStyles.actionHeadingIcons}
                              data-tooltip-id="aegis-tooltip"
                              data-tooltip-html="Copy this action to station"
                            >
                              {!inStation && editMode && (
                                <FontAwesomeIcon
                                  icon={faClone}
                                  size="xs"
                                  className={stationStyles.copyIcon}
                                  onClick={(e) => {
                                    dispatch(
                                      thunkDuplicateAction({
                                        action,
                                        stationUuid: selectedStationUuid,
                                        preserveParentUuid: true,
                                      })
                                    );
                                    e.stopPropagation();
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Actions_Panel;
