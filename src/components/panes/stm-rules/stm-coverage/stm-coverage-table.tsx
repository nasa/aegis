import type { FunctionComponent } from "react";
import { Fragment } from "react";
import styles from "./stm-coverage.module.css";
import tableStyles from "../stm-rules-list-table.module.css";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import type { RootState } from "store";
import { useAppDispatch } from "utils/useAppDispatch";
import { stmRulesToggleTierExpansion, stmCoverageSetHoveredLeftItem } from "store/stm";
import sortBy from "lodash/sortBy";
import { useMissionDocSelector } from "utils/useDocSelector";
import { deepEqual } from "utils/useAppSelector";
import { groupCoverageColumns } from "utils/stmEvaCoverage";
import { StmCoverageColumnCells } from "./stm-coverage-cell";

/**
 * STM hierarchy rows of the EVA Coverage grid. The tier layout is the same as
 * the Rules tab (shared stmRulesTierExpansion state) so switching tabs keeps
 * the hierarchy visually stable.
 */
const StmCoverageTable: FunctionComponent = () => {
  const level1s = useAppSelector(
    (state: RootState) => sortBy(state.stm.level1s, "numbering"),
    shallowEqual
  );

  return (
    <div className={tableStyles.stmTables}>
      {level1s.map((level1) => (
        <STMLevel1Block key={level1.uuid} level1={level1} />
      ))}
    </div>
  );
};

export default StmCoverageTable;

const STMLevel1Block: FunctionComponent<{ level1: STMLevel1 }> = ({ level1 }) => {
  const dispatch = useAppDispatch();
  const visibleStmUuids = useAppSelector(
    (state: RootState) => state.stm.stmCoverageVisibleStmUuids,
    shallowEqual
  );
  const level2s = useAppSelector(
    (state: RootState) =>
      sortBy(
        state.stm.level2s.filter((level2) => level2.level1Uuid === level1.uuid),
        "numbering"
      ),
    shallowEqual
  );
  const numVisibleLevel3s = useAppSelector((state: RootState) => {
    const level3s = state.stm.level3s.filter((level3) =>
      level2s.some((level2) => level2.uuid === level3.level2Uuid)
    );
    return level3s.filter((level3) => !visibleStmUuids || visibleStmUuids.includes(level3.uuid))
      .length;
  }, refEqual);
  const level1Expanded = useAppSelector(
    (state: RootState) => state.stm.stmRulesTierExpansion.level1,
    refEqual
  );
  const stmLevel1Enabled = useMissionDocSelector((mission) => mission.stmLevel1Enabled, deepEqual);

  if (numVisibleLevel3s === 0) return null;

  const numLines = numVisibleLevel3s;
  const maxHeightEm = 1.2 * numLines;
  return (
    <div className={tableStyles.table}>
      {stmLevel1Enabled ? (
        <div
          className={
            level1Expanded
              ? tableStyles.gridCellLevel1Expanded
              : tableStyles.gridCellLevel1Collapsed
          }
        >
          <div
            className={`${tableStyles.gridCellLevel1Ordinal} ${tableStyles.tierCellClickable}`}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html={`${level1.name}`}
            data-tooltip-place="top-start"
            onClick={() => dispatch(stmRulesToggleTierExpansion("level1"))}
          >
            {`${level1.numbering}.`}
          </div>
          {level1Expanded && (
            <div
              className={`${tableStyles.truncateXLine} ${tableStyles.gridCellLevel1Name} ${tableStyles.tierCellClickable}`}
              style={{ WebkitLineClamp: numLines, maxHeight: `${maxHeightEm}em` }}
              onClick={() => dispatch(stmRulesToggleTierExpansion("level1"))}
            >
              {level1.name}
            </div>
          )}
          <div>
            {level2s.map((level2) => (
              <STMLevel2Block
                key={level2.uuid}
                level2={level2}
                stmLevel1Enabled={stmLevel1Enabled}
              />
            ))}
          </div>
        </div>
      ) : (
        <div>
          {level2s.map((level2) => (
            <STMLevel2Block key={level2.uuid} level2={level2} stmLevel1Enabled={stmLevel1Enabled} />
          ))}
        </div>
      )}
    </div>
  );
};

const STMLevel2Block: FunctionComponent<{ level2: STMLevel2; stmLevel1Enabled: boolean }> = ({
  level2,
  stmLevel1Enabled,
}) => {
  const dispatch = useAppDispatch();
  const visibleStmUuids = useAppSelector(
    (state: RootState) => state.stm.stmCoverageVisibleStmUuids,
    shallowEqual
  );
  const level3s = useAppSelector(
    (state: RootState) =>
      sortBy(
        state.stm.level3s.filter(
          (level3) =>
            level3.level2Uuid === level2.uuid &&
            (!visibleStmUuids || visibleStmUuids.includes(level3.uuid))
        ),
        "numbering"
      ),
    shallowEqual
  );
  const level2Expanded = useAppSelector(
    (state: RootState) => state.stm.stmRulesTierExpansion.level2,
    refEqual
  );

  if (level3s.length === 0) return null;

  return (
    <div
      className={
        level2Expanded ? tableStyles.gridCellLevel2expanded : tableStyles.gridCellLevel2Collapsed
      }
    >
      <div
        className={`${tableStyles.gridCellLevel2Ordinal} ${tableStyles.tierCellClickable}`}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html={level2.name}
        data-tooltip-place="top-start"
        onClick={() => dispatch(stmRulesToggleTierExpansion("level2"))}
      >
        {level2.numbering.toLocaleUpperCase()}.
      </div>
      {level2Expanded && (
        <div
          className={`${tableStyles.gridCellLevel2Name} ${tableStyles.tierCellClickable}`}
          onClick={() => dispatch(stmRulesToggleTierExpansion("level2"))}
        >
          {level2.name}
        </div>
      )}
      <div className={tableStyles.level3sContainer}>
        {level3s.map((level3) => (
          <STMLevel3Row key={level3.uuid} level3={level3} stmLevel1Enabled={stmLevel1Enabled} />
        ))}
      </div>
    </div>
  );
};

const STMLevel3Row: FunctionComponent<{
  level3: STMLevel3;
  stmLevel1Enabled: boolean;
}> = ({ level3, stmLevel1Enabled }) => {
  const dispatch = useAppDispatch();
  const visibleColumns = useAppSelector(
    (state: RootState) => state.stm.stmCoverageVisibleColumns,
    shallowEqual
  );
  const level1Numbering = useAppSelector((state: RootState) => {
    const level2 = state.stm.level2s.find((level2) => level2.uuid === level3.level2Uuid);
    return state.stm.level1s.find((level1) => level1.uuid === level2?.level1Uuid)?.numbering || "";
  }, refEqual);
  const level2Numbering = useAppSelector(
    (state: RootState) =>
      state.stm.level2s.find((level2) => level2.uuid === level3.level2Uuid)?.numbering || "",
    refEqual
  );
  const hoveredLeftItem = useAppSelector(
    (state: RootState) => state.stm.stmCoverageHoveredLeftItem,
    refEqual
  );

  const columnGroups = groupCoverageColumns(visibleColumns);

  return (
    <div className={tableStyles.gridCellLevel3Container}>
      <div
        className={tableStyles.gridCellLevel3Heading}
        style={
          hoveredLeftItem === level3.uuid ? { backgroundColor: "var(--stmCoverageHover)" } : null
        }
        onMouseEnter={() => {
          if (hoveredLeftItem !== level3.uuid) {
            dispatch(stmCoverageSetHoveredLeftItem(level3.uuid));
          }
        }}
      >
        <div
          className={tableStyles.gridCellLevel3Ordinal}
        >{`${stmLevel1Enabled ? level1Numbering : ""}${level2Numbering.toLocaleUpperCase()}${level3.numbering}`}</div>
        <div
          className={tableStyles.gridCellLevel3Name}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html={level3.name}
          data-tooltip-place="top-start"
        >
          {level3.name}
        </div>
      </div>
      <div className={styles.tableRowCells}>
        {columnGroups.map((group, groupIndex) => (
          <Fragment key={group.groupKey}>
            {groupIndex > 0 && <div className={styles.columnDivider} />}
            {group.columns.map((column) => (
              <StmCoverageColumnCells key={column.key} column={column} stmUuid={level3.uuid} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
};
