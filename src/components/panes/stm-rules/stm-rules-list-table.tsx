import { FunctionComponent } from "react";
import styles from "./stm-rules-list-table.module.css";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { RootState } from "store";
import _ from "lodash";
import STMRules from "./stm-rules-rules";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";
import { faSquarePlus } from "@fortawesome/free-solid-svg-icons";
import { thunkCreateStmRule } from "store/thunk/thunkStmRules";

const STMRulesTable: FunctionComponent = () => {
  const level1s = useAppSelector(
    (state: RootState) => _.sortBy(state.stm.level1s, "numbering"),
    shallowEqual
  );

  return (
    <div className={styles.stmTables}>
      {level1s.map((level1, l1index) => (
        <STMLevel1 key={level1.uuid} level1={level1} index={l1index} />
      ))}
    </div>
  );
};

export default STMRulesTable;

const STMLevel1: FunctionComponent<{ level1: STMLevel1; index: number }> = ({ level1 }) => {
  const numLevel3s = useAppSelector((state: RootState) => {
    const level2s = state.stm.level2s.filter((level2) => level2.level1Uuid === level1.uuid);
    const level3s = state.stm.level3s.filter((level3) =>
      level2s.some((level2) => level2.uuid === level3.level2Uuid)
    );
    return level3s.length;
  }, refEqual);
  const stmViewExpandTopTiers = useAppSelector(
    (state: RootState) => state.interface.stmViewExpandTopTiers,
    refEqual
  );
  const stmLevel1Enabled = useAppSelector(
    (state: RootState) => state.mission.mission.stmLevel1Enabled,
    deepEqual
  );

  const numLines = numLevel3s;
  const maxHeightEm = 1.2 * numLines;
  return (
    <div className={styles.table}>
      {stmLevel1Enabled ? (
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
            {`${level1.numbering}.`}
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
      ) : (
        <div>
          <STMLevel2s level1Uuid={level1.uuid} />
        </div>
      )}
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
    shallowEqual
  );
  const stmViewExpandTopTiers = useAppSelector(
    (state: RootState) => state.interface.stmViewExpandTopTiers,
    refEqual
  );

  return (
    <>
      {level2s.map((level2) => {
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
              <div className={styles.gridCellLevel2Name}>{level2.name}</div>
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

export const STMLevel3s: FunctionComponent<{
  level2Uuid: string;
}> = ({ level2Uuid }) => {
  const level3s = useAppSelector(
    (state: RootState) =>
      _.sortBy(
        state.stm.level3s.filter((level3) => level3.level2Uuid === level2Uuid),
        "numbering"
      ),
    shallowEqual
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
  }, refEqual);
  const level2Numbering = useAppSelector(
    (state: RootState) =>
      state.stm.level2s.find((level2) => level2.uuid === level3.level2Uuid)?.numbering || "",
    refEqual
  );
  const stmLevel1Enabled = useAppSelector(
    (state: RootState) => state.mission.mission.stmLevel1Enabled,
    refEqual
  );
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
        <div
          className={styles.gridCellLevel3Ordinal}
        >{`${stmLevel1Enabled ? level1Numbering : ""}${level2Numbering.toLocaleUpperCase()}${level3.numbering}`}</div>
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
