import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FunctionComponent } from "react";
import { useEffect, useMemo, useRef } from "react";
import { useAppDispatch } from "utils/useAppDispatch";
import styles from "./stm-rules-details.modal.module.css";
import ruleStyles from "./stm-rules-rules.module.css";
import paneStyles from "../global-pane-styles.module.css";
import actionsStyles from "../actions.module.css";
import {
  faBan,
  faEdit,
  faFloppyDisk,
  faPersonWalkingArrowRight,
  faRoute,
  faSquareMinus,
  faSquarePlus,
  faTrashAlt,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import type { RootState } from "store";
import { STMRuleSet } from "./stm-rules-rules";
import { setRuleEditingUuid, upsertSTMRuleByField } from "store/stm";
import { Button, MultiSelectDropdown } from "components/interface/form/globalFields";

import {
  thunkCancelStmRuleByUuid,
  thunkDeleteStmRuleByUuid,
  thunkSaveStmRule,
} from "store/thunk/thunkStmRules";
import { stmRulesToggleRex } from "store/stm";
import { getSatisfiedActionsByRule } from "utils/stmRuleEngine";
import Action from "components/panes/actions-action";
import { EmojiRenderer } from "components/interface/emojis";
import { getAsPlannedEvaFromRefUuid, selectAsPlannedStations } from "store/selectors";
import { useMissionDocSelector } from "utils/useDocSelector";

const STMRuleDetailsModal: FunctionComponent<{
  isModalOpen: boolean;
  setIsModalOpen: Function;
  rule: STMRule;
}> = ({ isModalOpen, setIsModalOpen, rule }) => {
  const dispatch = useAppDispatch();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (isModalOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isModalOpen]);
  return (
    <dialog
      ref={dialogRef}
      className={styles.modalDialog}
      onClick={(e) => {
        dispatch(thunkCancelStmRuleByUuid({ stmRuleUuid: rule.uuid }));
        setIsModalOpen(false);
        e.stopPropagation();
      }}
    >
      <STMRuleDetails rule={rule} setIsModalOpen={setIsModalOpen} />
    </dialog>
  );
};

export default STMRuleDetailsModal;

const STMRuleDetails: FunctionComponent<{
  rule: STMRule;
  setIsModalOpen: Function;
}> = ({ rule, setIsModalOpen }) => {
  const partialMission = useMissionDocSelector(
    (mission) => ({
      stmLevel3Name: mission.stmLevel3Name,
      stmLevel1Enabled: mission.stmLevel1Enabled,
    }),
    deepEqual
  );

  const level3STMItem = useAppSelector(
    (state) => state.stm.level3s.find((item) => item.uuid === rule.stmUuid),
    shallowEqual
  );
  const level2Numbering = useAppSelector(
    (state: RootState) =>
      state.stm.level2s.find((level2) => level2.uuid === level3STMItem.level2Uuid)?.numbering || "",
    refEqual
  );
  const level1Numbering = useAppSelector((state: RootState) => {
    const level2 = state.stm.level2s.find((level2) => level2.uuid === level3STMItem.level2Uuid);
    return state.stm.level1s.find((level1) => level1.uuid === level2?.level1Uuid)?.numbering || "";
  }, refEqual);

  return (
    <div
      className={styles.detailsTable}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <div className={styles.detailsLeft}>
        <div className={styles.detailsHeader}>{partialMission.stmLevel3Name}</div>
        <div className={styles.detailsContent}>
          <div className={styles.stmName}>
            <div className={styles.stmNameOrdinal}>
              {`${partialMission.stmLevel1Enabled ? level1Numbering : ""}${level2Numbering.toLocaleUpperCase()}${level3STMItem.numbering}`}
            </div>
            <div className={styles.stmNameNameText}>{level3STMItem?.name}</div>
          </div>
          <RexSelector startOpen={true} />
        </div>
      </div>
      <div className={styles.detailsRight}>
        <div className={styles.detailsHeader}>
          <div className={styles.detailsHeaderRuleContainer}>
            <div className={styles.detailsHeaderRuleTitle}>Rule</div>
            <div className={styles.detailsHeaderRuleButtons}>
              <STMRuleDetailsButtons rule={rule} setIsModalOpen={setIsModalOpen} />
            </div>
          </div>
        </div>
        <div className={styles.detailsContent}>
          <STMRuleTitle rule={rule} />
          <STMRuleRexes rule={rule} />
        </div>
      </div>
    </div>
  );
};

const STMRuleTitle: FunctionComponent<{ rule: STMRule }> = ({ rule }) => {
  const dispatch = useAppDispatch();
  const isEditing = useAppSelector(
    (state) => state.stm.ruleEditingUuid === rule.uuid,
    shallowEqual
  );
  const conjunctions = useMissionDocSelector(
    (mission) => mission.actionDefinitionConjunctions,
    refEqual
  );

  return (
    <div className={styles.stmRuleContainer}>
      {isEditing ? (
        <div className={ruleStyles.stmRuleCountContainer}>
          <FontAwesomeIcon
            icon={faSquareMinus}
            className={ruleStyles.stmRuleIcon}
            onClick={() => {
              if (rule.count <= 1) return;
              dispatch(upsertSTMRuleByField(rule.uuid, "count", rule.count - 1));
            }}
          />
          <div className={ruleStyles.stmRuleCount}>{rule.count}</div>
          <FontAwesomeIcon
            icon={faSquarePlus}
            className={ruleStyles.stmRuleIcon}
            onClick={() => {
              dispatch(upsertSTMRuleByField(rule.uuid, "count", rule.count + 1));
            }}
          />
        </div>
      ) : (
        <div className={ruleStyles.stmRuleCount}>{rule.count}</div>
      )}

      <div className={ruleStyles.stmRuleSetContainer}>
        <STMRuleSet isEditing={isEditing} stmRule={rule} type="verbs" />
      </div>
      <div className={ruleStyles.stmRuleSetConjunction}>{conjunctions.verbToNoun}</div>
      <div className={ruleStyles.stmRuleSetContainer}>
        <STMRuleSet isEditing={isEditing} stmRule={rule} type="nouns" />
      </div>
      <div className={ruleStyles.stmRuleSetConjunction}>{conjunctions.nounToAdjective}</div>
      <div className={ruleStyles.stmRuleSetContainer}>
        <STMRuleSet isEditing={isEditing} stmRule={rule} type="adjectives" />
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

const STMRuleDetailsButtons: FunctionComponent<{
  rule: STMRule;
  setIsModalOpen: Function;
}> = ({ rule, setIsModalOpen }) => {
  const dispatch = useAppDispatch();
  const isEditing = useAppSelector(
    (state) => state.stm.ruleEditingUuid === rule.uuid,
    shallowEqual
  );
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const modified = true; //not implemented

  if (!editPerms) return null;

  return (
    <div className={paneStyles.saveCancelContainer} style={{ marginTop: "2px", marginRight: "0" }}>
      {!isEditing ? (
        <Button
          ariaLabel="editRule"
          icon={faEdit}
          onClick={() => {
            dispatch(setRuleEditingUuid(rule.uuid));
          }}
          label="Edit"
          toolTip="Edit Rule"
          style={{ width: "60px", fontSize: "0.9em" }}
          labelStyle={{ marginTop: "2px" }}
        />
      ) : (
        <>
          <Button
            ariaLabel="deleteRule"
            icon={faTrashAlt}
            onClick={() => {
              if (window.confirm("Are you sure you want to delete this rule?")) {
                dispatch(
                  thunkDeleteStmRuleByUuid({
                    stmRuleUuid: rule.uuid,
                  })
                );
              }
            }}
            toolTip="Delete Rule"
            style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
          />
          <Button
            ariaLabel="saveEva"
            onClick={() => {
              dispatch(thunkSaveStmRule({ stmRule: rule }));
            }}
            icon={faFloppyDisk}
            toolTip={`Save Rule${modified ? "" : " (nothing to save)"}`}
            enabled={modified}
            style={{
              width: "30px",
              backgroundColor: modified ? "var(--alert)" : "var(--alert-disabled)",
              color: modified ? "white" : "var(--grey4)",
              fontSize: "0.9em",
              paddingLeft: "10px",
            }}
          />
          <Button
            ariaLabel="cancelEva"
            onClick={() => {
              dispatch(thunkCancelStmRuleByUuid({ stmRuleUuid: rule.uuid }));
            }}
            icon={faBan}
            toolTip="Cancel Edit"
            style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
          />
        </>
      )}
      <Button
        ariaLabel="closeModal"
        icon={faXmark}
        onClick={() => {
          dispatch(thunkCancelStmRuleByUuid({ stmRuleUuid: rule.uuid }));
          setIsModalOpen(false);
        }}
        toolTip="Close Rule"
        style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
      />
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
