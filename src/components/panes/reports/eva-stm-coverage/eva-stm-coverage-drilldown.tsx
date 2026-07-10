import type { FunctionComponent } from "react";
import styles from "../shared/report-grid.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  reportSetCellSelection,
  reportSetDrilldownWidth,
  reportToggleDrilldownChangesOnly,
} from "store/report";
import { diffRuleActions } from "utils/stmEvaCoverage";
import { actionBelongsToCampaignMember } from "utils/evaReportColumns";
import { Checkbox } from "components/interface/form/globalFields";
import ReportSidePanel from "../shared/report-side-panel";

const REPORT_ID: ColumnReportId = "stmCoverage";

/**
 * Side panel showing the per-rule breakdown of one clicked coverage cell: match
 * counts against required counts, and the matching actions grouped by their
 * station or traverse. In diff mode the cell's actions are diffed against the
 * baseline column's actions per rule (paired by verb/noun/adjective tuple,
 * station-agnostic): matched rows exist in both, "+" rows only in this cell,
 * "−" rows only in the baseline. A "Changes only" toggle hides matched rows.
 */
const EvaStmCoverageDrilldown: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const mission = useMissionDocSelector((m) => m, refEqual);
  const visibleColumns = useAppSelector(
    (state) => state.report[REPORT_ID].visibleColumns,
    shallowEqual
  );
  const coverageByColumnKey = useAppSelector(
    (state) => state.report[REPORT_ID].coverageByColumnKey,
    refEqual
  );
  const baselineKey = useAppSelector(
    (state) => state.report[REPORT_ID].resolvedBaselineKey,
    refEqual
  );
  const diffMode = useAppSelector((state) => state.report[REPORT_ID].diffMode, refEqual);
  const cellSelection = useAppSelector((state) => state.report[REPORT_ID].cellSelection, refEqual);
  const drilldownWidth = useAppSelector(
    (state) => state.report[REPORT_ID].drilldownWidth,
    refEqual
  );
  const changesOnly = useAppSelector(
    (state) => state.report[REPORT_ID].drilldownChangesOnly,
    refEqual
  );
  const level3 = useAppSelector(
    (state) => state.stm.level3s.find((item) => item.uuid === cellSelection?.stmUuid),
    shallowEqual
  );
  const rulesByUuid = useAppSelector((state) => {
    const byUuid: { [uuid: string]: STMRule } = {};
    for (const rule of state.stm.rules) byUuid[rule.uuid] = rule;
    return byUuid;
  }, deepEqual);

  if (!cellSelection) return null;
  const column = visibleColumns.find((c) => c.key === cellSelection.columnKey);
  const coverage = coverageByColumnKey[cellSelection.columnKey]?.[cellSelection.stmUuid];
  if (!column || !coverage) return null;

  const baselineColumn =
    baselineKey && baselineKey !== column.key
      ? visibleColumns.find((item) => item.key === baselineKey)
      : undefined;
  const baselineCoverage = baselineColumn
    ? coverageByColumnKey[baselineColumn.key]?.[cellSelection.stmUuid]
    : null;

  const diffActive = diffMode && !!baselineCoverage;
  const scoped =
    !!cellSelection.stationUuid || !!cellSelection.traverseUuid || !!cellSelection.evaUuid;

  const scopeLabel = cellSelection.stationUuid
    ? mission?.stations?.[cellSelection.stationUuid]?.name
    : cellSelection.traverseUuid
      ? mission?.traverses?.[cellSelection.traverseUuid]?.name
      : cellSelection.evaUuid
        ? mission?.evas?.[cellSelection.evaUuid]?.name
        : null;

  const matchesScope = (action: Action | undefined): boolean => {
    if (!action) return false;
    if (cellSelection.stationUuid) return action.stationUuid === cellSelection.stationUuid;
    if (cellSelection.traverseUuid) return action.traverseUuid === cellSelection.traverseUuid;
    if (cellSelection.evaUuid && mission) {
      return actionBelongsToCampaignMember({
        mission,
        column,
        memberEvaUuid: cellSelection.evaUuid,
        action,
      });
    }
    return true;
  };

  return (
    <ReportSidePanel
      width={drilldownWidth}
      onWidthChange={(width) => dispatch(reportSetDrilldownWidth({ reportId: REPORT_ID, width }))}
      onClose={() => dispatch(reportSetCellSelection({ reportId: REPORT_ID, selection: null }))}
      title={level3?.name}
      subtitle={`${column.isRex ? `REX: ${column.label}` : column.label}${
        scopeLabel ? ` — ${scopeLabel}` : ""
      }`}
    >
      {diffActive && (
        <Checkbox
          checked={changesOnly}
          editable={true}
          onChange={() => dispatch(reportToggleDrilldownChangesOnly({ reportId: REPORT_ID }))}
          toolTip="Hide actions that also match in the baseline; show only added (+) and baseline-only (−) actions"
          label="Changes only"
          uniqueId="eva-stm-coverage-drilldown-changes-only"
        />
      )}
      {coverage.status === "noRules" && <div>No rules defined for this item.</div>}
      {coverage.rules.map((ruleCoverage) => (
        <DrilldownRule
          key={ruleCoverage.ruleUuid}
          ruleCoverage={ruleCoverage}
          rule={rulesByUuid[ruleCoverage.ruleUuid]}
          baselineRuleCoverage={
            diffMode
              ? (baselineCoverage?.rules.find((rc) => rc.ruleUuid === ruleCoverage.ruleUuid) ??
                null)
              : null
          }
          matchesScope={matchesScope}
          diffActive={diffActive}
          changesOnly={changesOnly}
          scoped={scoped}
          column={column}
          baselineColumn={baselineColumn}
        />
      ))}
    </ReportSidePanel>
  );
};

export default EvaStmCoverageDrilldown;

const DrilldownRule: FunctionComponent<{
  ruleCoverage: StmCoverageRule;
  rule: STMRule | undefined;
  baselineRuleCoverage: StmCoverageRule | null;
  matchesScope: (action: Action | undefined) => boolean;
  diffActive: boolean;
  changesOnly: boolean;
  scoped: boolean;
  column: EvaReportColumn;
  baselineColumn: EvaReportColumn | undefined;
}> = ({
  ruleCoverage,
  rule,
  baselineRuleCoverage,
  matchesScope,
  diffActive,
  changesOnly,
  scoped,
  column,
  baselineColumn,
}) => {
  const mission = useMissionDocSelector((m) => m, refEqual);

  const scopedActions = ruleCoverage.matchingActionUuids
    .map((actionUuid) => mission?.actions?.[actionUuid])
    .filter((action): action is Action => matchesScope(action));

  // The baseline side is never scoped to the clicked station/traverse: baseline
  // columns are different EVAs whose stations have different uuids, so pairing
  // is always against the full baseline rule matches.
  const baselineActions = diffActive
    ? (baselineRuleCoverage?.matchingActionUuids ?? [])
        .map((actionUuid) => mission?.actions?.[actionUuid])
        .filter((action): action is Action => !!action)
    : [];
  const diff = diffActive
    ? diffRuleActions({ baselineActions, selectedActions: scopedActions })
    : null;
  // At single-station/traverse scope a "missing vs the whole baseline EVA" row
  // is misleading, so minus rows only render for whole-column selections.
  const removed = diff && !scoped ? diff.removed : [];
  const noChanges = diff && changesOnly && diff.added.length === 0 && removed.length === 0;
  const sortActions = (actions: Action[], actionColumn = column): Action[] =>
    [...actions].sort((a, b) =>
      getCampaignActionGroupLabel(mission, actionColumn, a).localeCompare(
        getCampaignActionGroupLabel(mission, actionColumn, b),
        undefined,
        { sensitivity: "base" }
      )
    );

  return (
    <div className={styles.drilldownRule}>
      <div className={styles.drilldownRuleSentence}>
        {rule ? (
          <RuleSentence rule={rule} actionDefinitions={mission?.actionDefinitions ?? null} />
        ) : (
          "(deleted rule)"
        )}
      </div>
      <div className={styles.drilldownRuleCounts}>
        <FontAwesomeIcon
          icon={ruleCoverage.satisfied ? faCheck : faXmark}
          className={
            ruleCoverage.satisfied ? styles.drilldownRuleSatisfied : styles.drilldownRuleUnsatisfied
          }
        />
        <div>
          {ruleCoverage.matchCount} of {ruleCoverage.required} required
        </div>
        {baselineRuleCoverage && (
          <div className={styles.drilldownBaselineNote}>
            (baseline: {baselineRuleCoverage.matchCount})
          </div>
        )}
      </div>
      {!diff &&
        sortActions(scopedActions).map((action) => (
          <DrilldownActionRow
            key={action.uuid}
            action={action}
            kind="matched"
            mission={mission}
            column={column}
          />
        ))}
      {diff && (
        <>
          {!changesOnly &&
            sortActions(diff.matched).map((action) => (
              <DrilldownActionRow
                key={`m-${action.uuid}`}
                action={action}
                kind="matched"
                showIndicator={true}
                mission={mission}
                column={column}
              />
            ))}
          {sortActions(diff.added).map((action) => (
            <DrilldownActionRow
              key={`p-${action.uuid}`}
              action={action}
              kind="plus"
              showIndicator={true}
              mission={mission}
              column={column}
            />
          ))}
          {removed.length > 0 && (
            <>
              <div className={styles.drilldownBaselineSectionLabel}>In baseline only:</div>
              {sortActions(removed, baselineColumn).map((action) => (
                <DrilldownActionRow
                  key={`b-${action.uuid}`}
                  action={action}
                  kind="minus"
                  showIndicator={true}
                  mission={mission}
                  column={baselineColumn ?? column}
                />
              ))}
            </>
          )}
          {noChanges && <div className={styles.drilldownBaselineNote}>(no changes)</div>}
        </>
      )}
    </div>
  );
};

const getCampaignActionGroupLabel = (
  mission: Mission | undefined,
  column: EvaReportColumn,
  action: Action
): string => {
  if (!mission || !column.campaignUuid) return "";
  const campaign = mission.reportCampaigns?.[column.campaignUuid];
  const memberEvaUuid = campaign?.memberEvaUuids.find((evaUuid) =>
    actionBelongsToCampaignMember({ mission, column, memberEvaUuid: evaUuid, action })
  );
  const memberName = memberEvaUuid ? mission.evas?.[memberEvaUuid]?.name : null;
  return memberName ? `${memberName} / ` : "";
};

const DIFF_INDICATORS = { matched: "", plus: "+", minus: "−" };
const DIFF_ROW_CLASSES = {
  matched: styles.drilldownActionRow,
  plus: `${styles.drilldownActionRow} ${styles.drilldownActionPlus}`,
  minus: `${styles.drilldownActionRow} ${styles.drilldownActionMinus}`,
};

/**
 * One action row of the drilldown. `kind` is "matched" outside diff mode or for
 * actions present in both columns; "plus" = only in the selected cell, "minus" =
 * only in the baseline (the station/traverse name shown is the baseline
 * action's own parent).
 */
const DrilldownActionRow: FunctionComponent<{
  action: Action;
  kind: "matched" | "plus" | "minus";
  showIndicator?: boolean;
  mission: Mission | undefined;
  column: EvaReportColumn;
}> = ({ action, kind, showIndicator = false, mission, column }) => {
  return (
    <div className={DIFF_ROW_CLASSES[kind]}>
      {showIndicator && (
        <div className={styles.drilldownDiffIndicator}>{DIFF_INDICATORS[kind]}</div>
      )}
      <div className={styles.drilldownActionSequenceName}>
        {getCampaignActionGroupLabel(mission, column, action)}
        {action.stationUuid
          ? mission?.stations?.[action.stationUuid]?.name
          : mission?.traverses?.[action.traverseUuid]?.name}
        :
      </div>
      <div>
        {mission?.actionDefinitions ? (
          <StmActionName
            actionDefinition={action.actionDefinition}
            missionActionDefs={mission.actionDefinitions}
          />
        ) : (
          action.name
        )}
      </div>
    </div>
  );
};

const StmActionName: FunctionComponent<{
  actionDefinition: ActionDefinition;
  missionActionDefs: ActionDefinitions;
}> = ({ actionDefinition, missionActionDefs }) => {
  const verbName = missionActionDefs.verbs[actionDefinition?.verbUuid]?.name ?? "Unknown";
  const nounName = missionActionDefs.nouns[actionDefinition?.nounUuid]?.name ?? "Unknown";
  const adjectiveName =
    missionActionDefs.adjectives[actionDefinition?.adjectiveUuid]?.name ?? "Unknown";
  return (
    <span>
      <span className={styles.drilldownRuleVerb}>{verbName}</span>
      {" of "}
      <span className={styles.drilldownRuleNoun}>{nounName}</span>
      {" in "}
      <span className={styles.drilldownRuleAdjective}>{adjectiveName}</span>
    </span>
  );
};

const ruleSetLabel = (
  uuids: string[],
  any: boolean,
  items: ActionDefinitionItems | undefined
): string => {
  if (any) return "Any";
  const names = uuids.map((uuid) => items?.[uuid]?.name ?? "?");
  return names.length > 0 ? names.join(" or ") : "(none)";
};

const RuleSentence: FunctionComponent<{
  rule: STMRule;
  actionDefinitions: ActionDefinitions | null;
}> = ({ rule, actionDefinitions }) => {
  return (
    <span>
      {rule.count}
      {" × "}
      <span className={styles.drilldownRuleVerb}>
        {ruleSetLabel(rule.verbUuids, rule.verbAny, actionDefinitions?.verbs)}
      </span>
      {" of "}
      <span className={styles.drilldownRuleNoun}>
        {ruleSetLabel(rule.nounUuids, rule.nounAny, actionDefinitions?.nouns)}
      </span>
      {" in "}
      <span className={styles.drilldownRuleAdjective}>
        {ruleSetLabel(rule.adjectiveUuids, rule.adjectiveAny, actionDefinitions?.adjectives)}
      </span>
    </span>
  );
};
