import { FunctionComponent } from "react";
import { getSatisfiedActionsByRule } from "utils/stmRuleEngine";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
import styles from "./stm-rules-rules.module.css";

type SatisfiedStationsActions = {
  [station: string]: Action[];
};

const RulesEngineSummary: FunctionComponent<{ rule: STMRule }> = ({ rule }) => {
  const satisfiedStationsActions = useAppSelector<SatisfiedStationsActions>((state) => {
    const allStationsSTMActions = state.action.actions.filter(
      (action) => action.stmAction && action.stationUuid
    );
    const resultActions = getSatisfiedActionsByRule({
      rule,
      actionsToConsider: allStationsSTMActions,
    });
    const stationsActions: SatisfiedStationsActions = {};
    for (const action of resultActions) {
      const station = state.station.stations.find((station) => station.uuid === action.stationUuid);
      if (station) {
        if (!stationsActions[station.name]) {
          stationsActions[station.name] = [];
        }
        stationsActions[station.name].push(action);
      }
    }
    return stationsActions;
  }, deepEqual);

  const numberOfActions = Object.values(satisfiedStationsActions).reduce(
    (acc, actions) => acc + actions.length,
    0
  );

  return (
    <div
      className={styles.matchingActionStats}
      data-tooltip-id="aegis-tooltip"
      data-tooltip-html={`Stations: ${Object.keys(satisfiedStationsActions).join(", ")}`}
      data-tooltip-place="left"
    >
      {numberOfActions > 0 ? (
        <>
          {numberOfActions} Actions at {Object.keys(satisfiedStationsActions).length} Stations
        </>
      ) : (
        <></>
      )}
    </div>
  );
};

export default RulesEngineSummary;
