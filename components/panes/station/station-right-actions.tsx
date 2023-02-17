import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import stationStyles from "./station.module.css";
import { IconButton } from "components/interface/_global-elements";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { setStationEditMode, upsertStation } from "store/station";
import { duplicateAction, upsertAction } from "store/action";
import StationAction from "./station-right-actions-action";
import { starWars, uniqueNamesGenerator } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";
import "react-tooltip/dist/react-tooltip.css";
import _ from "lodash";
import {
  faCaretDown,
  faCaretRight,
  faClone,
  faPlusCircle,
  faTableList,
} from "@fortawesome/free-solid-svg-icons";
import ReactDragListView from "react-drag-listview";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { STM_Coverage } from "../stm-coverage";
import { setSelectedPoiUuid } from "store/poi";
import { setSectionSelected } from "store/interface";
const profanityFilter = require("leo-profanity");

interface WrappedAction {
  action: Action;
  highlight: boolean;
}

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
  const selectedMissionId = useAppSelector((state) => state.mission.mission?.id, refEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const stationPois = useAppSelector(
    (state) => state.poi.pois.filter((poi) => selectedStation?.poiUuids?.includes(poi.uuid)),
    shallowEqual
  );
  const [wrappedStationActions, setWrappedStationActions] = useState<WrappedAction[]>(null); //contains all station actions
  const [poiExpanded, setPoiExpanded] = useState(false);

  //gather all actions, wrap, then order them
  useEffect(() => {
    if (selectedStationUuid && actions && selectedStation) {
      const allStationActions: Action[] = [];

      //get actions directly attached to this station
      allStationActions.push(
        ...actions.filter((action) => action.stationUuid === selectedStationUuid)
      );

      //wrap all the actions
      const allStationActions_Wrapped: WrappedAction[] = [];
      allStationActions.forEach((action) => {
        allStationActions_Wrapped.push({ action: action, highlight: false });
      });

      //check if action ordering is deinfed for this station.
      //put any unlisted actions at the end. but there shouldn't be any unlisted actions?
      if (selectedStation.actionOrderUuids) {
        allStationActions_Wrapped.sort((action1: WrappedAction, action2: WrappedAction) => {
          const index1 = selectedStation.actionOrderUuids.indexOf(action1.action.uuid);
          const index2 = selectedStation.actionOrderUuids.indexOf(action2.action.uuid);
          return (index1 > -1 ? index1 : Infinity) - (index2 > -1 ? index2 : Infinity);
        });
      } else {
        //no ordering defined. default order by name
        allStationActions_Wrapped.sort((action1: WrappedAction, action2: WrappedAction) => {
          const name1 = action1.action.name.toUpperCase(); // ignore upper and lowercase
          const name2 = action2.action.name.toUpperCase();
          if (name1 < name2) {
            return -1;
          } else if (name1 > name2) {
            return 1;
          } else {
            return 0;
          }
        });
      }

      setWrappedStationActions(allStationActions_Wrapped);
    }
  }, [selectedStationUuid, actions, stationPois, selectedStation]);

  const handleCreateAction = () => {
    let randomName = "";
    while (randomName === "") {
      const name = uniqueNamesGenerator({
        dictionaries: [starWars],
        style: "capital",
      });
      const actionWithSameName = actions.find((action) => action.name === name);
      const profanityCheck = profanityFilter.check(name);
      randomName = actionWithSameName || profanityCheck ? "" : name;
    }

    const blankAction: Action = {
      missionId: selectedMissionId,
      stationUuid: selectedStationUuid,
      uuid: uuidv4(),
      name: "A-" + randomName,
      description: "",
      status: "Candidate",
      type: "other",
      durationLower: 5,
      durationUpper: null,
      stmUuidRefs: null,
      inventoryItems: null,
      priorityOverride: null,
    };

    dispatch(upsertAction(blankAction));
    dispatch(setStationEditMode({ stationUuid: selectedStationUuid, editMode: true }));
  };

  //set state of highlight connected actions when the STM is hovered over
  function highlightActions(invstgUUID: string) {
    if (wrappedStationActions) {
      const wrappedActions = _.cloneDeep(wrappedStationActions);
      for (const wrappedAction of wrappedActions) {
        const stmUuidRefs = wrappedAction.action.stmUuidRefs;
        if (stmUuidRefs) {
          for (const stmUuid of stmUuidRefs) {
            if (!invstgUUID) {
              wrappedAction.highlight = false;
            } else if (stmUuid === invstgUUID) {
              wrappedAction.highlight = true;
            }
          }
        }
      }
      setWrappedStationActions(wrappedActions);
    }
  }

  //reorder actions and save back to state
  function reorder(fromIndex: number, toIndex: number) {
    if (wrappedStationActions) {
      const actionOrder: string[] = [];
      for (const wrappedAction of wrappedStationActions) {
        actionOrder.push(wrappedAction.action.uuid);
      }
      const actionBeingMoved = actionOrder.splice(fromIndex, 1)[0]; //remove action uuid
      actionOrder.splice(toIndex, 0, actionBeingMoved); //reinsert in new position

      //save new action ordering
      dispatch(upsertStation({ ...selectedStation, actionOrderUuids: actionOrder }));
    }
  }

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyBody}>
        <div className={`${paneStyles.rightBodyTitle} ${stationStyles.stationColor}`}>
          Station Actions
        </div>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>Station Actions STM Coverage</div>
            <div className={stationStyles.stationSTMCoverage}>
              <FontAwesomeIcon icon={faTableList} size="sm" title="STM Coverage" />
              <STM_Coverage
                actions={actions.filter((action) => action.stationUuid === selectedStationUuid)}
                mini={true}
                horizontal={true}
                onInvstgHover={highlightActions}
                uniqueKey="stationSummaryInfo"
              />
            </div>
          </div>
        </div>

        <ReactDragListView onDragEnd={reorder} nodeSelector="li" handleSelector="a">
          <ul className={stationStyles.actionlist}>
            {wrappedStationActions?.map((wrappedAction) => (
              <li key={wrappedAction.action.uuid} className={stationStyles.actionlistitem}>
                <StationAction
                  editMode={editMode}
                  stationUuid={selectedStationUuid}
                  action={wrappedAction.action}
                  highlight={wrappedAction.highlight}
                />
              </li>
            ))}
          </ul>
        </ReactDragListView>
        <div className={stationStyles.stationRightBodyItem}>
          {editMode && (
            <IconButton
              icon={faPlusCircle}
              label="Add Action"
              style={{ width: "100px" }}
              onClick={() => {
                handleCreateAction();
              }}
            />
          )}
        </div>

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
                  <div className={stationStyles.stationPoiHeading}>
                    <div className={stationStyles.poiIcon}>
                      {poi.color ? String.fromCodePoint(parseInt(poi.color.value, 16)) : ""}
                    </div>
                    <div
                      className={stationStyles.stationPoiSubheading}
                      onClick={() => {
                        dispatch(setSelectedPoiUuid(poi.uuid));
                        // set the active section to the POI section
                        dispatch(setSectionSelected("poi"));
                      }}
                    >
                      {poi.name}
                    </div>
                  </div>
                  <div className={stationStyles.stationPoiActions}>
                    {actions
                      .filter((action) => action.poiUuid === poi.uuid)
                      .map((action) => {
                        const inStation: boolean =
                          wrappedStationActions.findIndex(
                            (wrappedAction) => wrappedAction.action.parentActionUuid === action.uuid
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
