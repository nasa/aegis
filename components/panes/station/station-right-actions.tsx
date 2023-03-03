import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import stationStyles from "./station.module.css";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { duplicateAction } from "store/action";
import "react-tooltip/dist/react-tooltip.css";
import _ from "lodash";
import { faCaretDown, faCaretRight, faClone } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setSelectedPoiUuid } from "store/poi";
import { setSectionSelected } from "store/interface";
import Actions from "../actions";
import { setStationEditMode, upsertStation } from "store/station";

const Actions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();
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

  //gather all actions, then order them
  useEffect(() => {
    if (selectedStationUuid && actions && selectedStation) {
      const allStationActions: Action[] = [];

      //get actions directly attached to this station
      allStationActions.push(
        ...actions.filter((action) => action.stationUuid === selectedStationUuid)
      );

      //check if action ordering is deinfed for this station.
      //put any unlisted actions at the end. but there shouldn't be any unlisted actions?
      if (selectedStation.actionOrderUuids) {
        allStationActions.sort((action1: Action, action2: Action) => {
          const index1 = selectedStation.actionOrderUuids.indexOf(action1.uuid);
          const index2 = selectedStation.actionOrderUuids.indexOf(action2.uuid);
          return (index1 > -1 ? index1 : Infinity) - (index2 > -1 ? index2 : Infinity);
        });
      } else {
        //no ordering defined. default order by name
        allStationActions.sort((action1: Action, action2: Action) => {
          const name1 = action1.name.toUpperCase(); // ignore upper and lowercase
          const name2 = action2.name.toUpperCase();
          if (name1 < name2) {
            return -1;
          } else if (name1 > name2) {
            return 1;
          } else {
            return 0;
          }
        });
      }

      setStationActions(allStationActions);
    }
  }, [selectedStationUuid, actions, stationPois, selectedStation]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={`${paneStyles.rightBodyTitle} ${stationStyles.stationColor}`}>
        Station Actions
      </div>
      <div className={paneStyles.rightBodyBody}>
        <Actions
          editMode={editMode}
          setEditMode={(newEditMode: boolean) => {
            dispatch(
              setStationEditMode({ stationUuid: selectedStationUuid, editMode: newEditMode })
            );
          }}
          actions={stationActions}
          actionColor={{ color: "var(--station)" }}
          setActionOrderUuids={(actionOrderUuids) => {
            dispatch(upsertStation({ ...selectedStation, actionOrderUuids: actionOrderUuids }));
          }}
          actionParent={{ stationUuid: selectedStationUuid }}
        />

        <div className={paneStyles.panelContainer}>
          <div
            className={paneStyles.actionsHeading}
            onClick={() => {
              setPoiExpanded(!poiExpanded);
            }}
          >
            <div className={`${paneStyles.actionsHeadingCaret} `}>
              {poiExpanded ? (
                <FontAwesomeIcon icon={faCaretDown} size="sm" />
              ) : (
                <FontAwesomeIcon
                  icon={faCaretRight}
                  size="sm"
                  className={paneStyles.actionsHeadingCaretRight}
                />
              )}
            </div>
            <div className={`${stationStyles.stationPoiTitle} ${stationStyles.stationColor}`}>
              Associated POI Actions
            </div>
          </div>
          <div className={stationStyles.stationPoiSection}>
            {poiExpanded &&
              stationPois?.map((poi) => (
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
                              <div className={paneStyles.actionsHeading}>
                                <div
                                  className={`${paneStyles.actionsHeadingTitle} ${stationStyles.stationColor} ${stationStyles.stationActionsHeadingTitle}`}
                                >
                                  {action.type}
                                </div>
                                <div className={paneStyles.actionsHeadingSubTitle}>
                                  {action.name}
                                </div>
                              </div>
                            </div>
                            <div
                              className={paneStyles.actionHeadingIcons}
                              title="Copy action to station"
                            >
                              {!inStation && editMode && (
                                <FontAwesomeIcon
                                  icon={faClone}
                                  size="xs"
                                  className={stationStyles.copyIcon}
                                  onClick={(e) => {
                                    dispatch(
                                      duplicateAction({ action, stationUuid: selectedStationUuid })
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
        </div>
      </div>
    </div>
  );
};

export default Actions_Panel;
