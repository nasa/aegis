import type { FunctionComponent } from "react";
import styles from "./stm-rules-coverage.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  stmCoverageSetCellSelection,
  stmCoverageSetDrilldownWidth,
  stmCoverageToggleDrilldownChangesOnly,
} from "store/stm";
import { diffRuleActions } from "utils/stmEvaCoverage";
import { actionBelongsToCampaignMember } from "utils/evaReportColumns";
import { Checkbox } from "components/interface/form/globalFields";

const DRILLDOWN_MIN_WIDTH = 220;
/** Grid width the drilldown can never squeeze past when dragged wide. */
const GRID_MIN_WIDTH = 300;

/**
 * Side panel showing the per-rule breakdown of one clicked cell: match counts
 * against required counts, and the matching actions grouped by their station
 * or traverse. In diff mode the cell's actions are diffed against the
 * baseline column's actions per rule (paired by verb/noun/adjective tuple,
 * station-agnostic): matched rows exist in both, "+" rows only in this cell,
 * "−" rows only in the baseline. A "Changes only" toggle hides matched rows.
 */
const StmCoverageDrilldown: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const mission = useMissionDocSelector((m) => m, refEqual);
  const visibleColumns = useAppSelector(
    (state) => state.stm.stmCoverageVisibleColumns,
    shallowEqual
  );
  const coverageByColumnKey = useAppSelector(
    (state) => state.stm.stmCoverageCoverageByColumnKey,
    refEqual
  );
  const baselineKey = useAppSelector((state) => state.stm.stmCoverageResolvedBaselineKey, refEqual);
  const diffMode = useAppSelector((state) => state.stm.stmCoverageDiffMode, refEqual);
  const cellSelection = useAppSelector((state) => state.stm.stmCoverageCellSelection, refEqual);
  const drilldownWidth = useAppSelector((state) => state.stm.stmCoverageDrilldownWidth, refEqual);
  const changesOnly = useAppSelector(
    (state) => state.stm.stmCoverageDrilldownChangesOnly,
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

  // Divider drag: pointer capture keeps move events flowing while the cursor
  // leaves the 6px handle; width is clamped so neither side can vanish.
  const onResizerPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const body = event.currentTarget.parentElement;
    if (!body) return;
    const bodyRect = body.getBoundingClientRect();
    const maxWidth = Math.max(bodyRect.width - GRID_MIN_WIDTH, DRILLDOWN_MIN_WIDTH);
    const width = Math.min(Math.max(bodyRect.right - event.clientX, DRILLDOWN_MIN_WIDTH), maxWidth);
    if (width !== drilldownWidth) dispatch(stmCoverageSetDrilldownWidth(Math.round(width)));
  };

  return (
    <>
      <div
        className={styles.drilldownResizer}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={onResizerPointerMove}
      />
      <div className={styles.drilldown} style={{ width: drilldownWidth }}>
        <div className={styles.drilldownHeader}>
          <div>
            <div className={styles.drilldownTitle}>{level3?.name}</div>
            <div className={styles.drilldownSubtitle}>
              {column.isRex ? `REX: ${column.label}` : column.label}
              {scopeLabel ? ` — ${scopeLabel}` : ""}
            </div>
          </div>
          <div
            className={styles.drilldownClose}
            onClick={() => dispatch(stmCoverageSetCellSelection(null))}
          >
            <FontAwesomeIcon icon={faXmark} />
          </div>
        </div>
        <div className={styles.drilldownContent}>
          {diffActive && (
            <Checkbox
              checked={changesOnly}
              editable={true}
              onChange={() => dispatch(stmCoverageToggleDrilldownChangesOnly())}
              toolTip="Hide actions that also match in the baseline; show only added (+) and baseline-only (−) actions"
              label="Changes only"
              uniqueId="stm-coverage-drilldown-changes-only"
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
        </div>
      </div>
    </>
  );
};

export default StmCoverageDrilldown;

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
 * One action row of the drilldown. `kind` is "matched" outside diff mode or
 * for actions present in both columns; "plus" = only in the selected cell,
 * "minus" = only in the baseline (the station/traverse name shown is the
 * baseline action's own parent).
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
