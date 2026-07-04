import type { FunctionComponent } from "react";
import styles from "./stm-coverage.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { deepEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { getStmActionName } from "utils/component-helpers";
import { useStmCoverage } from "./stm-coverage-context";

/**
 * Side panel showing the per-rule breakdown of one clicked cell: match counts
 * against required counts, and the matching actions grouped by their station
 * or traverse. In diff mode the baseline's counts are shown alongside so
 * controllers can see where a difference comes from.
 */
const StmCoverageDrilldown: FunctionComponent = () => {
  const {
    mission,
    visibleColumns,
    coverageByColumnKey,
    baselineKey,
    diffMode,
    cellSelection,
    setCellSelection,
  } = useStmCoverage();
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

  const baselineCoverage =
    baselineKey && baselineKey !== column.key
      ? coverageByColumnKey[baselineKey]?.[cellSelection.stmUuid]
      : null;

  const scopeLabel = cellSelection.stationUuid
    ? mission?.stations?.[cellSelection.stationUuid]?.name
    : cellSelection.traversesOnly
      ? "Traverses"
      : null;

  const matchesScope = (action: Action | undefined): boolean => {
    if (!action) return false;
    if (cellSelection.stationUuid) return action.stationUuid === cellSelection.stationUuid;
    if (cellSelection.traversesOnly) return !!action.traverseUuid;
    return true;
  };

  return (
    <div className={styles.drilldown}>
      <div className={styles.drilldownHeader}>
        <div>
          <div className={styles.drilldownTitle}>{level3?.name}</div>
          <div className={styles.drilldownSubtitle}>
            {column.isRex ? `REX: ${column.label}` : column.label}
            {scopeLabel ? ` — ${scopeLabel}` : ""}
          </div>
        </div>
        <div className={styles.drilldownClose} onClick={() => setCellSelection(null)}>
          <FontAwesomeIcon icon={faXmark} />
        </div>
      </div>
      <div className={styles.drilldownContent}>
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
          />
        ))}
      </div>
    </div>
  );
};

export default StmCoverageDrilldown;

const DrilldownRule: FunctionComponent<{
  ruleCoverage: StmCoverageRule;
  rule: STMRule | undefined;
  baselineRuleCoverage: StmCoverageRule | null;
  matchesScope: (action: Action | undefined) => boolean;
}> = ({ ruleCoverage, rule, baselineRuleCoverage, matchesScope }) => {
  const { mission } = useStmCoverage();

  const scopedActions = ruleCoverage.matchingActionUuids
    .map((actionUuid) => mission?.actions?.[actionUuid])
    .filter((action) => matchesScope(action));

  return (
    <div className={styles.drilldownRule}>
      <div className={styles.drilldownRuleSentence}>
        {rule ? ruleSentence(rule, mission?.actionDefinitions) : "(deleted rule)"}
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
      {scopedActions.map((action) => (
        <div key={action.uuid} className={styles.drilldownActionRow}>
          <div className={styles.drilldownActionSequenceName}>
            {action.stationUuid
              ? mission?.stations?.[action.stationUuid]?.name
              : mission?.traverses?.[action.traverseUuid]?.name}
            :
          </div>
          <div>
            {mission?.actionDefinitions
              ? getStmActionName({
                  actionDefinition: action.actionDefinition,
                  missionActionDefs: mission.actionDefinitions,
                })
              : action.name}
          </div>
        </div>
      ))}
    </div>
  );
};

const ruleSetNames = (
  uuids: string[],
  any: boolean,
  items: ActionDefinitionItems | undefined
): string => {
  if (any) return "Any";
  const names = uuids.map((uuid) => items?.[uuid]?.name ?? "?");
  return names.length > 0 ? names.join(" or ") : "(none)";
};

const ruleSentence = (rule: STMRule, actionDefinitions: ActionDefinitions | null): string => {
  return `${rule.count} × ${ruleSetNames(rule.verbUuids, rule.verbAny, actionDefinitions?.verbs)} of ${ruleSetNames(rule.nounUuids, rule.nounAny, actionDefinitions?.nouns)} in ${ruleSetNames(rule.adjectiveUuids, rule.adjectiveAny, actionDefinitions?.adjectives)}`;
};
