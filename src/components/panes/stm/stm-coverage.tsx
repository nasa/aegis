import type { FunctionComponent } from "react";
import stmStyles from "./stm-coverage.module.css";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
import uniqBy from "lodash/uniqBy";
import uniq from "lodash/uniq";
import ReactDOMServer from "react-dom/server";
import { useMissionDocSelector } from "utils/useDocSelector";

export const STM_Coverage: FunctionComponent<{
  stmUuidsByActionUuid: string[][]; //2d array of stm uuids by action uuid
  horizontal: boolean;
  onLevel3Hover?: (level3Uuid: string) => void;
  completedStmUuidsByAction?: string[][]; //used in rex mode
  inProgressStmUuidsByAction?: string[][]; //used in rex mode
}> = ({
  stmUuidsByActionUuid,
  horizontal,
  onLevel3Hover,
  completedStmUuidsByAction,
  inProgressStmUuidsByAction,
}) => {
  const allSTMLevel1 = useAppSelector((state) => state.stm.level1s, deepEqual);
  const allSTMLevel2 = useAppSelector((state) => state.stm.level2s, deepEqual);
  const allSTMLevel3 = useAppSelector((state) => state.stm.level3s, deepEqual);
  const partialMission = useMissionDocSelector(
    (doc) => ({
      stmLevel1Name: doc.stmLevel1Name,
      stmLevel2Name: doc.stmLevel2Name,
      stmLevel3Name: doc.stmLevel3Name,
      stmLevel1Enabled: doc.stmLevel1Enabled,
    }),
    deepEqual
  );

  //get all STM level3s
  const stms3s: STMLevel3[] = [];
  //get all stms for actions
  if (stmUuidsByActionUuid) {
    for (const stmUuids of stmUuidsByActionUuid) {
      if (!stmUuids || stmUuids.length === 0) {
        continue; //no referenced uuids. skip to next action
      } else {
        //loop through all uuids and find the stm level3
        for (const stmUuid of stmUuids) {
          const level3 = allSTMLevel3?.find((level3) => level3.uuid === stmUuid);
          if (level3) stms3s.push(level3);
        }
      }
    }
  }
  //filter unique and sort
  const level3s = uniqBy(stms3s, "uuid");

  //get all in progress stm level3s uuids

  let stmsInPrg: string[] = [];
  //get all stms for actions
  if (inProgressStmUuidsByAction) {
    for (const stmUuids of inProgressStmUuidsByAction) {
      if (!stmUuids || stmUuids.length === 0) {
        continue; //no referenced uuids. skip to next action
      } else {
        stmsInPrg = stmsInPrg.concat(stmUuids);
      }
    }
  }
  //filter unique and sort
  const inProgressLevel3Uuids = uniq(stmsInPrg);

  //get all completed stm level3s uuids
  let stmsCompleted: string[] = [];
  //get all stms for actions
  if (completedStmUuidsByAction) {
    for (const stmUuids of completedStmUuidsByAction) {
      if (!stmUuids || stmUuids.length === 0) {
        continue; //no referenced uuids. skip to next action
      } else {
        stmsCompleted = stmsCompleted.concat(stmUuids);
      }
    }
  }
  //filter unique and sort
  const completedLevel3Uuids = uniq(stmsCompleted);

  //build hover tooltip jsx
  function buildSTMTooltip(stmUuid: string, stmType: string, full: boolean) {
    let toolTip: JSX.Element;

    if (stmType === "level1") {
      const level1 = allSTMLevel1.find((eachObj) => eachObj.uuid === stmUuid);
      toolTip = (
        <div key={"tooltip_" + stmUuid}>
          <b>{`${partialMission?.stmLevel1Name} ` + level1.numbering}</b> - {level1.name}
        </div>
      );
    } else if (stmType === "level2") {
      const level2 = allSTMLevel2.find((eachLevel2) => eachLevel2.uuid === stmUuid);
      const level1 = allSTMLevel1.find((eachLevel1) => eachLevel1.uuid === level2.level1Uuid);
      if (full) {
        toolTip = (
          <div key={"tooltip_" + level2.uuid}>
            <b>{`${partialMission?.stmLevel2Name} ` + level1.numbering}</b> - {level1.name}
            <br />
            <b>
              {`${partialMission?.stmLevel2Name} ` + level1.numbering}
              {level2.numbering}
            </b>
            - {level2.name}
          </div>
        );
      } else {
        toolTip = (
          <div key={"tooltip_" + stmUuid}>
            <b>{`${partialMission?.stmLevel2Name} ` + level1.numbering + level2.numbering}</b> -{" "}
            {level2.name}
          </div>
        );
      }
    } else if (stmType === "level3") {
      const level3 = allSTMLevel3.find((eachLevel3) => eachLevel3.uuid === stmUuid);
      const level2 = allSTMLevel2.find((eachLevel2) => eachLevel2.uuid === level3.level2Uuid);
      const level1 = allSTMLevel1.find((eachLevel1) => eachLevel1.uuid === level2.level1Uuid);
      if (full) {
        toolTip = (
          <div key={"tooltip_" + level2.uuid}>
            {partialMission?.stmLevel1Enabled && (
              <>
                <div>
                  <b>
                    {partialMission?.stmLevel1Name} {level1.numbering}
                  </b>{" "}
                  - {level1.name}
                </div>
                <br />
              </>
            )}
            <b>
              {partialMission?.stmLevel2Name} {partialMission?.stmLevel1Enabled && level1.numbering}
              {level2.numbering}{" "}
            </b>
            - {level2.name}
            <br />
            <b>
              {partialMission?.stmLevel3Name} {partialMission?.stmLevel1Enabled && level1.numbering}
              {level2.numbering}-{level3.numbering}
            </b>
            - {level3.name}
          </div>
        );
      } else {
        toolTip = (
          <div key={"tooltip_" + stmUuid}>
            <b>
              {partialMission?.stmLevel3Name +
                (partialMission?.stmLevel1Enabled && level1.numbering) +
                level2.numbering +
                "-" +
                level3.numbering}
            </b>{" "}
            - {level3.name}
          </div>
        );
      }
    }

    return toolTip;
  }

  function handleHover(uuid: string) {
    if (!onLevel3Hover) return;
    onLevel3Hover(uuid);
  }

  return (
    <>
      <div
        className={`${stmStyles.stm_mini} ${
          horizontal ? stmStyles.stmHorizontal_mini : stmStyles.stmVertical_mini
        }`}
      >
        {level3s &&
          allSTMLevel1.map((level1) => {
            const tooltipString = ReactDOMServer.renderToStaticMarkup(
              buildSTMTooltip(level1.uuid, "level1", true)
            );
            return (
              <div
                key={level1.uuid}
                className={`${stmStyles.level1_mini} ${
                  horizontal ? stmStyles.flexRow : stmStyles.flexColumn
                }`}
              >
                {partialMission?.stmLevel1Enabled && (
                  <div
                    className={`${
                      horizontal
                        ? stmStyles.level1NumberingCol_mini
                        : stmStyles.level1NumberingRow_mini
                    }`}
                    data-tooltip-id="aegis-tooltip"
                    data-tooltip-html={tooltipString}
                  >
                    {level1.numbering}
                  </div>
                )}
                <div
                  className={`${stmStyles.goalsContainer_mini} ${
                    horizontal ? stmStyles.flexRow : stmStyles.flexColumn
                  }`}
                >
                  {allSTMLevel2
                    .filter((goal) => goal.level1Uuid === level1.uuid)
                    .map((goal) => {
                      return (
                        <div
                          key={goal.uuid}
                          className={`${stmStyles.level3sContainer} ${
                            horizontal ? stmStyles.flexRow : stmStyles.flexColumn
                          }`}
                        >
                          {allSTMLevel3
                            .filter((level3) => level3.level2Uuid === goal.uuid)
                            .map((level3, index, array) => {
                              const tooltipString = ReactDOMServer.renderToStaticMarkup(
                                buildSTMTooltip(level3.uuid, "level3", true)
                              );
                              return (
                                <div key={level3.uuid}>
                                  <div
                                    className={`${
                                      horizontal
                                        ? stmStyles.level3NumberingRow_mini
                                        : stmStyles.level3NumberingCol_mini
                                    } ${
                                      index === 0 &&
                                      (horizontal
                                        ? stmStyles.level3NumberingRow_miniStart
                                        : stmStyles.level3NumberingCol_miniStart)
                                    } ${
                                      index === array.length - 1 &&
                                      (horizontal
                                        ? stmStyles.level3NumberingRow_miniEnd
                                        : stmStyles.level3NumberingCol_miniEnd)
                                    } ${level3s?.includes(level3) && stmStyles.highlight}
                                    ${
                                      completedLevel3Uuids?.includes(level3.uuid) &&
                                      stmStyles.rexCompleted
                                    }
                                    ${
                                      inProgressLevel3Uuids?.includes(level3.uuid) &&
                                      !completedLevel3Uuids?.includes(level3.uuid) &&
                                      stmStyles.rexInProgress
                                    }`}
                                    data-tooltip-id="aegis-tooltip"
                                    data-tooltip-html={tooltipString}
                                    onMouseOver={() => {
                                      handleHover(level3.uuid);
                                    }}
                                    onMouseOut={() => {
                                      handleHover(null);
                                    }}
                                  >
                                    &nbsp;
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
};
export default STM_Coverage;
