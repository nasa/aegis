import type { FunctionComponent } from "react";
import { useCallback, useEffect, useState } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionsStyles from "./actions.module.css";
import { Button, Dropdown } from "components/interface/form/globalFields";
import Action from "./actions-action";
import isNull from "lodash/isNull";
import clone from "lodash/clone";
import isNil from "lodash/isNil";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import ReactDragListView from "react-drag-listview";
import { STM_Coverage } from "./stm-legacy/stm-legacy-coverage";
import CalculatedDwell from "./calculated-dwell";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { Assoc_POIs } from "./actions-assocpois";
import { getStmUuids } from "store/storeUtils/store";
import { letterOrdinal } from "utils/formatting";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import { applyCreateAction } from "operations/apply/apply-action";
import { getHighlightedActions } from "store/selectors";

const Actions: FunctionComponent<{
  editMode: boolean;
  actionOrderUuids: string[];
  setActionOrderUuids: (actionOrderUuids: string[]) => void;
  actionParentUuid: Pick<Action, "poiUuid" | "stationUuid" | "traverseUuid">;
  parentType: ActionParentType;
  actionsCalculatedFields: ActionsCalculatedFields;
  rexUuid: string;
}> = ({
  editMode,
  actionOrderUuids,
  setActionOrderUuids,
  actionParentUuid,
  parentType,
  actionsCalculatedFields,
  rexUuid,
}) => {
  const actionTemplates = useMissionDocSelector((mission) => mission.actionTemplates, deepEqual);
  const allActions = useMissionDocSelector((mission) => mission.actions, deepEqual);

  const sortedActionTemplates = !actionTemplates
    ? []
    : Object.entries(actionTemplates).sort(([, a], [, b]) =>
        a.templateName.localeCompare(b.templateName)
      );

  const parentStationPoiUuids = useMissionDocSelector(
    (mission) => mission.stations[actionParentUuid?.stationUuid]?.poiUuids,
    shallowEqual
  );
  const stationPoiUuids =
    useMissionDocSelector(
      (mission) =>
        Object.values(mission.pois)
          .filter((poi) => parentStationPoiUuids?.includes(poi.uuid))
          .map((p) => p.uuid),
      shallowEqual
    ) ?? [];

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const [isActionHighlighted, setIsActionHighlighted] = useState<ActionHighlight[]>([]);
  const [selectedTemplateUuid, setSelectedTemplateUuid] = useState<string>("");
  const [newActionUuid, setNewActionUuid] = useState(undefined);

  //set state of highlighted actions when the STM is hovered over
  const highlightActions = useCallback(
    async (level3Uuid: string) => {
      if (!actionOrderUuids || !allActions) return;
      const resHighlightActions = getHighlightedActions({
        actionUuids: actionOrderUuids,
        stmUuid: level3Uuid,
        actions: allActions,
      });
      setIsActionHighlighted(resHighlightActions);
    },
    [actionOrderUuids, allActions]
  );

  //reorder actions and save back to state.
  const reorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!actionOrderUuids) return;
      const actionOrder: string[] = clone(actionOrderUuids);
      const actionBeingMoved = actionOrder.splice(fromIndex, 1)[0]; //remove action uuid
      actionOrder.splice(toIndex, 0, actionBeingMoved); //reinsert in new position

      //save new action ordering
      setActionOrderUuids(actionOrder);
    },
    [actionOrderUuids, setActionOrderUuids]
  );

  // Un-marks newest list item as "new" after a short timeout (for auto focusing)
  useEffect(() => {
    if (newActionUuid !== undefined) {
      setTimeout(() => {
        setNewActionUuid(undefined);
      }, 300);
    }
  }, [newActionUuid]);

  return (
    <>
      <ActionsTopSection
        actionOrderUuids={actionOrderUuids}
        showDwell={parentType !== "poi"}
        highlightActions={highlightActions}
        actionsCalculatedFields={actionsCalculatedFields}
        rexUuid={rexUuid}
      />

      <div className={actionsStyles.actionListContainer}>
        <ActionsListHeadings
          editMode={editMode}
          showCrewHeading={parentType !== "poi"}
          editPerms={editPerms}
          isRex={!!rexUuid}
        />
        <div className={actionsStyles.dragableActionList}>
          <ReactDragListView onDragEnd={reorder} nodeSelector="li" handleSelector="a">
            <ActionList
              editMode={editMode}
              rexUuid={rexUuid}
              parentType={parentType}
              actionOrderUuids={actionOrderUuids}
              highlightActions={highlightActions}
              isActionHighlighted={isActionHighlighted}
              stations={
                useMissionDocSelector((mission) => Object.values(mission.stations), deepEqual) ?? []
              }
              pois={
                useMissionDocSelector((mission) => Object.values(mission.pois), deepEqual) ?? []
              }
              newActionUuid={newActionUuid}
            />
          </ReactDragListView>
        </div>
      </div>

      {parentType === "station" && (
        <Assoc_POIs
          stationPoiUuids={stationPoiUuids}
          stationActionUuids={actionOrderUuids}
          editMode={editMode}
        />
      )}

      <div className={actionsStyles.rightBodyItem} style={{ marginTop: "8px" }}>
        {editMode && (
          <div className={actionsStyles.addActionRow}>
            <Button
              icon={faPlusCircle}
              label="Add Action"
              style={{ width: "100px" }}
              onClick={async () => {
                const actionTemplate = selectedTemplateUuid
                  ? sortedActionTemplates.find((sat) => sat[0] === selectedTemplateUuid)?.[1]
                  : null;
                setNewActionUuid(
                  withMissionChange((m) =>
                    applyCreateAction(m, {
                      actionParentUuid,
                      actionTemplate,
                    })
                  )
                );
              }}
            />
            <Dropdown
              selected={selectedTemplateUuid}
              onChange={(val) => {
                setSelectedTemplateUuid(val);
              }}
              selectStyle={{ height: "2em", fontSize: "0.8em" }}
              containerStyle={{ maxWidth: "200px" }}
            >
              {sortedActionTemplates?.map(([uuid, template]) => {
                return (
                  <option key={uuid} value={uuid}>
                    {template.templateName}
                  </option>
                );
              })}
              <option value="">{`<Template>`}</option>
            </Dropdown>
          </div>
        )}
      </div>
    </>
  );
};

export default Actions;

export const ActionsTopSection: FunctionComponent<{
  actionOrderUuids: string[];
  showDwell: boolean;
  highlightActions: (level3Uuid: string) => void;
  actionsCalculatedFields: ActionsCalculatedFields;
  rexUuid: string;
}> = ({ actionOrderUuids, showDwell, highlightActions, actionsCalculatedFields, rexUuid }) => {
  const actionSystemVersion = useMissionDocSelector(
    (mission) => mission.actionSystemVersion,
    refEqual
  );
  const allActions = useMissionDocSelector((mission) => mission.actions, deepEqual) ?? {};

  // make a 2D array of all stm uuids for each action
  // of the STMs that are referenced by the action in the action STMPriorities object
  const stmUuidsByAction = useMissionDocSelector((mission) => {
    return actionOrderUuids
      ?.filter((uuid) => mission.actions[uuid])
      .map((uuid) => {
        const action = mission.actions[uuid];
        if (action.enabled === false) return null;
        return getStmUuids(action.stmPriorities);
      });
  }, deepEqual);

  const completedStmUuidsByAction = useMissionDocSelector((mission) => {
    if (!rexUuid || !mission?.rexes) return null;
    const rex = mission.rexes[rexUuid];
    const stmUuidsByActionUuid: string[][] = [];
    for (const actionUuid in rex.actionEntries) {
      // check if this action is part of the current list (actionOrderUuids). this is to cover
      //    the case in which actions have a status, and then were deleted.
      if (
        rex.actionEntries[actionUuid]?.rexStatus === "complete" &&
        actionOrderUuids?.includes(actionUuid)
      ) {
        const action = allActions[actionUuid];
        if (action?.enabled === false) return null;
        stmUuidsByActionUuid.push(getStmUuids(action?.stmPriorities));
      }
    }
    return stmUuidsByActionUuid;
  }, deepEqual);

  const inProgressStmUuidsByAction = useMissionDocSelector((mission) => {
    if (!rexUuid || !mission?.rexes) return null;
    const rex = mission.rexes[rexUuid];
    const stmUuidsByActionUuid: string[][] = [];
    for (const actionUuid in rex.actionEntries) {
      // check if this action is part of the current list (actionOrderUuids). this is to cover
      //    the case in which actions have a status, and then were deleted.
      if (
        rex.actionEntries[actionUuid]?.rexStatus === "in-progress" &&
        actionOrderUuids?.includes(actionUuid)
      ) {
        const action = allActions[actionUuid];
        if (action?.enabled === false) return null;
        stmUuidsByActionUuid.push(getStmUuids(action?.stmPriorities));
      }
    }
    return stmUuidsByActionUuid;
  }, deepEqual);

  // there's a difference between null/undefined and 0. Only calculate rex mass if it's 0. Null/undefined means it hasn't been filled in.
  const rexMass = useMissionDocSelector((mission) => {
    if (!rexUuid || !actionOrderUuids || !mission?.rexes) return null;
    const rex = mission.rexes[rexUuid];
    let mass = null;
    // loop through all actions
    for (const actionUuid of actionOrderUuids) {
      const action = allActions[actionUuid];
      if (!action || !action.enabled) continue;
      if (
        !rex.actionEntries ||
        !rex.actionEntries[actionUuid] ||
        isNil(rex.actionEntries[actionUuid].mass) // checks for null or undefined
      )
        continue;
      // this action has a non-null mass actual entry
      if (!isNull(mass)) {
        mass += rex.actionEntries[actionUuid].mass;
      } else {
        mass = rex.actionEntries[actionUuid].mass;
      }
    }
    return mass;
  }, refEqual);

  const rexMassDelta = useMissionDocSelector((mission) => {
    if (!rexUuid || isNull(rexMass)) return null;
    let massPlanned = 0;
    // loop through all actions
    for (const actionUuid of actionOrderUuids) {
      const action = mission.actions[actionUuid];
      if (!action || !action.enabled || !action.mass) continue;
      massPlanned += action.mass;
    }
    return rexMass - massPlanned;
  }, refEqual);

  return (
    <div className={paneStyles.panelContainer}>
      <div className={paneStyles.panelSection}>
        {actionSystemVersion === 1 && (
          <div className={actionsStyles.stmCoverage}>
            <STM_Coverage
              stmUuidsByActionUuid={stmUuidsByAction}
              horizontal={true}
              onLevel3Hover={highlightActions}
              completedStmUuidsByAction={completedStmUuidsByAction}
              inProgressStmUuidsByAction={inProgressStmUuidsByAction}
            />
          </div>
        )}
        <div className={paneStyles.panelSectionRow} style={{ marginTop: "8px" }}>
          <div className={paneStyles.panelSection2Column}>
            <div className={paneStyles.panelColumnTable}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldLabel}>Number of Actions:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldValue}>
                    {actionsCalculatedFields?.actionCount}
                  </div>
                </div>
              </div>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCell}>
                  <div
                    className={paneStyles.displayFieldLabel}
                    data-tooltip-id="aegis-tooltip"
                    data-tooltip-content="Sum of all action durations, nominal to max"
                  >
                    Total Action Time (mins):
                  </div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldValue}>
                    {actionsCalculatedFields?.totalActionTime === 0 ? (
                      <>0</>
                    ) : (
                      <>{Math.ceil(actionsCalculatedFields?.totalActionTime)}</>
                    )}
                  </div>
                </div>
              </div>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldLabel}>Total Planned Mass (g):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldValue}>
                    {actionsCalculatedFields?.totalMass}
                  </div>
                </div>
              </div>
              {rexUuid && (
                <>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Total Executed Mass (g):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={`${paneStyles.displayFieldValue}`}>{rexMass}</div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={paneStyles.displayFieldLabel}>Executed Delta Mass (g):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={`${paneStyles.displayFieldValue}`}>
                        {`${rexMassDelta > 0 ? "+" : ""}`}
                        {rexMassDelta}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={paneStyles.panelColumnTable}>
              {showDwell && (
                <>
                  <CalculatedDwell actionsCalculatedFields={actionsCalculatedFields} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ActionsListHeadings: FunctionComponent<{
  editMode: boolean;
  showCrewHeading: boolean;
  editPerms: boolean;
  isRex: boolean;
}> = ({ editMode, showCrewHeading, editPerms, isRex }) => {
  const actionSystemVersion = useMissionDocSelector(
    (mission) => mission.actionSystemVersion,
    refEqual
  );

  return (
    <div
      className={actionsStyles.actionListHeader}
      style={{
        marginLeft: actionSystemVersion === 2 ? "20px" : "",
        marginRight: editMode ? "20px" : "",
      }}
    >
      {isRex && editPerms ? <div className={actionsStyles.actionListHeaderRex} /> : <></>}
      {actionSystemVersion === 1 && (
        <div className={actionsStyles.actionListHeaderType}>
          <div className={actionsStyles.actionListHeaderLabel}>Type</div>
        </div>
      )}
      <div className={actionsStyles.actionListHeaderTitle}>
        <div className={actionsStyles.actionListHeaderLabel}>Action</div>
      </div>
      <div className={actionsStyles.actionListHeaderTime}>
        <div className={actionsStyles.actionListHeaderLabel}>Dur.</div>
      </div>
      {showCrewHeading && (
        <div className={actionsStyles.actionListHeaderCrew}>
          <div className={actionsStyles.actionListHeaderLabel}>Crew</div>
        </div>
      )}
    </div>
  );
};

export const ActionList: FunctionComponent<{
  editMode: boolean;
  actionOrderUuids: string[];
  parentType: ActionParentType;
  highlightActions: (level3Uuid: string) => void;
  isActionHighlighted: ActionHighlight[];
  stations: Station[];
  pois: POI[];
  rexUuid: string;
  newActionUuid?: string;
}> = ({
  editMode,
  actionOrderUuids,
  parentType,
  isActionHighlighted,
  stations,
  pois,
  rexUuid,
  newActionUuid,
}) => {
  return (
    <ul className={actionsStyles.actionlist}>
      {actionOrderUuids?.map((actionUuid, index) => {
        const highlight = isActionHighlighted.find(
          (highlight) => highlight.uuid === actionUuid
        )?.highlight;
        const parentLocation =
          stations?.find((station) => station.actionOrderUuids.includes(actionUuid))?.location ||
          pois?.find((poi) => poi.actionOrderUuids.includes(actionUuid))?.location;
        const parentElevation =
          stations?.find((station) => station.actionOrderUuids.includes(actionUuid))?.elevation ||
          pois?.find((poi) => poi.actionOrderUuids.includes(actionUuid))?.elevation;
        return (
          <li key={actionUuid} className={actionsStyles.actionlistitem}>
            <div
              className={actionsStyles.actionlistitemOrdinal}
              style={{ marginTop: editMode ? "8px" : "4px" }}
            >
              {letterOrdinal(index + 1)}
            </div>
            <Action
              editMode={editMode}
              actionUuid={actionUuid}
              highlight={highlight}
              parentType={parentType}
              parentLocation={parentLocation}
              parentElevation={parentElevation}
              rexUuid={rexUuid}
              toFocus={newActionUuid === actionUuid}
            />
          </li>
        );
      })}
    </ul>
  );
};
