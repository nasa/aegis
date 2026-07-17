import type { FunctionComponent } from "react";
import { useState } from "react";
import assocPoisStyles from "./actions-assocpois.module.css";
import actionStyles from "./actions-action.module.css";
import paneStyles from "./global-pane-styles.module.css";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { faCaretDown, faCaretRight, faCheck, faClone } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setSelectedPoiUuid } from "store/poi";
import { setSectionSelected } from "store/interface";
import { useAppDispatch } from "utils/useAppDispatch";
import { hmmFromMinutes } from "utils/formatting";
import { EmojiRenderer } from "components/interface/emojis";
import { ActionsListHeadings } from "./actions";
import { ActionDefType } from "./actions-action";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import { applyDuplicateActions } from "client/automerge/apply/apply-action";

export const Assoc_POIs: FunctionComponent<{
  stationPoiUuids: string[];
  stationActionUuids: string[];
  editMode: boolean;
}> = ({ stationPoiUuids, stationActionUuids, editMode }) => {
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
            {stationPoiUuids?.map((poiUuid) => (
              <Assoc_POI
                key={poiUuid}
                poiUuid={poiUuid}
                stationActionUuids={stationActionUuids}
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
  poiUuid: string;
  stationActionUuids: string[];
  editMode: boolean;
}> = ({ poiUuid, stationActionUuids, editMode }) => {
  const dispatch = useAppDispatch();

  const stationActions = useMissionDocSelector(
    (mission) => stationActionUuids.map((uuid) => mission.actions[uuid]).filter(Boolean),
    deepEqual
  );

  const poiActions = useMissionDocSelector(
    (mission) => Object.values(mission.actions).filter((action) => action.poiUuid === poiUuid),
    deepEqual
  );
  const selectedStationUuid = useAppSelector(
    (state) => state.station.selectedStationUuid,
    refEqual
  );
  const poi = useMissionDocSelector((mission) => mission.pois[poiUuid], deepEqual);
  const partialMission = useMissionDocSelector(
    (mission) => ({
      actionSystemVersion: mission.actionSystemVersion,
      actionDefinitions: mission.actionDefinitions,
    }),
    deepEqual
  );

  // sort the actions by the order in the POI
  poiActions.sort((action1: Action, action2: Action) => {
    const index1 = poi?.actionOrderUuids?.indexOf(action1.uuid) ?? -1;
    const index2 = poi?.actionOrderUuids?.indexOf(action2.uuid) ?? -1;
    return (index1 > -1 ? index1 : Infinity) - (index2 > -1 ? index2 : Infinity);
  });

  return (
    <div key={poiUuid}>
      <div
        className={assocPoisStyles.stationPoiHeading}
        onClick={() => {
          dispatch(setSelectedPoiUuid(poiUuid));
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
        <div
          style={{
            marginLeft: `${partialMission.actionSystemVersion === 1 ? "5px" : "2px"}`,
            marginRight: "18px",
          }}
        >
          <ActionsListHeadings
            editMode={false}
            showCrewHeading={false}
            editPerms={false}
            isRex={false}
          />
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
            <Assoc_POIAction
              key={poiAction.uuid}
              action={poiAction}
              copiedToStation={inStation}
              editMode={editMode}
              stationUuid={selectedStationUuid}
              actionSystemVersion={partialMission.actionSystemVersion}
              actionDefinitions={partialMission.actionDefinitions}
            />
          );
        })}
      </div>
    </div>
  );
};

const Assoc_POIAction: FunctionComponent<{
  action: Action;
  copiedToStation: boolean;
  editMode: boolean;
  stationUuid: string;
  actionSystemVersion: number;
  actionDefinitions: ActionDefinitions;
}> = ({
  action,
  copiedToStation,
  editMode,
  stationUuid,
  actionSystemVersion,
  actionDefinitions,
}) => {
  return (
    <div className={assocPoisStyles.stationPoiActionItemsWrapper} key={action.uuid}>
      <div
        className={`${assocPoisStyles.stationPoiActionItems} ${
          !action.enabled ? assocPoisStyles.stationPoiActionItemsDisabled : ""
        }`}
      >
        <div className={actionStyles.actionHeading}>
          {actionSystemVersion === 1 || !action.stmAction ? (
            <>
              <div className={assocPoisStyles.actionHeadingTitleIcon}>
                <EmojiRenderer iconValue={action.icon ? action.icon : "2754"} />
              </div>
              <div className={actionStyles.verticalCenter}>
                <div className={assocPoisStyles.actionHeadingType}>{action.type}</div>
              </div>
              <div
                className={`${actionStyles.actionHeadingTitleTextonly} ${actionStyles.verticalCenter}`}
              >
                {action.name}
              </div>
              <div className={actionStyles.actionHeadingRight}>
                <div
                  className={actionStyles.actionHeadingRightItem}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-content={"Duration (h:mm)"}
                  style={{
                    color: action.duration < 0 ? "var(--warning)" : "inherit",
                    marginTop: "2px",
                  }}
                >
                  {hmmFromMinutes(action.duration)}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={assocPoisStyles.actionHeadingTitleIcon}>
                <EmojiRenderer iconValue={action.icon ? action.icon : "2754"} />
              </div>
              <div className={actionStyles.actionV2Header}>
                <ActionDefType
                  actionUuid={action.uuid}
                  type={"verbs"}
                  selectedUuid={action.actionDefinition?.verbUuid}
                  editMode={false}
                  actionDefinitionItems={actionDefinitions.verbs}
                />
                <div className={actionStyles.actionDefType}>of</div>
                <ActionDefType
                  actionUuid={action.uuid}
                  type={"nouns"}
                  selectedUuid={action.actionDefinition?.nounUuid}
                  editMode={false}
                  actionDefinitionItems={actionDefinitions.nouns}
                />
                <div className={actionStyles.actionDefType}>in</div>
                <ActionDefType
                  actionUuid={action.uuid}
                  type={"adjectives"}
                  selectedUuid={action.actionDefinition?.adjectiveUuid}
                  editMode={false}
                  actionDefinitionItems={actionDefinitions.adjectives}
                />
              </div>
              <div className={actionStyles.actionHeadingRight}>
                <div
                  className={actionStyles.actionHeadingRightItem}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-content={"Duration (h:mm)"}
                  style={{ color: action.duration < 0 ? "var(--warning)" : "inherit" }}
                >
                  {hmmFromMinutes(action.duration)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div>
        {copiedToStation ? (
          <FontAwesomeIcon
            icon={faCheck}
            size="xs"
            className={assocPoisStyles.copyIcon}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-content={"Action copied to station"}
          />
        ) : (
          <>
            {editMode ? (
              <FontAwesomeIcon
                icon={faClone}
                size="xs"
                className={assocPoisStyles.copyIcon}
                onClick={(e) => {
                  withMissionChange((m) =>
                    applyDuplicateActions(m, {
                      actions: [action],
                      stationUuid: stationUuid,
                      promotingFromPoi: true,
                      preserveRefUuid: false,
                    })
                  );
                  e.stopPropagation();
                }}
                data-tooltip-id="aegis-tooltip"
                data-tooltip-content="Copy this action to station"
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
};
