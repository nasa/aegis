import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FunctionComponent } from "react";
import { useMemo } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import styles from "./stm-rules-tab-matches.module.css";
import pageStyles from "./stm-rules-page.module.css";
import ruleStyles from "./stm-rules-rules.module.css";
import actionsStyles from "../actions.module.css";
import { faPersonWalkingArrowRight, faRoute } from "@fortawesome/free-solid-svg-icons";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import type { RootState } from "store";
import { STMRuleSet } from "./stm-rules-rules";
import { setStmRulesSelectedRuleUuid, stmRulesToggleRex } from "store/stm";
import { MultiSelectDropdown } from "components/interface/form/globalFields";
import { getSatisfiedActionsByRule } from "utils/stmRuleEngine";
import Action from "components/panes/actions-action";
import { EmojiRenderer } from "components/interface/emojis";
import { getAsPlannedEvaFromRefUuid, selectAsPlannedStations } from "store/selectors";
import { useMissionDocSelector } from "utils/useDocSelector";
import STMRulesTable from "./stm-rules-list-table";
import { StmTierTitle, useStmTierExpansion } from "./stm-rules-tier-titles";

/**
 * "Rule Matches" tab: read-only report of the actions matching one rule,
 * bucketed by selected executions (rexes), as-planned stations and as-planned
 * EVA traverses. The full STM hierarchy on the left selects a level3 item;
 * all of its rules are listed on the right and clicking one shows its report.
 */
const StmRulesTabMatches: FunctionComponent = () => {
  const { stmLevel1Enabled, tierColumns } = useStmTierExpansion();
  const stmLevel3Name = useMissionDocSelector((mission) => mission.stmLevel3Name, refEqual);
  const selectedStmUuid = useAppSelector((state) => state.stm.stmRulesSelectedStmUuid, refEqual);
  const selectedRuleUuid = useAppSelector((state) => state.stm.stmRulesSelectedRuleUuid, refEqual);
  const rules = useAppSelector(
    (state) => state.stm.rules.filter((r) => r.stmUuid === selectedStmUuid),
    deepEqual
  );
  // fall back to the first rule when none of this level3's rules is selected
  const selectedRule = rules.find((r) => r.uuid === selectedRuleUuid) ?? rules[0] ?? null;

  return (
    <div className={styles.matchesBody}>
      <div className={styles.treePanel}>
        <div
          className={pageStyles.listHeaderTitles}
          style={{ gridTemplateColumns: [...tierColumns, "285px"].join(" ") }}
        >
          {stmLevel1Enabled && <StmTierTitle tier="level1" />}
          <StmTierTitle tier="level2" />
          <div className={pageStyles.listTableTitle}>{stmLevel3Name}s</div>
        </div>
        <div className={pageStyles.panelBottom}>
          <STMRulesTable selectMode />
        </div>
      </div>
      <div className={styles.detailsRight}>
        {selectedStmUuid ? (
          <>
            <div className={styles.detailsHeaderRow}>
              <STMItemName stmUuid={selectedStmUuid} />
              <RexSelector />
            </div>
            {rules.length > 0 ? (
              <>
                <div className={styles.rulesList}>
                  {rules.map((rule) => (
                    <RuleRow
                      key={rule.uuid}
                      rule={rule}
                      isSelected={rule.uuid === selectedRule?.uuid}
                      showSelection={rules.length > 1}
                    />
                  ))}
                </div>
                {selectedRule && (
                  <div className={styles.detailsContent}>
                    <STMRuleRexes rule={selectedRule} />
                  </div>
                )}
              </>
            ) : (
              <div className={styles.emptyState}>
                <div>No rules defined for this {stmLevel3Name?.toLowerCase()}.</div>
                <div>Add rules in the Rules tab.</div>
              </div>
            )}
          </>
        ) : (
          <div className={styles.emptyState}>
            <div>No {stmLevel3Name?.toLowerCase()} selected.</div>
            <div>
              Pick a {stmLevel3Name?.toLowerCase()} on the left, or use the magnifier button on a
              rule in the Rules tab.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StmRulesTabMatches;

const STMItemName: FunctionComponent<{ stmUuid: string }> = ({ stmUuid }) => {
  const stmLevel1Enabled = useMissionDocSelector((mission) => mission.stmLevel1Enabled, refEqual);
  const level3STMItem = useAppSelector(
    (state) => state.stm.level3s.find((item) => item.uuid === stmUuid),
    shallowEqual
  );
  const level2Numbering = useAppSelector(
    (state: RootState) =>
      state.stm.level2s.find((level2) => level2.uuid === level3STMItem?.level2Uuid)?.numbering ||
      "",
    refEqual
  );
  const level1Numbering = useAppSelector((state: RootState) => {
    const level2 = state.stm.level2s.find((level2) => level2.uuid === level3STMItem?.level2Uuid);
    return state.stm.level1s.find((level1) => level1.uuid === level2?.level1Uuid)?.numbering || "";
  }, refEqual);

  if (!level3STMItem) return null;
  return (
    <div className={styles.stmName}>
      <div>
        {`${stmLevel1Enabled ? level1Numbering : ""}${level2Numbering.toLocaleUpperCase()}${level3STMItem.numbering}`}
      </div>
      <div>{level3STMItem.name}</div>
    </div>
  );
};

/**
 * One read-only rule of the selected level3 item. All rules are visible at
 * once; clicking one shows its match report below.
 */
const RuleRow: FunctionComponent<{
  rule: STMRule;
  isSelected: boolean;
  showSelection: boolean;
}> = ({ rule, isSelected, showSelection }) => {
  const dispatch = useAppDispatch();
  const conjunctions = useMissionDocSelector(
    (mission) => mission.actionDefinitionConjunctions,
    refEqual
  );
  const ruleRowClass =
    showSelection && isSelected ? `${styles.ruleRow} ${styles.ruleRowSelected}` : styles.ruleRow;

  return (
    <div className={ruleRowClass} onClick={() => dispatch(setStmRulesSelectedRuleUuid(rule.uuid))}>
      <div className={ruleStyles.stmRuleCount}>{rule.count}</div>
      <div className={ruleStyles.stmRuleSetContainer}>
        <STMRuleSet isEditing={false} stmRule={rule} type="verbs" />
      </div>
      <div className={ruleStyles.stmRuleSetConjunction}>{conjunctions.verbToNoun}</div>
      <div className={ruleStyles.stmRuleSetContainer}>
        <STMRuleSet isEditing={false} stmRule={rule} type="nouns" />
      </div>
      <div className={ruleStyles.stmRuleSetConjunction}>{conjunctions.nounToAdjective}</div>
      <div className={ruleStyles.stmRuleSetContainer}>
        <STMRuleSet isEditing={false} stmRule={rule} type="adjectives" />
      </div>
    </div>
  );
};

const STMRuleRexes: FunctionComponent<{ rule: STMRule }> = ({ rule }) => {
  const selectedRexUuids = useAppSelector((state) => state.stm.stmRulesSelectedRexes, shallowEqual);
  const selectedRexEvaUuids = useMissionDocSelector((mission) => {
    const selectedEvaUuids: string[] = [];
    for (const rexUuid of selectedRexUuids) {
      const rex = mission?.rexes?.[rexUuid];
      if (rex) selectedEvaUuids.push(rex.evaUuid);
    }
    return selectedEvaUuids;
  }, shallowEqual);

  // get all as-planned evas that are not in the selected rex evas
  const otherAsPlannedEvaUuids = useMissionDocSelector((mission) => {
    if (!mission?.evas || !mission?.rexes) return [];
    const allRexEvaUuids = Object.values(mission.rexes).map((rex) => rex.evaUuid);
    return Object.values(mission.evas)
      .filter(
        (eva) => !selectedRexEvaUuids.includes(eva.uuid) && !allRexEvaUuids.includes(eva.uuid)
      )
      .map((eva) => eva.uuid);
  }, shallowEqual);

  // get all as-planned stations that are not in the selected rex evas
  const otherAsPlannedStations = useMissionDocSelector((mission) => {
    const allAsPlannedStations = selectAsPlannedStations(mission);
    // remove stations that have no actions
    const stationsNotInSelectedRexEvas = allAsPlannedStations.filter(
      (station) => station.actionOrderUuids && station.actionOrderUuids.length > 0
    );
    return stationsNotInSelectedRexEvas;
  }, deepEqual);

  const selectedTraverseUuids = useMissionDocSelector((mission) => {
    return selectedRexEvaUuids.flatMap((evaUuid) => {
      const eva = mission?.evas?.[evaUuid];
      return (
        eva?.sequence
          .filter((sequenceItem) => sequenceItem.type === "traverse")
          .map((item) => item.uuid) ?? []
      );
    });
  }, deepEqual);
  const allTraverseUuids = useMissionDocSelector(
    (mission) => Object.keys(mission.traverses),
    shallowEqual
  );
  const otherTraverseUuids = useMemo(
    () =>
      allTraverseUuids?.filter((traverseUuid) => !selectedTraverseUuids.includes(traverseUuid)) ??
      [],
    [allTraverseUuids, selectedTraverseUuids]
  );

  return (
    <div className={styles.stmRuleEvasContainer}>
      <div className={styles.stmRuleEvasTitle}>
        Actions that satisfy this rule in the selected Executions
      </div>
      <div className={styles.stmRuleEvasEvasContainer}>
        {selectedRexUuids.map((rexUuid) => (
          <STMRuleRex key={rexUuid} rexUuid={rexUuid} rule={rule} />
        ))}
      </div>
      <div className={styles.stmRuleEvasTitle}>
        Actions that satisfy this rule in as-planned stations outside the selected Executions
      </div>
      <div className={styles.stmRuleEvasEvasContainer}>
        {otherAsPlannedStations.map((station) => (
          <STMRuleStation
            key={station.uuid}
            rexUuid={null}
            stationUuid={station.uuid}
            rule={rule}
          />
        ))}
      </div>
      <div className={styles.stmRuleEvasTitle}>
        Actions that satisfy this rule in as-planned EVA traverses outside the selected Executions
      </div>
      <div className={styles.stmRuleEvasEvasContainer}>
        {otherAsPlannedEvaUuids.map((evaUuid) => (
          <STMRuleEva
            key={evaUuid}
            evaUuid={evaUuid}
            otherTraverseUuids={otherTraverseUuids}
            rule={rule}
          />
        ))}
      </div>
    </div>
  );
};

const STMRuleRex: FunctionComponent<{ rexUuid: string; rule: STMRule }> = ({ rexUuid, rule }) => {
  const rex = useMissionDocSelector((mission) => mission.rexes?.[rexUuid], shallowEqual);
  const asPlannedEvaName = useMissionDocSelector((mission) => {
    if (!mission?.evas || !mission?.rexes || !rex) return undefined;
    const eva = mission.evas[rex.evaUuid];
    const asPlannedEva = getAsPlannedEvaFromRefUuid(mission, eva.refUuid);
    return asPlannedEva?.name;
  }, shallowEqual);

  return (
    <div className={styles.rexEvaContainer}>
      <div className={styles.rexEvaHeader}>
        <FontAwesomeIcon
          icon={faPersonWalkingArrowRight}
          className={styles.rexEvaHeaderIcon}
          style={{ color: "var(--rex)" }}
        />
        <div className={styles.rexEvaHeaderName} style={{ color: "var(--rex)" }}>
          {rex?.name}
        </div>
        <div className={styles.rexEvaHeaderDivider}>-</div>
        <FontAwesomeIcon
          icon={faRoute}
          className={styles.rexEvaHeaderIcon}
          style={{ color: "var(--eva)" }}
        />
        <div className={styles.rexEvaHeaderName} style={{ color: "var(--eva)" }}>
          {asPlannedEvaName}
        </div>
      </div>
      <STMRuleRexSequence rexUuid={rexUuid} rule={rule} />
    </div>
  );
};

const STMRuleEva: FunctionComponent<{
  evaUuid: string;
  otherTraverseUuids: string[];
  rule: STMRule;
}> = ({ evaUuid, otherTraverseUuids, rule }) => {
  const eva = useMissionDocSelector((mission) => mission.evas?.[evaUuid], shallowEqual);

  return (
    <div className={styles.rexEvaContainer}>
      <div className={styles.rexEvaHeader}>
        <FontAwesomeIcon
          icon={faRoute}
          className={styles.rexEvaHeaderIcon}
          style={{ color: "var(--eva)" }}
        />
        <div className={styles.rexEvaHeaderName} style={{ color: "var(--eva)" }}>
          {eva?.name}
        </div>
      </div>
      <STMRuleEvaTraverses evaUuid={eva.uuid} otherTraverseUuids={otherTraverseUuids} rule={rule} />
    </div>
  );
};

const STMRuleRexSequence: FunctionComponent<{
  rexUuid: string;
  rule: STMRule;
}> = ({ rexUuid, rule }) => {
  const eva = useMissionDocSelector((mission) => {
    const rex = mission?.rexes?.[rexUuid];
    return rex ? mission?.evas?.[rex.evaUuid] : null;
  }, refEqual);
  const allStations = useMissionDocSelector((mission) => mission.stations, deepEqual);
  const allTraverses = useMissionDocSelector((mission) => mission.traverses, deepEqual);

  const filteredSequence = useMemo(() => {
    return eva.sequence.filter((sequenceItem) => {
      if (sequenceItem.type === "station") {
        return !!allStations[sequenceItem.uuid];
      } else {
        return !!allTraverses[sequenceItem.uuid];
      }
    });
  }, [eva, allStations, allTraverses]);

  return (
    <div className={styles.evaStations}>
      {filteredSequence.map((sequenceItem) =>
        sequenceItem.type === "station" ? (
          <div>
            <STMRuleStation
              key={sequenceItem.uuid}
              rexUuid={rexUuid}
              stationUuid={sequenceItem.uuid}
              rule={rule}
            />
          </div>
        ) : (
          <div>
            <STMRuleTraverse
              key={sequenceItem.uuid}
              rexUuid={rexUuid}
              traverseUuid={sequenceItem.uuid}
              rule={rule}
            />
          </div>
        )
      )}
    </div>
  );
};

const STMRuleEvaTraverses: FunctionComponent<{
  evaUuid: string;
  otherTraverseUuids: string[];
  rule: STMRule;
}> = ({ evaUuid, otherTraverseUuids, rule }) => {
  const eva = useMissionDocSelector((mission) => mission.evas?.[evaUuid], refEqual);

  const filteredSequence = eva.sequence.filter((sequenceItem) => {
    return otherTraverseUuids.some((traverseUuid) => traverseUuid === sequenceItem.uuid);
  });

  return (
    <div className={styles.evaStations}>
      {filteredSequence.map((sequenceItem) => (
        <div key={sequenceItem.uuid}>
          <STMRuleTraverse rexUuid={null} traverseUuid={sequenceItem.uuid} rule={rule} />
        </div>
      ))}
    </div>
  );
};

const STMRuleStation: FunctionComponent<{
  rexUuid: string;
  stationUuid: string;
  rule: STMRule;
}> = ({ rexUuid, stationUuid, rule }) => {
  const stationPartial: {
    name: string;
    icon: string;
    actionOrderUuids: string[];
    location: AEGISPoint;
    elevation: number;
  } = useMissionDocSelector((mission) => {
    const station = mission.stations[stationUuid];
    return {
      name: station.name,
      icon: station.icon,
      actionOrderUuids: station.actionOrderUuids,
      location: station.location,
      elevation: station.elevation,
    };
  }, deepEqual);
  const satisfiedActions = useMissionDocSelector((mission) => {
    if (!stationPartial.actionOrderUuids || stationPartial.actionOrderUuids.length === 0) {
      return [];
    }

    const stationActions: Action[] = stationPartial.actionOrderUuids.map((actionUuid) => {
      return mission.actions[actionUuid];
    });

    const resultActions = getSatisfiedActionsByRule({
      rule,
      actionsToConsider: stationActions,
    });

    return resultActions;
  }, deepEqual);

  return (
    <div key={stationUuid} className={styles.evaStation}>
      <div className={styles.stationHeaderRow}>
        <div>
          <EmojiRenderer iconValue={stationPartial.icon ? stationPartial.icon : "2754"} />
        </div>
        <div className={styles.stationName}>{stationPartial.name}</div>
      </div>
      <div className={styles.stationLineRow}>
        <div className={styles.stationLineContainer}>
          <div className={styles.stationLine} />
        </div>
        <div className={styles.actionsContainer}>
          {satisfiedActions.map((action) => (
            <li key={action.uuid} className={actionsStyles.actionlistitem}>
              <Action
                editMode={false}
                actionUuid={action.uuid}
                highlight={false}
                parentType={"station"}
                parentLocation={stationPartial?.location}
                parentElevation={stationPartial?.elevation}
                rexUuid={rexUuid}
                toFocus={false}
                allowEdit={false}
              />
            </li>
          ))}
        </div>
      </div>
    </div>
  );
};

const STMRuleTraverse: FunctionComponent<{
  rexUuid: string;
  traverseUuid: string;
  rule: STMRule;
}> = ({ rexUuid, traverseUuid, rule }) => {
  const traversePartial: { name: string; actionOrderUuids: string[] } = useMissionDocSelector(
    (mission) => {
      const traverse = mission.traverses[traverseUuid];
      return { name: traverse.name, actionOrderUuids: traverse.actionOrderUuids };
    },
    deepEqual
  );

  const satisfiedActions = useMissionDocSelector((mission) => {
    if (!traversePartial.actionOrderUuids || traversePartial.actionOrderUuids.length === 0) {
      return [];
    }

    const traverseActions: Action[] = traversePartial.actionOrderUuids.map((actionUuid) => {
      return mission.actions[actionUuid];
    });

    const resultActions = getSatisfiedActionsByRule({
      rule,
      actionsToConsider: traverseActions,
    });

    return resultActions;
  }, deepEqual);

  return (
    <div key={traverseUuid} className={styles.evaStation}>
      <div className={styles.stationHeaderRow}>
        <div className={styles.iconTraverseDotsContainerSmall}>
          <div className={styles.iconTraverseSmall} />
        </div>
        <div className={styles.stationName}>{traversePartial.name}</div>
      </div>
      <div className={styles.stationLineRow}>
        <div className={styles.stationLineContainer}>
          <div className={styles.stationLine} />
        </div>
        <div className={styles.actionsContainer}>
          {satisfiedActions.map((action) => (
            <li key={action.uuid} className={actionsStyles.actionlistitem}>
              <Action
                editMode={false}
                actionUuid={action.uuid}
                highlight={false}
                parentType={"traverse"}
                parentLocation={action?.location}
                parentElevation={action?.elevation}
                rexUuid={rexUuid}
                toFocus={false}
                allowEdit={false}
              />
            </li>
          ))}
        </div>
      </div>
    </div>
  );
};

export const RexSelector: FunctionComponent<{ startOpen?: boolean }> = ({ startOpen = false }) => {
  const dispatch = useAppDispatch();
  const selectedRexes = useAppSelector((state) => state.stm.stmRulesSelectedRexes, deepEqual);
  const rexesForDropdown = useMissionDocSelector((mission) => {
    if (!mission?.rexes || !mission?.evas) return [];
    const items = Object.values(mission.rexes).map((rex) => {
      const rexEva = mission.evas[rex.evaUuid];
      const asPlannedEva = getAsPlannedEvaFromRefUuid(mission, rexEva.refUuid);
      const rexWithEvaName = `${asPlannedEva?.name ?? ""} - ${rex.name}`;
      return { uuid: rex.uuid, name: rexWithEvaName };
    });
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, deepEqual);

  return (
    <div className={styles.evaSelector}>
      <MultiSelectDropdown
        items={rexesForDropdown.map((item) => ({ label: item.name, value: item.uuid }))}
        selectedItemsValues={selectedRexes}
        toggleItem={(uuid) => {
          dispatch(stmRulesToggleRex(uuid));
        }}
        titleLabel="Executions"
        containerStyle={{ zIndex: 10 }}
        containerClassName={styles.multiselectDropdownContainer}
        headerClassName={styles.multiselectDropdownHeader}
        startOpen={startOpen}
        closeOnBlur={false}
      />
    </div>
  );
};
