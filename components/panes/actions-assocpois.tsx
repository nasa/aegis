import { FunctionComponent, useState } from "react";
import assocPoisStyles from "./actions-assocpois.module.css";
import actionStyles from "./actions-action.module.css";
import paneStyles from "./global-pane-styles.module.css";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { faCaretDown, faCaretRight, faCheck, faClone } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setSelectedPoiUuid } from "store/poi";
import { setSectionSelected } from "store/interface";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDuplicateAction } from "store/thunk/thunkAction";
import { hhmmFromMinutes } from "utils/formatting";

export const Assoc_POIs: FunctionComponent<{
  stationPois: POI[];
  stationActions: Action[];
  editMode: boolean;
}> = ({ stationPois, stationActions, editMode }) => {
  const [poiExpanded, setPoiExpanded] = useState(false);

  return (
    <div
      className={assocPoisStyles.poiActionsSectionContainer}
      style={{ minHeight: poiExpanded ? "200px" : "41px" }}
    >
      <div
        className={paneStyles.panelContainer}
        style={{ paddingTop: "5px", paddingBottom: "5px", marginBottom: "0" }}
      >
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
          <div className={assocPoisStyles.stationPoiTitle}>Associated POI Actions</div>
        </div>
        {poiExpanded && (
          <div className={assocPoisStyles.stationPoiSection}>
            {stationPois?.map((poi) => (
              <Assoc_POI
                key={poi.uuid}
                poi={poi}
                stationActions={stationActions}
                editMode={editMode}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Assoc_POI: FunctionComponent<{
  poi: POI;
  stationActions: Action[];
  editMode: boolean;
}> = ({ poi, stationActions, editMode }) => {
  const dispatch = useAppDispatch();

  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );

  const poiActions = actions.filter((action) => action.poiUuid === poi.uuid);
  // sort the actions by the order in the POI
  poiActions.sort((action1: Action, action2: Action) => {
    const index1 = poi.actionOrderUuids.indexOf(action1.uuid);
    const index2 = poi.actionOrderUuids.indexOf(action2.uuid);
    return (index1 > -1 ? index1 : Infinity) - (index2 > -1 ? index2 : Infinity);
  });

  return (
    <div key={poi.uuid}>
      <div
        className={assocPoisStyles.stationPoiHeading}
        onClick={() => {
          dispatch(setSelectedPoiUuid(poi.uuid));
          // set the active section to the POI section
          dispatch(setSectionSelected("poi"));
        }}
      >
        <div className={assocPoisStyles.poiIcon}>
          {String.fromCodePoint(parseInt(poi.icon, 16))}
        </div>
        <div className={assocPoisStyles.stationPoiSubheading}>{poi.name}</div>
      </div>
      {poiActions.length > 0 ? (
        <div className={assocPoisStyles.actionListHeader}>
          <div className={assocPoisStyles.actionListHeaderType}>
            <div className={assocPoisStyles.actionListHeaderLabel}>Type</div>
          </div>
          <div className={assocPoisStyles.actionListHeaderTitle}>
            <div className={assocPoisStyles.actionListHeaderLabel}>Title</div>
          </div>
          <div className={assocPoisStyles.actionListHeaderPriority}>
            <div
              className={assocPoisStyles.actionListHeaderLabel}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={"Priority"}
            >
              Pri
            </div>
          </div>
          <div
            className={assocPoisStyles.actionListHeaderTime}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html={"Max Duration (mins)"}
          >
            <div className={assocPoisStyles.actionListHeaderLabel}>Max</div>
          </div>
        </div>
      ) : (
        <div className={assocPoisStyles.actionListHeader}>No Actions</div>
      )}
      <div className={assocPoisStyles.stationPoiActions}>
        {poiActions.map((poiAction) => {
          const inStation: boolean =
            stationActions.findIndex(
              (stationAction) => stationAction.parentActionUuid === poiAction.uuid
            ) > -1;
          return (
            <div className={assocPoisStyles.stationPoiActionItemsWrapper} key={poiAction.uuid}>
              <div
                className={`${assocPoisStyles.stationPoiActionItems} ${
                  !poiAction.enabled ? assocPoisStyles.stationPoiActionItemsDisabled : ""
                }`}
              >
                <div className={actionStyles.actionsHeading}>
                  <div className={actionStyles.actionsHeadingType}>{poiAction.type}</div>
                  <div className={actionStyles.actionsHeadingTitle}>{poiAction.name}</div>
                  <div className={actionStyles.actionHeadingRight}>
                    <div
                      className={actionStyles.actionHeadingRightItem}
                      style={{ width: "15px", textAlign: "right" }}
                      data-tooltip-id="aegis-tooltip"
                      data-tooltip-html={"Priority"}
                    >
                      {poiAction.priority}
                    </div>
                    <div
                      className={actionStyles.actionHeadingRightItem}
                      data-tooltip-id="aegis-tooltip"
                      data-tooltip-html={"Max Duration (mins)"}
                    >
                      {hhmmFromMinutes(poiAction.durationUpper).slice(1)}
                    </div>
                  </div>
                </div>
              </div>
              <div>
                {inStation ? (
                  <FontAwesomeIcon
                    icon={faCheck}
                    size="xs"
                    className={assocPoisStyles.copyIcon}
                    data-tooltip-id="aegis-tooltip"
                    data-tooltip-html={"Action copied to station"}
                  />
                ) : (
                  <>
                    {editMode ? (
                      <FontAwesomeIcon
                        icon={faClone}
                        size="xs"
                        className={assocPoisStyles.copyIcon}
                        onClick={(e) => {
                          dispatch(
                            thunkDuplicateAction({
                              action: poiAction,
                              stationUuid: selectedStationUuid,
                              preserveParentUuid: true,
                            })
                          );
                          e.stopPropagation();
                        }}
                        data-tooltip-id="aegis-tooltip"
                        data-tooltip-html="Copy this action to station"
                        style={{ cursor: "pointer" }}
                      />
                    ) : (
                      <div className={assocPoisStyles.copyIconSpacer}></div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
