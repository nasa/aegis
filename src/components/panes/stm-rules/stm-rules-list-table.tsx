import type { CSSProperties, FunctionComponent, ReactNode } from "react";
import styles from "./stm-rules-list-table.module.css";
import { STM_LEVEL3_NAME_COLUMN_WIDTH } from "./stm-rules-tier-titles";
import { refEqual, shallowEqual, deepEqual, useAppSelector } from "utils/useAppSelector";
import type { RootState } from "store";
import STMRules from "./stm-rules-rules";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";
import { faSquarePlus } from "@fortawesome/free-solid-svg-icons";
import { thunkCreateStmRule } from "store/thunk/thunkStmRules";
import { setStmRulesSelectedStmUuid, stmRulesToggleTierExpansion } from "store/stm";
import { reportSetHoveredLeftItem } from "store/report";
import sortBy from "lodash/sortBy";
import { useMissionDocSelector } from "utils/useDocSelector";

/**
 * STM hierarchy table, shared by all three v2 STM tabs. Exactly one of the
 * mode props may be set:
 * - (neither) Rules tab: each level3 shows its rules with inline editing.
 * - `selectMode`: Rule Matches tab; hides the rules column, level3 rows are
 *   selectable instead.
 * - `coverageContent`: EVA Coverage tab; renders the caller's per-column
 *   cells instead of rules, restricts rows to the coverage report's
 *   `visibleRowIds`, and highlights the row via its `hoveredLeftItem`
 *   (both in `state.report.stmCoverage`).
 */
const STMRulesTable: FunctionComponent<{
  selectMode?: boolean;
  coverageContent?: (stmUuid: string) => ReactNode;
}> = ({ selectMode = false, coverageContent }) => {
  const level1s = useAppSelector(
    (state: RootState) => sortBy(state.stm.level1s, "numbering"),
    shallowEqual
  );

  return (
    <div
      className={styles.stmTables}
      style={{ "--stmLevel3NameWidth": `${STM_LEVEL3_NAME_COLUMN_WIDTH}px` } as CSSProperties}
    >
      {level1s.map((level1, l1index) => (
        <STMLevel1
          key={level1.uuid}
          level1={level1}
          index={l1index}
          selectMode={selectMode}
          coverageContent={coverageContent}
        />
      ))}
    </div>
  );
};

export default STMRulesTable;

const STMLevel1: FunctionComponent<{
  level1: STMLevel1;
  index: number;
  selectMode: boolean;
  coverageContent?: (stmUuid: string) => ReactNode;
}> = ({ level1, selectMode, coverageContent }) => {
  const dispatch = useAppDispatch();
  const visibleStmUuids = useAppSelector(
    (state: RootState) => state.report.stmCoverage.visibleRowIds,
    shallowEqual
  );
  const numLevel3s = useAppSelector((state: RootState) => {
    const level2s = state.stm.level2s.filter((level2) => level2.level1Uuid === level1.uuid);
    const level3s = state.stm.level3s.filter((level3) =>
      level2s.some((level2) => level2.uuid === level3.level2Uuid)
    );
    return coverageContent
      ? level3s.filter((level3) => !visibleStmUuids || visibleStmUuids.includes(level3.uuid)).length
      : level3s.length;
  }, refEqual);
  const level1Expanded = useAppSelector(
    (state: RootState) => state.stm.stmRulesTierExpansion.level1,
    refEqual
  );
  const stmLevel1Enabled = useMissionDocSelector((mission) => mission.stmLevel1Enabled, deepEqual);

  if (coverageContent && numLevel3s === 0) return null;

  const numLines = numLevel3s;
  const maxHeightEm = 1.2 * numLines;
  return (
    <div className={styles.table}>
      {stmLevel1Enabled ? (
        <div
          className={
            level1Expanded ? styles.gridCellLevel1Expanded : styles.gridCellLevel1Collapsed
          }
        >
          <div
            className={`${styles.gridCellLevel1Ordinal} ${styles.tierCellClickable}`}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-content={`${level1.name}`}
            data-tooltip-place="top-start"
            onClick={() => dispatch(stmRulesToggleTierExpansion("level1"))}
          >
            {`${level1.numbering}.`}
          </div>

          {level1Expanded && (
            <div
              className={`${styles.truncateXLine} ${styles.gridCellLevel1Name} ${styles.tierCellClickable}`}
              style={{ WebkitLineClamp: numLines, maxHeight: `${maxHeightEm}em` }}
              onClick={() => dispatch(stmRulesToggleTierExpansion("level1"))}
            >
              {level1.name}
            </div>
          )}

          <div>
            <STMLevel2s
              level1Uuid={level1.uuid}
              selectMode={selectMode}
              coverageContent={coverageContent}
            />
          </div>
        </div>
      ) : (
        <div>
          <STMLevel2s
            level1Uuid={level1.uuid}
            selectMode={selectMode}
            coverageContent={coverageContent}
          />
        </div>
      )}
    </div>
  );
};

const STMLevel2s: FunctionComponent<{
  level1Uuid: string;
  selectMode: boolean;
  coverageContent?: (stmUuid: string) => ReactNode;
}> = ({ level1Uuid, selectMode, coverageContent }) => {
  const level2s = useAppSelector(
    (state: RootState) =>
      sortBy(
        state.stm.level2s.filter((level2) => level2.level1Uuid === level1Uuid),
        "numbering"
      ),
    shallowEqual
  );

  return (
    <>
      {level2s.map((level2) => (
        <STMLevel2
          key={level2.uuid}
          level2={level2}
          selectMode={selectMode}
          coverageContent={coverageContent}
        />
      ))}
    </>
  );
};

const STMLevel2: FunctionComponent<{
  level2: STMLevel2;
  selectMode: boolean;
  coverageContent?: (stmUuid: string) => ReactNode;
}> = ({ level2, selectMode, coverageContent }) => {
  const dispatch = useAppDispatch();
  const visibleStmUuids = useAppSelector(
    (state: RootState) => state.report.stmCoverage.visibleRowIds,
    shallowEqual
  );
  const level3s = useAppSelector(
    (state: RootState) =>
      sortBy(
        state.stm.level3s.filter(
          (level3) =>
            level3.level2Uuid === level2.uuid &&
            (!coverageContent || !visibleStmUuids || visibleStmUuids.includes(level3.uuid))
        ),
        "numbering"
      ),
    shallowEqual
  );
  const level2Expanded = useAppSelector(
    (state: RootState) => state.stm.stmRulesTierExpansion.level2,
    refEqual
  );

  if (coverageContent && level3s.length === 0) return null;

  return (
    <div
      className={level2Expanded ? styles.gridCellLevel2expanded : styles.gridCellLevel2Collapsed}
    >
      <div
        className={`${styles.gridCellLevel2Ordinal} ${styles.tierCellClickable}`}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html={level2.name}
        data-tooltip-place="top-start"
        onClick={() => dispatch(stmRulesToggleTierExpansion("level2"))}
      >
        {level2.numbering.toLocaleUpperCase()}.
      </div>
      {level2Expanded && (
        <div
          className={`${styles.gridCellLevel2Name} ${styles.tierCellClickable}`}
          onClick={() => dispatch(stmRulesToggleTierExpansion("level2"))}
        >
          {level2.name}
        </div>
      )}
      <div className={styles.level3sContainer}>
        {level3s.map((level3) => (
          <STMLevel3
            key={level3.uuid}
            level3={level3}
            selectMode={selectMode}
            coverageContent={coverageContent}
          />
        ))}
      </div>
    </div>
  );
};

const STMLevel3: FunctionComponent<{
  level3: STMLevel3;
  selectMode: boolean;
  coverageContent?: (stmUuid: string) => ReactNode;
}> = ({ level3, selectMode, coverageContent }) => {
  const dispatch = useAppDispatch();
  const stmLevel1Enabled = useMissionDocSelector((mission) => mission.stmLevel1Enabled, refEqual);
  const level1Numbering = useAppSelector((state: RootState) => {
    const level2 = state.stm.level2s.find((level2) => level2.uuid === level3.level2Uuid);
    return state.stm.level1s.find((level1) => level1.uuid === level2?.level1Uuid)?.numbering || "";
  }, refEqual);
  const level2Numbering = useAppSelector(
    (state: RootState) =>
      state.stm.level2s.find((level2) => level2.uuid === level3.level2Uuid)?.numbering || "",
    refEqual
  );
  const isSelected = useAppSelector(
    (state: RootState) => state.stm.stmRulesSelectedStmUuid === level3.uuid,
    refEqual
  );
  const hoveredLeftItem = useAppSelector(
    (state: RootState) => state.report.stmCoverage.hoveredLeftItem,
    refEqual
  );

  const ordinal = `${stmLevel1Enabled ? level1Numbering : ""}${level2Numbering.toLocaleUpperCase()}${level3.numbering}`;

  if (selectMode) {
    return (
      <div className={`${styles.gridCellLevel3Container} ${styles.gridCellLevel3ContainerSelect}`}>
        <div
          className={`${styles.gridCellLevel3Heading} ${
            isSelected ? styles.gridCellLevel3HeadingSelected : styles.gridCellLevel3HeadingHover
          }`}
          onClick={() => dispatch(setStmRulesSelectedStmUuid(level3.uuid))}
        >
          <div className={styles.gridCellLevel3Ordinal}>{ordinal}</div>
          <div className={`${styles.gridCellLevel3Name} ${styles.gridCellLevel3NameSelect}`}>
            {level3.name}
          </div>
        </div>
      </div>
    );
  }

  if (coverageContent) {
    return (
      <div className={styles.gridCellLevel3Container}>
        <div
          className={styles.gridCellLevel3Heading}
          style={
            hoveredLeftItem === level3.uuid ? { backgroundColor: "var(--stmCoverageHover)" } : null
          }
          onMouseEnter={() => {
            if (hoveredLeftItem !== level3.uuid) {
              dispatch(reportSetHoveredLeftItem({ reportId: "stmCoverage", item: level3.uuid }));
            }
          }}
        >
          <div className={styles.gridCellLevel3Ordinal}>{ordinal}</div>
          <div
            className={styles.gridCellLevel3Name}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html={level3.name}
            data-tooltip-place="top-start"
          >
            {level3.name}
          </div>
        </div>
        {coverageContent(level3.uuid)}
      </div>
    );
  }

  const numLines = 4;
  const minHeightEm = 1.2 * numLines;
  return (
    <div className={styles.gridCellLevel3Container}>
      <div
        className={styles.gridCellLevel3Heading}
        onClick={() => {
          dispatch(thunkCreateStmRule({ stmUuid: level3.uuid }));
        }}
      >
        <div className={styles.gridCellLevel3Ordinal}>{ordinal}</div>
        <div
          className={`${styles.gridCellLevel3Name}`}
          style={{ WebkitLineClamp: numLines, minHeight: `${minHeightEm}em` }}
        >
          {level3.name}
        </div>
        <div className={styles.stmRuleCreateButton}>
          <FontAwesomeIcon icon={faSquarePlus} size="lg" />
        </div>
      </div>
      <STMRules stmUuid={level3.uuid} />
    </div>
  );
};
