import type { FunctionComponent } from "react";
import styles from "./stm-rules-list-table.module.css";
import { refEqual, shallowEqual, deepEqual, useAppSelector } from "utils/useAppSelector";
import type { RootState } from "store";
import STMRules from "./stm-rules-rules";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";
import { faSquarePlus } from "@fortawesome/free-solid-svg-icons";
import { thunkCreateStmRule } from "store/thunk/thunkStmRules";
import { setStmRulesSelectedStmUuid, stmRulesToggleTierExpansion } from "store/stm";
import sortBy from "lodash/sortBy";
import { useMissionDocSelector } from "utils/useDocSelector";

/**
 * STM hierarchy table. Default mode (Rules tab) shows each level3 with its
 * rules and inline editing; `selectMode` (Rule Matches tab) hides the rules
 * column and makes level3 rows selectable instead.
 */
const STMRulesTable: FunctionComponent<{ selectMode?: boolean }> = ({ selectMode = false }) => {
  const level1s = useAppSelector(
    (state: RootState) => sortBy(state.stm.level1s, "numbering"),
    shallowEqual
  );

  return (
    <div className={styles.stmTables}>
      {level1s.map((level1, l1index) => (
        <STMLevel1 key={level1.uuid} level1={level1} index={l1index} selectMode={selectMode} />
      ))}
    </div>
  );
};

export default STMRulesTable;

const STMLevel1: FunctionComponent<{ level1: STMLevel1; index: number; selectMode: boolean }> = ({
  level1,
  selectMode,
}) => {
  const dispatch = useAppDispatch();
  const numLevel3s = useAppSelector((state: RootState) => {
    const level2s = state.stm.level2s.filter((level2) => level2.level1Uuid === level1.uuid);
    const level3s = state.stm.level3s.filter((level3) =>
      level2s.some((level2) => level2.uuid === level3.level2Uuid)
    );
    return level3s.length;
  }, refEqual);
  const level1Expanded = useAppSelector(
    (state: RootState) => state.stm.stmRulesTierExpansion.level1,
    refEqual
  );
  const stmLevel1Enabled = useMissionDocSelector((mission) => mission.stmLevel1Enabled, deepEqual);

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
            data-tooltip-html={`${level1.name}`}
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
              stmLevel1Enabled={stmLevel1Enabled}
              selectMode={selectMode}
            />
          </div>
        </div>
      ) : (
        <div>
          <STMLevel2s
            level1Uuid={level1.uuid}
            stmLevel1Enabled={stmLevel1Enabled}
            selectMode={selectMode}
          />
        </div>
      )}
    </div>
  );
};

const STMLevel2s: FunctionComponent<{
  level1Uuid: string;
  stmLevel1Enabled: boolean;
  selectMode: boolean;
}> = ({ level1Uuid, stmLevel1Enabled, selectMode }) => {
  const dispatch = useAppDispatch();
  const level2s = useAppSelector(
    (state: RootState) =>
      sortBy(
        state.stm.level2s.filter((level2) => level2.level1Uuid === level1Uuid),
        "numbering"
      ),
    shallowEqual
  );
  const level2Expanded = useAppSelector(
    (state: RootState) => state.stm.stmRulesTierExpansion.level2,
    refEqual
  );

  return (
    <>
      {level2s.map((level2) => {
        return (
          <div
            className={
              level2Expanded ? styles.gridCellLevel2expanded : styles.gridCellLevel2Collapsed
            }
            key={level2.uuid}
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
              <STMLevel3s
                level2Uuid={level2.uuid}
                stmLevel1Enabled={stmLevel1Enabled}
                selectMode={selectMode}
              />
            </div>
          </div>
        );
      })}
    </>
  );
};

export const STMLevel3s: FunctionComponent<{
  level2Uuid: string;
  stmLevel1Enabled: boolean;
  selectMode: boolean;
}> = ({ level2Uuid, stmLevel1Enabled, selectMode }) => {
  const level3s = useAppSelector(
    (state: RootState) =>
      sortBy(
        state.stm.level3s.filter((level3) => level3.level2Uuid === level2Uuid),
        "numbering"
      ),
    shallowEqual
  );

  return (
    <>
      {level3s.map((level3) => (
        <STMLevel3
          key={level3.uuid}
          level3={level3}
          stmLevel1Enabled={stmLevel1Enabled}
          selectMode={selectMode}
        />
      ))}
    </>
  );
};

const STMLevel3: FunctionComponent<{
  level3: STMLevel3;
  stmLevel1Enabled: boolean;
  selectMode: boolean;
}> = ({ level3, stmLevel1Enabled, selectMode }) => {
  const dispatch = useAppDispatch();
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
