import { FunctionComponent } from "react";
import { getSatisfiedActionsByRule } from "utils/stmRuleEngine";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
import styles from "./stm-rules-rules.module.css";

type SatisfiedSequenceActions = {
  [sequence: string]: Action[];
};

const RulesEngineSummary: FunctionComponent<{ rule: STMRule }> = ({ rule }) => {
  const satisfiedSequenceActions = useAppSelector<SatisfiedSequenceActions>((state) => {
    const allSequenceSTMActions = state.action.actions.filter(
      (action) => action.stmAction && (action.stationUuid || action.traverseUuid)
    );

    const resultActions = getSatisfiedActionsByRule({
      rule,
      actionsToConsider: allSequenceSTMActions,
    });
    const sequenceActions: SatisfiedSequenceActions = {};
    for (const action of resultActions) {
      if (action.traverseUuid) {
        const traverse = state.traverse.traverses.find(
          (traverse) => traverse.uuid === action.traverseUuid
        );
        if (traverse) {
          if (!sequenceActions[traverse.name]) {
            sequenceActions[traverse.name] = [];
          }
          sequenceActions[traverse.name].push(action);
        }
      } else if (action.stationUuid) {
        const station = state.station.stations.find(
          (station) => station.uuid === action.stationUuid
        );
        if (station) {
          if (!sequenceActions[station.name]) {
            sequenceActions[station.name] = [];
          }
          sequenceActions[station.name].push(action);
        }
      }
    }
    return sequenceActions;
  }, deepEqual);

  const numberOfSequenceActions = Object.values(satisfiedSequenceActions).reduce(
    (acc, actions) => acc + actions.length,
    0
  );

  return (
    <div
      className={styles.matchingActionStats}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={`Sequence items: ${Object.keys(satisfiedSequenceActions).join(", ")}`}
      data-tooltip-place="left"
    >
      {numberOfSequenceActions > 0 ? (
        <>
          {numberOfSequenceActions} Actions at {Object.keys(satisfiedSequenceActions).length}{" "}
          Traverses and Stations
        </>
      ) : (
        <></>
      )}
    </div>
  );
};

export default RulesEngineSummary;
