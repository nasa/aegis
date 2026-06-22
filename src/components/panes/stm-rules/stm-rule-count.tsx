import type { FunctionComponent } from "react";
import { useMemo } from "react";
import { getSatisfiedActionsByRule } from "utils/stmRuleEngine";
import { deepEqual } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import styles from "./stm-rules-rules.module.css";

type SatisfiedSequenceActions = {
  [sequence: string]: Action[];
};

const RulesEngineSummary: FunctionComponent<{ rule: STMRule }> = ({ rule }) => {
  const allActionRecords = useMissionDocSelector((mission) => mission.actions, deepEqual);
  const allStations = useMissionDocSelector((mission) => mission.stations, deepEqual);
  const allTraverses = useMissionDocSelector((mission) => mission.traverses, deepEqual);
  const satisfiedSequenceActions = useMemo<SatisfiedSequenceActions>(() => {
    const allSequenceSTMActions = Object.values(allActionRecords).filter(
      (action) => action.stmAction && (action.stationUuid || action.traverseUuid)
    );

    const resultActions = getSatisfiedActionsByRule({
      rule,
      actionsToConsider: allSequenceSTMActions,
    });
    const sequenceActions: SatisfiedSequenceActions = {};
    for (const action of resultActions) {
      if (action.traverseUuid) {
        const traverse = allTraverses[action.traverseUuid];
        if (traverse) {
          if (!sequenceActions[traverse.name]) {
            sequenceActions[traverse.name] = [];
          }
          sequenceActions[traverse.name].push(action);
        }
      } else if (action.stationUuid) {
        const station = allStations[action.stationUuid];
        if (station) {
          if (!sequenceActions[station.name]) {
            sequenceActions[station.name] = [];
          }
          sequenceActions[station.name].push(action);
        }
      }
    }
    return sequenceActions;
  }, [allActionRecords, allStations, allTraverses, rule]);

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
          Traverses and/or Stations
        </>
      ) : (
        <></>
      )}
    </div>
  );
};

export default RulesEngineSummary;
