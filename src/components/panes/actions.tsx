import { FunctionComponent, useCallback, useEffect, useState } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionsStyles from "./actions.module.css";
import { Button, Dropdown } from "components/interface/form/globalFields";
import Action from "./actions-action";
import _, { clone } from "lodash";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import ReactDragListView from "react-drag-listview";
import { STM_Coverage } from "./stm/stm-coverage";
import { displayFormattedTotalTimeObj } from "utils/component-helpers";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkCreateAction, thunkGetHighlightedActions } from "store/thunk/thunkAction";
import CalculatedDwell from "./calculated-dwell";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { Assoc_POIs } from "./actions-assocpois";
import { getStmUuidRefs } from "utils/store";

const Actions: FunctionComponent<{
  editMode: boolean;
  setEditMode: (newEditMode: boolean) => void;
  actionOrderUuids: string[];
  setActionOrderUuids: (actionOrderUuids: string[]) => void;
  actionParentUuid: Pick<Action, "poiUuid" | "stationUuid">;
  parentType: "poi" | "station" | "eva";
  actionsCalculatedFields: ActionsCalculatedFields;
  isRexRunning: boolean;
}> = ({
  editMode,
  actionOrderUuids,
  setActionOrderUuids,
  actionParentUuid,
  parentType,
  actionsCalculatedFields,
  isRexRunning,
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
      const actionOrder: string[] = clone(actionOrderUuids);
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
      />
      {actionOrderUuids?.length > 0 && (
        <ActionsListHeadings
          editMode={editMode}
          parentType={parentType}
          editPerms={editPerms}
          isRexRunning={isRexRunning}
        />
      )}
      <div className={actionsStyles.actionListContainer}>
        <div className={actionsStyles.dragableActionList}>
          <ReactDragListView onDragEnd={reorder} nodeSelector="li" handleSelector="a">
            <ActionList
              editMode={editMode}
              isRexRunning={isRexRunning}
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
}> = ({ actionOrderUuids, parentType, highlightActions, actionsCalculatedFields }) => {
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

  const completedStmUuidRefs = useAppSelector((state) => {
    const runningRex = state.rex.rexes.find((r) => r.isRunning);
    if (!runningRex) return null;
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
    const runningRex = state.rex.rexes.find((r) => r.isRunning);
    if (!runningRex) return null;
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

  return (
    <div className={paneStyles.panelContainer}>
      <div className={paneStyles.panelSection}>
        <div className={actionsStyles.stmCoverage}>
          <STM_Coverage
            stmUuidRefs={stmUuidRefs}
            mini={true}
            horizontal={true}
            onLevel3Hover={highlightActions}
            stmUuidRefsCompleted={completedStmUuidRefs}
            stmUuidRefsInProgress={inProgressStmUuidRefs}
          />
        </div>
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
  isRexRunning: boolean;
}> = ({ editMode, parentType, editPerms, isRexRunning }) => {
  return (
    <>
      {!editMode && (
        <div className={actionsStyles.actionListHeader}>
          {isRexRunning && editPerms ? (
            <div className={actionsStyles.actionListHeaderRex} />
          ) : (
            <></>
          )}
          <div className={actionsStyles.actionListHeaderType}>
            <div className={actionsStyles.actionListHeaderLabel}>Type</div>
          </div>
          <div className={actionsStyles.actionListHeaderTitle}>
            <div className={actionsStyles.actionListHeaderLabel}>Title</div>
          </div>
          <div className={actionsStyles.actionListHeaderPriority}>
            <div className={actionsStyles.actionListHeaderLabel}>Pri</div>
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
      )}
    </>
  );
};

export const ActionList: FunctionComponent<{
  editMode: boolean;
  actionOrderUuids: string[];
  highlightActions: (level3Uuid: string) => void;
  isActionHiglighted: ActionHighlight[];
  stations: Station[];
  pois: POI[];
  isRexRunning: boolean;
  newActionUuid?: string;
}> = ({
  editMode,
  actionOrderUuids,
  isActionHiglighted,
  stations,
  pois,
  isRexRunning,
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
            <div className={actionsStyles.actionlistitemOrdinal}>{index + 1}</div>
            <Action
              editMode={editMode}
              actionUuid={actionUuid}
              highlight={highlight}
              parentType="eva"
              parentLocation={parentLocation}
              parentElevation={parentElevation}
              isRexRunning={isRexRunning}
              toFocus={newActionUuid === actionUuid}
            />
          </li>
        );
      })}
    </ul>
  );
};
