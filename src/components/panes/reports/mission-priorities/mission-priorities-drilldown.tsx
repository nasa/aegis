import type { FunctionComponent } from "react";
import { useState } from "react";
import styles from "../shared/report-grid.module.css";
import priorityStyles from "./mission-priorities.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  reportSetCellSelection,
  reportSetDrilldownWidth,
  reportToggleDrilldownChangesOnly,
} from "store/report";
import {
  actionBelongsToCampaignMember,
  getActionRexStatus,
  resolveCampaignExecutionRexes,
} from "utils/evaReportColumns";
import { selectEvaStations, selectEvaTraverses } from "store/selectors";
import {
  diffPriorityActions,
  explainMissingBaselineAction,
  getActionLineagePriorityMismatch,
  getPriorityActionLocationLabel,
} from "utils/missionPriorityReport";
import { Checkbox } from "components/interface/form/globalFields";
import ReportSidePanel from "../shared/report-side-panel";
import ReportActionTitle from "../shared/report-action-title";
import ActionPreview, { type ActionPreviewTarget } from "../shared/action-preview";
import { PRIORITY_STATUS_LABEL } from "./mission-priorities-cell";

const REPORT_ID: ColumnReportId = "missionPriorities";

const REX_STATUS_BADGE_LABEL: Record<RexStatus, string> = {
  complete: "Completed",
  "in-progress": "In progress",
  pending: "Pending",
  skipped: "Skipped",
};

const REX_STATUS_BADGE_CLASS: Record<RexStatus, string> = {
  complete: priorityStyles.statusComplete,
  "in-progress": priorityStyles.statusInProgress,
  pending: priorityStyles.statusPending,
  skipped: priorityStyles.statusSkipped,
};

const findRexForActionInColumn = (
  mission: Mission,
  column: EvaReportColumn | undefined,
  action: Action
): Rex | undefined => {
  if (!column) return undefined;
  if (column.kind === "rex" && column.rexUuid) {
    return mission.rexes?.[column.rexUuid];
  }
  if (column.kind === "campaignExecuted" && column.campaignUuid) {
    const campaign = mission.reportCampaigns?.[column.campaignUuid];
    if (!campaign) return undefined;
    for (const rex of resolveCampaignExecutionRexes(mission, campaign)) {
      const stationUuids = new Set(selectEvaStations(mission, rex.evaUuid).map((s) => s.uuid));
      const traverseUuids = new Set(selectEvaTraverses(mission, rex.evaUuid).map((t) => t.uuid));
      if (
        (!!action.stationUuid && stationUuids.has(action.stationUuid)) ||
        (!!action.traverseUuid && traverseUuids.has(action.traverseUuid))
      ) {
        return rex;
      }
    }
  }
  return undefined;
};

const findEvaUuidForActionInColumn = (
  mission: Mission,
  column: EvaReportColumn | undefined,
  action: Action
): string | undefined => {
  if (!column) return undefined;
  if (column.evaUuid) return column.evaUuid;
  if (column.campaignUuid) {
    const campaign = mission.reportCampaigns?.[column.campaignUuid];
    const memberEvaUuid = campaign?.memberEvaUuids.find((evaUuid) =>
      actionBelongsToCampaignMember({ mission, column, memberEvaUuid: evaUuid, action })
    );
    if (column.kind === "campaignExecuted") {
      const rex = findRexForActionInColumn(mission, column, action);
      return rex?.evaUuid ?? memberEvaUuid;
    }
    return memberEvaUuid;
  }
  return undefined;
};

const MissionPrioritiesDrilldown: FunctionComponent<{
  unscheduledByPriorityUuid: { [priorityUuid: string]: MissionPriorityUnscheduledUsage };
}> = ({ unscheduledByPriorityUuid }) => {
  const dispatch = useAppDispatch();
  const [preview, setPreview] = useState<ActionPreviewTarget | null>(null);
  const mission = useMissionDocSelector((m) => m, refEqual);
  const visibleColumns = useAppSelector(
    (state) => state.report[REPORT_ID].visibleColumns,
    shallowEqual
  );
  const coverageByColumnKey = useAppSelector(
    (state) => state.report[REPORT_ID].priorityCoverageByColumnKey,
    refEqual
  );
  const baselineKey = useAppSelector(
    (state) => state.report[REPORT_ID].resolvedBaselineKey,
    refEqual
  );
  const diffMode = useAppSelector((state) => state.report[REPORT_ID].diffMode, refEqual);
  const includeDisabledActions = useAppSelector(
    (state) => state.report[REPORT_ID].includeDisabledActions ?? true,
    refEqual
  );
  const cellSelection = useAppSelector((state) => state.report[REPORT_ID].cellSelection, refEqual);
  const drilldownWidth = useAppSelector(
    (state) => state.report[REPORT_ID].drilldownWidth,
    refEqual
  );
  const changesOnly = useAppSelector(
    (state) => state.report[REPORT_ID].drilldownChangesOnly,
    refEqual
  );

  if (!cellSelection || !mission) return null;
  const priorityUuid = cellSelection.priorityUuid ?? cellSelection.stmUuid;
  const priority = mission.missionPriorities?.[priorityUuid];
  if (!priority) return null;

  const column = visibleColumns.find((c) => c.key === cellSelection.columnKey);
  const coverage = column ? coverageByColumnKey?.[column.key]?.[priorityUuid] : undefined;

  const baselineColumn =
    column && baselineKey && baselineKey !== column.key
      ? visibleColumns.find((item) => item.key === baselineKey)
      : undefined;
  const baselineCoverage = baselineColumn
    ? coverageByColumnKey?.[baselineColumn.key]?.[priorityUuid]
    : null;

  const diffActive = diffMode && !!column && !!baselineCoverage;
  const scoped =
    !!cellSelection.stationUuid || !!cellSelection.traverseUuid || !!cellSelection.evaUuid;

  const scopeLabel = cellSelection.stationUuid
    ? mission.stations?.[cellSelection.stationUuid]?.name
    : cellSelection.traverseUuid
      ? mission.traverses?.[cellSelection.traverseUuid]?.name
      : cellSelection.evaUuid
        ? mission.evas?.[cellSelection.evaUuid]?.name
        : null;

  const matchesScope = (action: Action | undefined): boolean => {
    if (!action) return false;
    if (cellSelection.stationUuid) return action.stationUuid === cellSelection.stationUuid;
    if (cellSelection.traverseUuid) return action.traverseUuid === cellSelection.traverseUuid;
    if (cellSelection.evaUuid && column) {
      return actionBelongsToCampaignMember({
        mission,
        column,
        memberEvaUuid: cellSelection.evaUuid,
        action,
      });
    }
    return true;
  };

  const resolveUniqueScopedActions = (actionUuids: string[]): Action[] => {
    const seen = new Set<string>();
    const actions: Action[] = [];
    for (const uuid of actionUuids) {
      if (seen.has(uuid)) continue;
      const action = mission.actions?.[uuid];
      if (matchesScope(action)) {
        seen.add(uuid);
        actions.push(action!);
      }
    }
    return actions;
  };

  const activeActions = coverage ? resolveUniqueScopedActions(coverage.activeActionUuids) : [];
  const disabledActions =
    coverage && includeDisabledActions
      ? resolveUniqueScopedActions(coverage.disabledActionUuids)
      : [];
  const excludedRexActions = coverage
    ? resolveUniqueScopedActions(coverage.excludedRexActionUuids)
    : [];

  const baselineActions =
    diffActive && baselineCoverage
      ? [...new Set(baselineCoverage.activeActionUuids)]
          .map((uuid) => mission.actions?.[uuid])
          .filter((a): a is Action => !!a)
      : [];

  const diff = diffActive
    ? diffPriorityActions({ baselineActions, selectedActions: activeActions })
    : null;
  const removed = diff && !scoped ? diff.removed : [];

  const sortActions = (actions: Action[], targetCol = column): Action[] =>
    [...actions].sort((a, b) =>
      getPriorityActionLocationLabel(mission, targetCol, a).localeCompare(
        getPriorityActionLocationLabel(mission, targetCol, b),
        undefined,
        { sensitivity: "base" }
      )
    );

  const columnTitle = column
    ? column.isRex
      ? `REX: ${column.label}`
      : column.campaignUuid
        ? `${column.groupLabel}: ${column.label}`
        : column.label
    : "Mission-wide usages";

  const unscheduled = unscheduledByPriorityUuid[priorityUuid];
  const parentUuidsWithCopies = new Set(
    Object.values(mission.actions ?? {})
      .filter((a) => a.parentActionUuid && (a.stationUuid || a.traverseUuid))
      .map((a) => a.parentActionUuid!)
  );

  return (
    <ReportSidePanel
      width={drilldownWidth}
      onWidthChange={(width) => dispatch(reportSetDrilldownWidth({ reportId: REPORT_ID, width }))}
      onClose={() => dispatch(reportSetCellSelection({ reportId: REPORT_ID, selection: null }))}
      title={`${priority.trace} — ${priority.category}`}
      subtitle={`${columnTitle}${scopeLabel ? ` — ${scopeLabel}` : ""}`}
    >
      {diffActive && (
        <Checkbox
          checked={changesOnly}
          editable={true}
          onChange={() => dispatch(reportToggleDrilldownChangesOnly({ reportId: REPORT_ID }))}
          toolTip="Hide actions that also match in the baseline; show only added (+) and baseline-only (−) actions"
          label="Changes only"
          uniqueId="mission-priorities-drilldown-changes-only"
        />
      )}

      {column && coverage && (
        <div className={priorityStyles.drilldownSection}>
          <div className={priorityStyles.drilldownSectionHeader}>
            <span>In {columnTitle}</span>
            <span>
              {coverage.activeCount} active (
              {
                PRIORITY_STATUS_LABEL[
                  !includeDisabledActions && coverage.status === "disabledOnly"
                    ? "none"
                    : coverage.status
                ]
              }
              )
            </span>
          </div>

          {!diff && activeActions.length === 0 && disabledActions.length === 0 && (
            <div className={styles.drilldownBaselineNote}>
              No actions with this priority in this {scoped ? "selection" : "column"}.
            </div>
          )}

          {!diff &&
            sortActions(activeActions).map((action) => (
              <DrilldownPriorityActionCard
                key={action.uuid}
                action={action}
                kind="matched"
                mission={mission}
                column={column}
                priorityUuid={priorityUuid}
                onPreview={setPreview}
              />
            ))}

          {diff && (
            <>
              {!changesOnly &&
                sortActions(diff.matched).map((action) => (
                  <DrilldownPriorityActionCard
                    key={`m-${action.uuid}`}
                    action={action}
                    kind="matched"
                    showIndicator={true}
                    mission={mission}
                    column={column}
                    priorityUuid={priorityUuid}
                    onPreview={setPreview}
                  />
                ))}
              {sortActions(diff.added).map((action) => (
                <DrilldownPriorityActionCard
                  key={`p-${action.uuid}`}
                  action={action}
                  kind="plus"
                  showIndicator={true}
                  mission={mission}
                  column={column}
                  priorityUuid={priorityUuid}
                  onPreview={setPreview}
                />
              ))}
              {removed.length > 0 && (
                <>
                  <div className={styles.drilldownBaselineSectionLabel}>In baseline only:</div>
                  {sortActions(removed, baselineColumn).map((action) => (
                    <DrilldownPriorityActionCard
                      key={`b-${action.uuid}`}
                      action={action}
                      kind="minus"
                      showIndicator={true}
                      mission={mission}
                      column={baselineColumn ?? column}
                      targetColumnForExplanation={column}
                      priorityUuid={priorityUuid}
                      onPreview={setPreview}
                    />
                  ))}
                </>
              )}
              {changesOnly && diff.added.length === 0 && removed.length === 0 && (
                <div className={styles.drilldownBaselineNote}>(no changes)</div>
              )}
            </>
          )}

          {excludedRexActions.length > 0 && (
            <>
              <div className={priorityStyles.drilldownSubheading}>
                Excluded by REX filter ({excludedRexActions.length})
              </div>
              {sortActions(excludedRexActions).map((action) => (
                <DrilldownPriorityActionCard
                  key={`ex-${action.uuid}`}
                  action={action}
                  kind="matched"
                  mission={mission}
                  column={column}
                  priorityUuid={priorityUuid}
                  onPreview={setPreview}
                />
              ))}
            </>
          )}

          {disabledActions.length > 0 && (
            <>
              <div className={priorityStyles.drilldownSubheading}>
                Disabled in this EVA/REX ({disabledActions.length})
              </div>
              {sortActions(disabledActions).map((action) => (
                <DrilldownPriorityActionCard
                  key={`dis-${action.uuid}`}
                  action={action}
                  kind="matched"
                  mission={mission}
                  column={column}
                  priorityUuid={priorityUuid}
                  onPreview={setPreview}
                />
              ))}
            </>
          )}
        </div>
      )}

      {unscheduled &&
        (unscheduled.poiActionUuids.length > 0 ||
          unscheduled.unassignedLocationActionUuids.length > 0 ||
          unscheduled.actionTemplateUuids.length > 0) && (
          <div className={priorityStyles.drilldownSection}>
            <div className={priorityStyles.drilldownSectionHeader}>
              <span>Other Usages in Mission</span>
            </div>

            {unscheduled.poiActionUuids.length > 0 && (
              <>
                <div className={priorityStyles.drilldownSubheading}>
                  POI Actions ({unscheduled.poiActionUuids.length})
                </div>
                {unscheduled.poiActionUuids.map((actionUuid) => {
                  const poiAction = mission.actions?.[actionUuid];
                  if (!poiAction) return null;
                  const poiName = poiAction.poiUuid
                    ? (mission.pois?.[poiAction.poiUuid]?.name ?? "POI")
                    : "POI";
                  const adopted = parentUuidsWithCopies.has(actionUuid);
                  return (
                    <div key={actionUuid} className={priorityStyles.drilldownActionItem}>
                      <div className={priorityStyles.drilldownActionMain}>
                        <div className={priorityStyles.drilldownActionTitleWrap}>
                          <span className={styles.drilldownActionSequenceName}>
                            POI {poiName}:{" "}
                          </span>
                          <ReportActionTitle action={poiAction} mission={mission} />
                        </div>
                        <button
                          type="button"
                          className={priorityStyles.previewButton}
                          aria-haspopup="dialog"
                          onClick={() => setPreview({ actionUuid })}
                        >
                          Preview
                        </button>
                      </div>
                      <div className={priorityStyles.drilldownActionMeta}>
                        <span>
                          {adopted ? "Adopted into station(s)" : "Not adopted into any station"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {unscheduled.unassignedLocationActionUuids.length > 0 && (
              <>
                <div className={priorityStyles.drilldownSubheading}>
                  Unscheduled Stations / Traverses (
                  {unscheduled.unassignedLocationActionUuids.length})
                </div>
                {unscheduled.unassignedLocationActionUuids.map((actionUuid) => {
                  const action = mission.actions?.[actionUuid];
                  if (!action) return null;
                  const locName = action.stationUuid
                    ? mission.stations?.[action.stationUuid]?.name
                    : action.traverseUuid
                      ? mission.traverses?.[action.traverseUuid]?.name
                      : "Location";
                  return (
                    <div key={actionUuid} className={priorityStyles.drilldownActionItem}>
                      <div className={priorityStyles.drilldownActionMain}>
                        <div className={priorityStyles.drilldownActionTitleWrap}>
                          <span className={styles.drilldownActionSequenceName}>{locName}: </span>
                          <ReportActionTitle action={action} mission={mission} />
                        </div>
                        <button
                          type="button"
                          className={priorityStyles.previewButton}
                          aria-haspopup="dialog"
                          onClick={() => setPreview({ actionUuid })}
                        >
                          Preview
                        </button>
                      </div>
                      {!action.enabled && (
                        <div className={priorityStyles.drilldownActionMeta}>
                          <span
                            className={`${priorityStyles.statusBadge} ${priorityStyles.statusDisabled}`}
                          >
                            Disabled
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {unscheduled.actionTemplateUuids.length > 0 && (
              <>
                <div className={priorityStyles.drilldownSubheading}>
                  Action Templates ({unscheduled.actionTemplateUuids.length})
                </div>
                {unscheduled.actionTemplateUuids.map((templateUuid) => {
                  const template = mission.actionTemplates?.[templateUuid];
                  if (!template) return null;
                  return (
                    <div key={templateUuid} className={priorityStyles.drilldownActionItem}>
                      <div className={priorityStyles.drilldownActionMain}>
                        <div className={priorityStyles.drilldownActionTitleWrap}>
                          <span className={styles.drilldownActionSequenceName}>Template: </span>
                          {template.templateName || template.name || "Unnamed template"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

      {preview && (
        <ActionPreview mission={mission} target={preview} onClose={() => setPreview(null)} />
      )}
    </ReportSidePanel>
  );
};

export default MissionPrioritiesDrilldown;

const DIFF_INDICATORS = { matched: "", plus: "+", minus: "−" };
const DIFF_ROW_CLASSES = {
  matched: priorityStyles.drilldownActionItem,
  plus: `${priorityStyles.drilldownActionItem} ${styles.drilldownActionPlus}`,
  minus: `${priorityStyles.drilldownActionItem} ${styles.drilldownActionMinus}`,
};

const DrilldownPriorityActionCard: FunctionComponent<{
  action: Action;
  kind: "matched" | "plus" | "minus";
  showIndicator?: boolean;
  mission: Mission;
  column: EvaReportColumn;
  targetColumnForExplanation?: EvaReportColumn;
  priorityUuid: string;
  onPreview: (target: ActionPreviewTarget) => void;
}> = ({
  action,
  kind,
  showIndicator = false,
  mission,
  column,
  targetColumnForExplanation,
  priorityUuid,
  onPreview,
}) => {
  const rex = findRexForActionInColumn(mission, column, action);
  const evaUuid = findEvaUuidForActionInColumn(mission, column, action);
  const rexStatus = rex && action.enabled ? getActionRexStatus(rex, action.uuid) : null;
  const locationLabel = getPriorityActionLocationLabel(mission, column, action);
  const lineageMismatch = getActionLineagePriorityMismatch(action, mission);
  const missingExplanation =
    kind === "minus" && targetColumnForExplanation
      ? explainMissingBaselineAction({
          mission,
          baselineAction: action,
          targetColumn: targetColumnForExplanation,
          priorityUuid,
        })
      : null;

  return (
    <div className={DIFF_ROW_CLASSES[kind]}>
      <div className={priorityStyles.drilldownActionMain}>
        <div className={priorityStyles.drilldownActionTitleWrap}>
          {showIndicator && DIFF_INDICATORS[kind] && (
            <span className={styles.drilldownDiffIndicator}>{DIFF_INDICATORS[kind]} </span>
          )}
          <span className={styles.drilldownActionSequenceName}>{locationLabel}: </span>
          <ReportActionTitle action={action} mission={mission} />
        </div>
        <button
          type="button"
          className={priorityStyles.previewButton}
          aria-haspopup="dialog"
          onClick={() =>
            onPreview({
              actionUuid: action.uuid,
              evaUuid,
              rexUuid: rex?.uuid,
            })
          }
        >
          Preview
        </button>
      </div>
      {(rexStatus || !action.enabled || lineageMismatch || missingExplanation) && (
        <div className={priorityStyles.drilldownActionMeta}>
          {rexStatus && (
            <span className={`${priorityStyles.statusBadge} ${REX_STATUS_BADGE_CLASS[rexStatus]}`}>
              {REX_STATUS_BADGE_LABEL[rexStatus]}
            </span>
          )}
          {!action.enabled && (
            <span className={`${priorityStyles.statusBadge} ${priorityStyles.statusDisabled}`}>
              Disabled
            </span>
          )}
          {lineageMismatch && (
            <span className={priorityStyles.lineageNote}>
              Inherited from POI {lineageMismatch.poiName} (priority changed from{" "}
              {lineageMismatch.poiPriorityTrace ?? "none"} to{" "}
              {lineageMismatch.currentPriorityTrace ?? "none"})
            </span>
          )}
          {missingExplanation && (
            <span className={priorityStyles.missingReasonNote}>{missingExplanation}</span>
          )}
        </div>
      )}
    </div>
  );
};
