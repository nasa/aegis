import type { FunctionComponent } from "react";
import actionStyles from "components/panes/actions-action.module.css";
import styles from "./report-grid.module.css";

/** Read-only action title with the app's STM colors and mission priority badge. */
const ReportActionTitle: FunctionComponent<{
  action: Action | undefined;
  mission: Mission;
  fallbackName?: string;
}> = ({ action, mission, fallbackName }) => {
  if (
    mission.actionSystemVersion !== 2 ||
    !action?.stmAction ||
    !action.actionDefinition ||
    !mission.actionDefinitions
  ) {
    return <>{action?.name || fallbackName || "Unnamed action"}</>;
  }

  const { verbUuid, nounUuid, adjectiveUuid } = action.actionDefinition;
  const definitions = mission.actionDefinitions;
  const labels = mission.actionDefinitionLabels;
  const conjunctions = mission.actionDefinitionConjunctions;
  const adjective = definitions.adjectives[adjectiveUuid]?.name;
  // Older POI actions encode mission priorities in the adjective slot, using
  // "Pri" as the conjunction or "Priority" as the definition label.
  const priorityLabel = /^(?:pri\.?|priority|mission priority)$/i;
  const priorityPrefix = /^(?:pri\.?|priority|mission priority)\s*:?\s+/i;
  const adjectiveIsPriority =
    !!adjective &&
    (priorityLabel.test(conjunctions.nounToAdjective.trim()) ||
      priorityLabel.test(labels.adjective.singular.trim()) ||
      priorityPrefix.test(adjective));
  const referencedPriority = action.missionPriorityUuid
    ? mission.missionPriorities?.[action.missionPriorityUuid]
    : null;
  const priority =
    referencedPriority ??
    (adjectiveIsPriority
      ? { trace: adjective.replace(priorityPrefix, "").trim(), category: "" }
      : null);

  return (
    <span>
      <span className={styles.drilldownRuleVerb}>
        {definitions.verbs[verbUuid]?.name || labels.verb.singular}
      </span>
      {` ${conjunctions.verbToNoun} `}
      <span className={styles.drilldownRuleNoun}>
        {definitions.nouns[nounUuid]?.name || labels.noun.singular}
      </span>
      {adjective && !adjectiveIsPriority && (
        <>
          {` ${conjunctions.nounToAdjective} `}
          <span className={styles.drilldownRuleAdjective}>{adjective}</span>
        </>
      )}
      {priority?.trace && (
        <span
          className={actionStyles.actionHeadingPriority}
          aria-label={`Mission priority: ${priority.trace}`}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-content={`Mission priority: ${priority.trace}${
            priority.category ? ` | ${priority.category}` : ""
          }`}
        >
          {priority.trace}
        </span>
      )}
    </span>
  );
};

export default ReportActionTitle;
