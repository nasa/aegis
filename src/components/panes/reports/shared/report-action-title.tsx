import type { FunctionComponent } from "react";
import actionStyles from "components/panes/actions-action.module.css";
import { resolveActionMissionPriority } from "utils/missionPriorityReport";
import styles from "./report-grid.module.css";

/** Read-only action title with the app's STM colors and mission priority badge. */
const ReportActionTitle: FunctionComponent<{
  action: Action | undefined;
  mission: Mission;
  fallbackName?: string;
}> = ({ action, mission, fallbackName }) => {
  if (mission.actionSystemVersion !== 2 || !action) {
    return <>{action?.name || fallbackName || "Unnamed action"}</>;
  }

  const priority = resolveActionMissionPriority(action, mission);

  if (!action.stmAction || !action.actionDefinition || !mission.actionDefinitions) {
    return (
      <span>
        {action.name || fallbackName || "Unnamed action"}
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
  }

  const { verbUuid, nounUuid, adjectiveUuid } = action.actionDefinition;
  const definitions = mission.actionDefinitions;
  const labels = mission.actionDefinitionLabels;
  const conjunctions = mission.actionDefinitionConjunctions;
  const adjective = definitions.adjectives[adjectiveUuid]?.name;

  return (
    <span>
      <span className={styles.drilldownRuleVerb}>
        {definitions.verbs[verbUuid]?.name || labels.verb.singular}
      </span>
      {` ${conjunctions.verbToNoun} `}
      <span className={styles.drilldownRuleNoun}>
        {definitions.nouns[nounUuid]?.name || labels.noun.singular}
      </span>
      {adjective && !priority?.fromLegacyAdjective && (
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
