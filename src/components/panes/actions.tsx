import { FunctionComponent, useCallback, useEffect, useState } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionsStyles from "./actions.module.css";
import { Button, Dropdown } from "components/interface/form/globalFields";
import Action from "./actions-action";
import _ from "lodash";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import ReactDragListView from "react-drag-listview";
import { STM_Coverage } from "./stm/stm-coverage";
import { displayFormattedTotalTimeObj } from "utils/component-helpers";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCreateAction, thunkGetHighlightedActions } from "store/thunk/thunkAction";
import CalculatedDwell from "./calculated-dwell";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { Assoc_POIs } from "./actions-assocpois";
import { getStmUuidRefs } from "store/storeUtils/store";

const Actions: FunctionComponent<{
  editMode: boolean;
  setEditMode: (newEditMode: boolean) => void;
  actionOrderUuids: string[];
  setActionOrderUuids: (actionOrderUuids: string[]) => void;
  actionParentUuid: Pick<Action, "poiUuid" | "stationUuid">;
  parentType: "poi" | "station" | "eva";
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
  const dispatch = useAppDispatch();

  const actionTemplates = useAppSelector(
    (state) => state.mission.mission.actionTemplates,
    shallowEqual
  );

  const parentStationPoiUuids = useAppSelector(
    (state) =>
      state.station.stations.find((s) => s.uuid === actionParentUuid?.stationUuid)?.poiUuids,
    shallowEqual
  );
  const stationPoiUuids = useAppSelector(
    (state) =>
      state.poi.pois.filter((poi) => parentStationPoiUuids?.includes(poi.uuid)).map((p) => p.uuid),
    shallowEqual
  );

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const actionIsInRunningRex = !_.isNull(rexUuid);

  const actionSystemVersion = useAppSelector(
    (state) => state.mission.mission.actionSystemVersion,
    refEqual
  );

  const [isActionHiglighted, setIsActionHighlighted] = useState<ActionHighlight[]>([]);
  const [selectedTemplateUuid, setSelectedTemplateUuid] = useState<string>("");
  const [newActionUuid, setNewActionUuid] = useState(undefined);

  //set state of highlighted actions when the STM is hovered over
  const highlightActions = useCallback(
    async (level3Uuid: string) => {
      if (!actionOrderUuids) return;
      const resHighlightActions = await dispatch(
        thunkGetHighlightedActions({ actionUuids: actionOrderUuids, stmUuid: level3Uuid })
      );
      if (resHighlightActions.payload) {
        setIsActionHighlighted(resHighlightActions.payload);
      }
    },
    [actionOrderUuids, dispatch]
  );

  //reorder actions and save back to state.
  const reorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!actionOrderUuids) return;
      const actionOrder: string[] = _.clone(actionOrderUuids);
      const actionBeingMoved = actionOrder.splice(fromIndex, 1)[0]; //remove action uuid
      actionOrder.splice(toIndex, 0, actionBeingMoved); //reinsert in new position

      //save new action ordering
      setActionOrderUuids(actionOrder);
    },
    [actionOrderUuids, setActionOrderUuids]
  );

  // Unmarks newest list item as "new" after a short timeout (for autofocusing)
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
        parentType={parentType}
        highlightActions={highlightActions}
        actionsCalculatedFields={actionsCalculatedFields}
        actionIsInRunningRex={actionIsInRunningRex}
      />

      <div className={actionsStyles.actionListContainer}>
        <ActionsListHeadings
          editMode={editMode}
          parentType={parentType}
          editPerms={editPerms}
          actionIsInRunningRex={actionIsInRunningRex}
        />
        <div className={actionsStyles.dragableActionList}>
          <ReactDragListView onDragEnd={reorder} nodeSelector="li" handleSelector="a">
            <ActionList
              editMode={editMode}
              rexUuid={rexUuid}
              parentType={parentType}
              actionOrderUuids={actionOrderUuids}
              highlightActions={highlightActions}
              isActionHiglighted={isActionHiglighted}
              stations={useAppSelector((state) => state.station.stations, deepEqual)}
              pois={useAppSelector((state) => state.poi.pois, deepEqual)}
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
                  ? actionTemplates.find((t) => t.uuid === selectedTemplateUuid)
                  : null;
                setNewActionUuid(
                  (
                    await dispatch(
                      thunkCreateAction({
                        actionParentUuid,
                        actionOrderUuids,
                        setActionOrderUuids,
                        actionTemplate,
                      })
                    )
                  ).payload
                );
              }}
            />
            {actionSystemVersion === 1 && (
              <Dropdown
                selected={selectedTemplateUuid}
                onChange={(val) => {
                  setSelectedTemplateUuid(val);
                }}
                selectStyle={{ height: "2em", fontSize: "0.8em" }}
                containerStyle={{ maxWidth: "200px" }}
              >
                {actionTemplates?.map((template) => {
                  return (
                    <option key={template.uuid} value={template.uuid}>
                      {_.capitalize(template.type)}: {template.templateName}
                    </option>
                  );
                })}
                <option value="">{`<Template>`}</option>
              </Dropdown>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default Actions;

export const ActionsTopSection: FunctionComponent<{
  actionOrderUuids: string[];
  parentType: "poi" | "station" | "eva";
  highlightActions: (level3Uuid: string) => void;
  actionsCalculatedFields: ActionsCalculatedFields;
  actionIsInRunningRex: boolean;
}> = ({
  actionOrderUuids,
  parentType,
  highlightActions,
  actionsCalculatedFields,
  actionIsInRunningRex,
}) => {
  // make an array of uuids by action, of the STMs that are referenced by the action in the action STMPriorities object
  const stmUuidRefs = useAppSelector(
    (state) =>
      state.action.actions
        .filter((action) => actionOrderUuids?.includes(action.uuid))
        .map((action) => {
          if (action.enabled === false) return null;
          return getStmUuidRefs(action.stmPriorities);
        }),
    deepEqual
  );
  const actionSystemVersion = useAppSelector(
    (state) => state.mission.mission.actionSystemVersion,
    refEqual
  );

  const completedStmUuidRefs = useAppSelector((state) => {
    if (!actionIsInRunningRex) return null;
    const runningRex = state.rex.rexes.find((r) => r.isRunning);
    const stmUuidRefs: string[][] = [];
    for (const actionUuid in runningRex.actionEntries) {
      // check if this action is part of the current list (actionOrderUuids). this is to cover
      //    the case in which actions were statused, and then deleted.
      if (
        _.last(runningRex.actionEntries[actionUuid])?.rexStatus === "complete" &&
        actionOrderUuids.includes(actionUuid)
      ) {
        const action = state.action.actions.find((a) => a.uuid === actionUuid);
        if (action.enabled === false) return null;
        stmUuidRefs.push(getStmUuidRefs(action.stmPriorities));
      }
    }
    return stmUuidRefs;
  }, deepEqual);

  const inProgressStmUuidRefs = useAppSelector((state) => {
    if (!actionIsInRunningRex) return null;
    const runningRex = state.rex.rexes.find((r) => r.isRunning);
    const stmUuidRefs: string[][] = [];
    for (const actionUuid in runningRex.actionEntries) {
      // check if this action is part of the current list (actionOrderUuids). this is to cover
      //    the case in which actions were statused, and then deleted.
      if (
        _.last(runningRex.actionEntries[actionUuid])?.rexStatus === "in-progress" &&
        actionOrderUuids.includes(actionUuid)
      ) {
        const action = state.action.actions.find((a) => a.uuid === actionUuid);
        if (action.enabled === false) return null;
        stmUuidRefs.push(getStmUuidRefs(action.stmPriorities));
      }
    }
    return stmUuidRefs;
  }, deepEqual);

  // there's a difference between null and 0. Only calculate rex mass if it's 0. Null means it hasn't been executed yet.

  const rexMass = useAppSelector((state) => {
    if (!actionIsInRunningRex) return null;
    const runningRex = state.rex.rexes.find((r) => r.isRunning);
    let mass = null;
    // loop through all actions
    for (const actionUuid of actionOrderUuids) {
      const action = state.action.actions.find((a) => a.uuid === actionUuid);
      if (!action || !action.enabled || !action.mass) continue;
      if (!runningRex.actionEntries || !runningRex.actionEntries[actionUuid]) continue;
      if (_.isNull(_.last(runningRex.actionEntries[actionUuid]).mass)) continue; // this action has a non-null mass actual entry
      if (!_.isNull(mass)) {
        mass += _.last(runningRex.actionEntries[actionUuid]).mass;
      } else {
        mass = _.last(runningRex.actionEntries[actionUuid]).mass;
      }
    }
    return mass;
  }, refEqual);

  const rexMassDelta = useAppSelector((state) => {
    if (!actionIsInRunningRex || _.isNull(rexMass)) return null;
    let massPlanned = 0;
    // loop through all actions
    for (const actionUuid of actionOrderUuids) {
      const action = state.action.actions.find((a) => a.uuid === actionUuid);
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
              stmUuidRefs={stmUuidRefs}
              horizontal={true}
              onLevel3Hover={highlightActions}
              stmUuidRefsCompleted={completedStmUuidRefs}
              stmUuidRefsInProgress={inProgressStmUuidRefs}
            />
          </div>
        )}
        <div className={paneStyles.panelSectionRow} style={{ marginTop: "8px" }}>
          <div className={paneStyles.panelSection2Column}>
            <div className={paneStyles.panelColumnTable}>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.displayFieldLabel}>Number of Actions:</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldValue}>
                    {actionsCalculatedFields?.actionCount}
                  </div>
                </div>
              </div>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div
                    className={paneStyles.displayFieldLabel}
                    data-tooltip-id="aegis-tooltip"
                    data-tooltip-html="Sum of all action durations, nominal to max"
                  >
                    Total Action Time (mins):
                  </div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldValue}>
                    {actionsCalculatedFields?.totalActionTime.durationLower === 0 ? (
                      <>0</>
                    ) : (
                      <>{displayFormattedTotalTimeObj(actionsCalculatedFields?.totalActionTime)}</>
                    )}
                  </div>
                </div>
              </div>
              <div className={paneStyles.panelColumnTableRow}>
                <div className={paneStyles.panelColumnTableCellLeft}>
                  <div className={paneStyles.displayFieldLabel}>Total Planned Mass (g):</div>
                </div>
                <div className={paneStyles.panelColumnTableCell}>
                  <div className={paneStyles.displayFieldValue}>
                    {actionsCalculatedFields?.totalMass}
                  </div>
                </div>
              </div>
              {actionIsInRunningRex && (
                <>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
                      <div className={paneStyles.displayFieldLabel}>Total Executed Mass (g):</div>
                    </div>
                    <div className={paneStyles.panelColumnTableCell}>
                      <div className={`${paneStyles.displayFieldValue}`}>{rexMass}</div>
                    </div>
                  </div>
                  <div className={paneStyles.panelColumnTableRow}>
                    <div className={paneStyles.panelColumnTableCellLeft}>
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
              {parentType !== "poi" && (
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
  parentType: "poi" | "station" | "eva";
  editPerms: boolean;
  actionIsInRunningRex: boolean;
}> = ({ editMode, parentType, editPerms, actionIsInRunningRex }) => {
  const actionSystemVersion = useAppSelector(
    (state) => state.mission.mission.actionSystemVersion,
    refEqual
  );
  return (
    <div
      className={actionsStyles.actionListHeader}
      style={{
        marginLeft: actionSystemVersion === 2 ? "50px" : "",
        marginRight: editMode ? "20px" : "",
      }}
    >
      {actionIsInRunningRex && editPerms ? (
        <div className={actionsStyles.actionListHeaderRex} />
      ) : (
        <></>
      )}
      {actionSystemVersion === 1 && (
        <div className={actionsStyles.actionListHeaderType}>
          <div className={actionsStyles.actionListHeaderLabel}>Type</div>
        </div>
      )}
      <div className={actionsStyles.actionListHeaderTitle}>
        <div className={actionsStyles.actionListHeaderLabel}>Action</div>
      </div>
      <div className={actionsStyles.actionListHeaderTime}>
        <div className={actionsStyles.actionListHeaderLabel}>Max</div>
      </div>
      {parentType !== "poi" && (
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
  parentType: "poi" | "station" | "eva";
  highlightActions: (level3Uuid: string) => void;
  isActionHiglighted: ActionHighlight[];
  stations: Station[];
  pois: POI[];
  rexUuid: string;
  newActionUuid?: string;
}> = ({
  editMode,
  actionOrderUuids,
  parentType,
  isActionHiglighted,
  stations,
  pois,
  rexUuid,
  newActionUuid,
}) => {
  return (
    <ul className={actionsStyles.actionlist}>
      {actionOrderUuids?.map((actionUuid, index) => {
        const highlight = isActionHiglighted.find(
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
              {index + 1}
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
