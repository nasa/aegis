import { FunctionComponent } from "react";
import styles from "./stm-viewer-list-table.module.css";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { RootState } from "store";
import _ from "lodash";
import { faCaretDown, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IndicatorGridRow } from "./stm-viewer-indicators";
import { stmViewCollapseItem, stmViewExpandItem, stmViewSetHoveredLeftItem } from "store/interface";
import { useAppDispatch } from "utils/useAppDispatch";
import { titleCase } from "utils/formatting";

const STMListTable: FunctionComponent = () => {
  const level1s = useAppSelector(
    (state: RootState) => _.sortBy(state.stm.level1s, "numbering"),
    deepEqual
  );

  return (
    <div className={styles.stmTables}>
      {level1s.map((level1, l1index) => (
        <STMLevel1 key={level1.uuid} level1={level1} index={l1index} />
      ))}
    </div>
  );
};

export default STMListTable;

const STMLevel1: FunctionComponent<{ level1: STMLevel1; index: number }> = ({ level1 }) => {
  const numLevel3s = useAppSelector((state: RootState) => {
    const level2s = state.stm.level2s.filter((level2) => level2.level1Uuid === level1.uuid);
    const level3s = state.stm.level3s.filter((level3) =>
      level2s.some((level2) => level2.uuid === level3.level2Uuid)
    );
    return level3s.length;
  }, deepEqual);
  const stmViewExpandTopTiers = useAppSelector(
    (state: RootState) => state.interface.stmViewExpandTopTiers,
    refEqual
  );

  const numLines = numLevel3s;
  const maxHeightEm = 1.2 * numLines;
  return (
    <div className={styles.table}>
      <div
        className={
          stmViewExpandTopTiers ? styles.gridCellLevel1Expanded : styles.gridCellLevel1Collapsed
        }
      >
        <div
          className={styles.gridCellLevel1Ordinal}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html={`${level1.name}`}
          data-tooltip-place="top-start"
        >
          {level1.numbering}.
        </div>
        {stmViewExpandTopTiers && (
          <div
            className={`${styles.truncateXLine} ${styles.gridCellLevel1Name}`}
            style={{ WebkitLineClamp: numLines, maxHeight: `${maxHeightEm}em` }}
          >
            {level1.name}
          </div>
        )}
        <div>
          <STMLevel2s level1Uuid={level1.uuid} />
        </div>
      </div>
    </div>
  );
};

const STMLevel2s: FunctionComponent<{ level1Uuid: string }> = ({ level1Uuid }) => {
  const level2s = useAppSelector(
    (state: RootState) =>
      _.sortBy(
        state.stm.level2s.filter((level2) => level2.level1Uuid === level1Uuid),
        "numbering"
      ),
    deepEqual
  );
  const allLevel3sForThisLevel2 = useAppSelector(
    (state: RootState) =>
      state.stm.level3s.filter((level3) =>
        level2s.some((level2) => level2.uuid === level3.level2Uuid)
      ),
    deepEqual
  );
  const stmViewExpandTopTiers = useAppSelector(
    (state: RootState) => state.interface.stmViewExpandTopTiers,
    refEqual
  );

  return (
    <>
      {level2s.map((level2) => {
        const level3Count =
          allLevel3sForThisLevel2.filter((level3) => level3.level2Uuid === level2.uuid)?.length ||
          0;
        const numLines = level3Count;
        const maxHeightEm = 1.2 * numLines;
        return (
          <div
            className={
              stmViewExpandTopTiers ? styles.gridCellLevel2expanded : styles.gridCellLevel2Collapsed
            }
            key={level2.uuid}
          >
            <div
              className={styles.gridCellLevel2Ordinal}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={level2.name}
              data-tooltip-place="top-start"
            >
              {level2.numbering.toLocaleUpperCase()}.
            </div>
            {stmViewExpandTopTiers && (
              <div
                className={`${styles.truncateXLine} ${styles.gridCellLevel2Name}`}
                style={{ WebkitLineClamp: numLines, maxHeight: `${maxHeightEm}em` }}
              >
                {level2.name}
              </div>
            )}
            <div className={styles.level3sContainer}>
              <STMLevel3s level2Uuid={level2.uuid} />
            </div>
          </div>
        );
      })}
    </>
  );
};

const STMLevel3s: FunctionComponent<{
  level2Uuid: string;
}> = ({ level2Uuid }) => {
  const level3s = useAppSelector(
    (state: RootState) =>
      _.sortBy(
        state.stm.level3s.filter((level3) => level3.level2Uuid === level2Uuid),
        "numbering"
      ),
    deepEqual
  );

  return (
    <>
      {level3s.map((level3) => (
        <STMLevel3 key={level3.uuid} level3={level3} />
      ))}
    </>
  );
};

const STMLevel3: FunctionComponent<{
  level3: STMLevel3;
}> = ({ level3 }) => {
  const dispatch = useAppDispatch();
  const level1Numbering = useAppSelector((state: RootState) => {
    const level2 = state.stm.level2s.find((level2) => level2.uuid === level3.level2Uuid);
    return state.stm.level1s.find((level1) => level1.uuid === level2?.level1Uuid)?.numbering || "";
  }, deepEqual);
  const level2Numbering = useAppSelector(
    (state: RootState) =>
      state.stm.level2s.find((level2) => level2.uuid === level3.level2Uuid)?.numbering || "",
    deepEqual
  );
  const thisInvestigationExpanded = useAppSelector((state: RootState) => {
    return state.interface.stmViewExpandedItems.some(
      (item) => item.uuid === level3.uuid && item.type === "level3"
    );
  }, deepEqual);

  const numberOfActionsThatHaveThisLevel3 = useAppSelector((state: RootState) => {
    return state.action.actions.filter(
      (action) =>
        action.stmPriorities &&
        Object.keys(action.stmPriorities).includes(level3.uuid) &&
        action.stationUuid &&
        state.interface.stmViewSelectedActionTypes.includes(action.type)
    ).length;
  }, deepEqual);
  const stmViewHoveredLeftItem = useAppSelector(
    (state: RootState) =>
      state.interface.stmViewShowCrosshairs ? state.interface.stmViewHoveredLeftItem : null,
    refEqual
  );

  return (
    <div className={styles.gridCellLevel3Container}>
      <div
        className={styles.gridCellLevel3Heading}
        onClick={() => {
          if (thisInvestigationExpanded) {
            dispatch(stmViewCollapseItem({ uuid: level3.uuid, type: "level3" }));
          } else {
            dispatch(stmViewExpandItem({ uuid: level3.uuid, type: "level3" }));
          }
        }}
        onMouseEnter={() => {
          if (stmViewHoveredLeftItem !== level3.uuid)
            dispatch(stmViewSetHoveredLeftItem(level3.uuid));
        }}
        style={
          stmViewHoveredLeftItem === level3.uuid
            ? { backgroundColor: "var(--stmTableHover)" }
            : null
        }
      >
        <div className={styles.nameCaret}>
          <FontAwesomeIcon
            icon={thisInvestigationExpanded ? faCaretDown : faCaretRight}
            style={{ color: "var(--grey4)" }}
          />
        </div>
        <div
          className={styles.gridCellLevel3Ordinal}
        >{`${level1Numbering}${level2Numbering.toLocaleUpperCase()}${level3.numbering}`}</div>

        <div
          className={`${styles.truncate1Line} ${styles.gridCellLevel3Name}`}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html={`${level3.name} (${numberOfActionsThatHaveThisLevel3} actions)`}
        >
          {level3.name}
        </div>
        {thisInvestigationExpanded ? (
          <div style={{ height: "22px" }}></div>
        ) : (
          <IndicatorGridRow level3Uuid={level3.uuid} />
        )}
      </div>
      {thisInvestigationExpanded && <Level3ActionTypes level3Uuid={level3.uuid} />}
    </div>
  );
};

const Level3ActionTypes: FunctionComponent<{ level3Uuid: string }> = ({ level3Uuid }) => {
  const level3ActionTypes = useAppSelector((state: RootState) => {
    const actionsWithThisLevel3: Action[] = [];
    for (const action of state.action.actions) {
      if (
        action.stmPriorities &&
        Object.keys(action.stmPriorities).includes(level3Uuid) &&
        action.stationUuid
      ) {
        actionsWithThisLevel3.push(action);
      }
    }
    const uniqueActionTypes: ActionType[] = _.uniq(
      actionsWithThisLevel3.map((action) => action.type)
    );
    // filter out actionTypes that are not contained in stmViewSelectedActionTypes
    const stmViewSelectedActionTypes = state.interface.stmViewSelectedActionTypes;
    const newUniqueActionTypes: ActionType[] = [];
    for (let i = 0; i < uniqueActionTypes.length; i++) {
      if (stmViewSelectedActionTypes.includes(uniqueActionTypes[i])) {
        newUniqueActionTypes.push(uniqueActionTypes[i]);
      }
    }
    return _.sortBy(newUniqueActionTypes, (actionType) => actionType);
  }, deepEqual);
  return (
    <div className={styles.level3ActionTypesContainer}>
      {level3ActionTypes.map((actionType, index) => (
        <Level3ActionType
          key={`${actionType}_${index}`}
          actionType={actionType}
          level3Uuid={level3Uuid}
        />
      ))}
    </div>
  );
};

const Level3ActionType: FunctionComponent<{
  actionType: ActionType;
  level3Uuid: string;
}> = ({ actionType, level3Uuid }) => {
  const dispatch = useAppDispatch();
  const actions = useAppSelector((state: RootState) => {
    return (
      state.action.actions.filter(
        (action) =>
          action.type === actionType &&
          action.stmPriorities &&
          action.stmPriorities[level3Uuid] &&
          action.stationUuid
      ) || []
    );
  }, deepEqual);
  const thisActionTypeExpanded = useAppSelector(
    (state: RootState) =>
      state.interface.stmViewExpandedItems.some(
        (item) => item.uuid === level3Uuid && item.type === actionType
      ),
    deepEqual
  );
  const stmViewHoveredLeftItem = useAppSelector(
    (state: RootState) =>
      state.interface.stmViewShowCrosshairs ? state.interface.stmViewHoveredLeftItem : null,
    refEqual
  );
  return (
    <>
      <div
        className={styles.level3ActionTypeHeading}
        onClick={() => {
          if (thisActionTypeExpanded) {
            dispatch(stmViewCollapseItem({ uuid: level3Uuid, type: actionType }));
          } else {
            dispatch(stmViewExpandItem({ uuid: level3Uuid, type: actionType }));
          }
        }}
        onMouseEnter={() => {
          if (stmViewHoveredLeftItem !== `${level3Uuid}_${actionType}`)
            dispatch(stmViewSetHoveredLeftItem(`${level3Uuid}_${actionType}`));
        }}
        style={
          stmViewHoveredLeftItem === `${level3Uuid}_${actionType}`
            ? { backgroundColor: "var(--stmTableHover)" }
            : null
        }
      >
        <div className={styles.level3ActionTypeCaret}>
          <FontAwesomeIcon
            icon={thisActionTypeExpanded ? faCaretDown : faCaretRight}
            style={{ color: "var(--grey4)" }}
          />
        </div>
        <div className={styles.level3ActionTypeName}>
          <div className={styles.nameLozenge}>{titleCase(actionType)}</div>{" "}
          <div className={styles.actionCount}>({actions.length})</div>
        </div>
        {thisActionTypeExpanded ? (
          <div style={{ height: "22px" }}></div>
        ) : (
          <IndicatorGridRow level3Uuid={level3Uuid} actionType={actionType} />
        )}
      </div>
      {thisActionTypeExpanded && (
        <div className={styles.level3ActionsContainer}>
          {actions.map((action) => (
            <Level3Action key={action.uuid} action={action} level3Uuid={level3Uuid} />
          ))}
        </div>
      )}
    </>
  );
};

const Level3Action: FunctionComponent<{
  action: Action;
  level3Uuid: string;
}> = ({ action, level3Uuid }) => {
  const dispatch = useAppDispatch();
  const stmViewHoveredLeftItem = useAppSelector(
    (state: RootState) =>
      state.interface.stmViewShowCrosshairs ? state.interface.stmViewHoveredLeftItem : null,
    refEqual
  );
  const actionTooltipTitle = useAppSelector((state: RootState) => {
    return `${action.name} (${state.station.stations.find((station) => station.uuid === action.stationUuid)?.name})`;
  }, deepEqual);
  return (
    <>
      <div
        className={styles.level3ActionHeading}
        onMouseEnter={() => {
          if (stmViewHoveredLeftItem !== action.uuid)
            dispatch(stmViewSetHoveredLeftItem(action.uuid));
        }}
        style={
          stmViewHoveredLeftItem === action.uuid
            ? { backgroundColor: "var(--stmTableHover)" }
            : null
        }
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html={actionTooltipTitle}
        data-tooltip-place="top-start"
      >
        <div></div>
        <div className={`${styles.level3ActionHeadingTitle} ${styles.truncate1Line}`}>
          Action: {action.name}
        </div>
        <IndicatorGridRow
          level3Uuid={level3Uuid}
          actionType={action.type}
          actionUuid={action.uuid}
        />
      </div>
    </>
  );
};
