import type { FunctionComponent } from "react";
import styles from "./stm-coverage.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";
import { stmCoverageSetCellSelection, stmCoverageSetDrilldownWidth } from "store/stm";

const DRILLDOWN_MIN_WIDTH = 220;
/** Grid width the drilldown can never squeeze past when dragged wide. */
const GRID_MIN_WIDTH = 300;

/**
 * Side panel showing the per-rule breakdown of one clicked cell: match counts
 * against required counts, and the matching actions grouped by their station
 * or traverse. In diff mode the baseline's counts are shown alongside so
 * controllers can see where a difference comes from.
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
    : cellSelection.traverseUuid
      ? mission?.traverses?.[cellSelection.traverseUuid]?.name
      : null;

  const matchesScope = (action: Action | undefined): boolean => {
    if (!action) return false;
    if (cellSelection.stationUuid) return action.stationUuid === cellSelection.stationUuid;
    if (cellSelection.traverseUuid) return action.traverseUuid === cellSelection.traverseUuid;
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
    </>
  );
};

export default StmCoverageDrilldown;

const DrilldownRule: FunctionComponent<{
  ruleCoverage: StmCoverageRule;
  rule: STMRule | undefined;
  baselineRuleCoverage: StmCoverageRule | null;
  matchesScope: (action: Action | undefined) => boolean;
}> = ({ ruleCoverage, rule, baselineRuleCoverage, matchesScope }) => {
  const mission = useMissionDocSelector((m) => m, refEqual);

  const scopedActions = ruleCoverage.matchingActionUuids
    .map((actionUuid) => mission?.actions?.[actionUuid])
    .filter((action) => matchesScope(action));

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
      {scopedActions.map((action) => (
        <div key={action.uuid} className={styles.drilldownActionRow}>
          <div className={styles.drilldownActionSequenceName}>
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
      ))}
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
