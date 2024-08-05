import { FunctionComponent } from "react";
import stmStyles from "./stm-coverage.module.css";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
import _ from "lodash";
import ReactDOMServer from "react-dom/server";

export const STM_Coverage: FunctionComponent<{
  stmUuidRefs: string[][]; //2d array of action stmUuidRefs
  horizontal: boolean;
  onLevel3Hover?: (level3Uuid: string) => void;
  stmUuidRefsCompleted?: string[][]; //used in rex mode
  stmUuidRefsInProgress?: string[][]; //used in rex mode
}> = ({ stmUuidRefs, horizontal, onLevel3Hover, stmUuidRefsCompleted, stmUuidRefsInProgress }) => {
  const allSTMLevel1 = useAppSelector((state) => state.stm.level1s, deepEqual);
  const allSTMLevel2 = useAppSelector((state) => state.stm.level2s, deepEqual);
  const allSTMLevel3 = useAppSelector((state) => state.stm.level3s, deepEqual);
  const mission = useAppSelector((state) => state.mission.mission, deepEqual);

  //get all STM level3s
  const stms3s: STMLevel3[] = [];
  //get all stms for actions
  if (stmUuidRefs) {
    for (const stmUuidRefsSingle of stmUuidRefs) {
      if (!stmUuidRefsSingle || stmUuidRefsSingle.length === 0) {
        continue; //no referenced uuids. skip to next action
      } else {
        //loop through all uuids and find the stm level3
        for (const stmUuidRef of stmUuidRefsSingle) {
          const level3 = allSTMLevel3?.find((level3) => level3.uuid === stmUuidRef);
          if (level3) stms3s.push(level3);
        }
      }
    }
  }
  //filter unique and sort
  const level3s = _.uniqBy(stms3s, "uuid");

  //get all in progress stm level3s uuids

  let stmsInPrg: string[] = [];
  //get all stms for actions
  if (stmUuidRefsInProgress) {
    for (const stmUuidRefs of stmUuidRefsInProgress) {
      if (!stmUuidRefs || stmUuidRefs.length === 0) {
        continue; //no referenced uuids. skip to next action
      } else {
        stmsInPrg = stmsInPrg.concat(stmUuidRefs);
      }
    }
  }
  //filter unique and sort
  const inProgressLevel3Uuids = _.uniq(stmsInPrg);

  //get all completed stm level3s uuids
  let stmsCmplt: string[] = [];
  //get all stms for actions
  if (stmUuidRefsCompleted) {
    for (const stmUuidRefs of stmUuidRefsCompleted) {
      if (!stmUuidRefs || stmUuidRefs.length === 0) {
        continue; //no referenced uuids. skip to next action
      } else {
        stmsCmplt = stmsCmplt.concat(stmUuidRefs);
      }
    }
  }
  //filter unique and sort
  const completedLevel3Uuids = _.uniq(stmsCmplt);

  //build hover tooltip jsx
  function buildSTMTooltip(stmUuid: string, stmType: string, full: boolean) {
    let toolTip: JSX.Element;

    if (stmType === "level1") {
      const level1 = allSTMLevel1.find((eachObj) => eachObj.uuid === stmUuid);
      toolTip = (
        <div key={"tooltip_" + stmUuid}>
          <b>{`${mission?.stmLevel1Name} ` + level1.numbering}</b> - {level1.name}
        </div>
      );
    } else if (stmType === "level2") {
      const level2 = allSTMLevel2.find((eachLevel2) => eachLevel2.uuid === stmUuid);
      const level1 = allSTMLevel1.find((eachLevel1) => eachLevel1.uuid === level2.level1Uuid);
      if (full) {
        toolTip = (
          <div key={"tooltip_" + level2.uuid}>
            <b>{`${mission?.stmLevel2Name} ` + level1.numbering}</b> - {level1.name}
            <br />
            <b>
              {`${mission?.stmLevel2Name} ` + level1.numbering}
              {level2.numbering}
            </b>
            - {level2.name}
          </div>
        );
      } else {
        toolTip = (
          <div key={"tooltip_" + stmUuid}>
            <b>{`${mission?.stmLevel2Name} ` + level1.numbering + level2.numbering}</b> -{" "}
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
            {mission?.stmLevel1Enabled && (
              <>
                <div>
                  <b>
                    {mission?.stmLevel1Name} {level1.numbering}
                  </b>{" "}
                  - {level1.name}
                </div>
                <br />
              </>
            )}
            <b>
              {mission?.stmLevel2Name} {mission?.stmLevel1Enabled && level1.numbering}
              {level2.numbering}{" "}
            </b>
            - {level2.name}
            <br />
            <b>
              {mission?.stmLevel3Name} {mission?.stmLevel1Enabled && level1.numbering}
              {level2.numbering}-{level3.numbering}
            </b>
            - {level3.name}
          </div>
        );
      } else {
        toolTip = (
          <div key={"tooltip_" + stmUuid}>
            <b>
              {mission?.stmLevel3Name +
                (mission?.stmLevel1Enabled && level1.numbering) +
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
                {mission?.stmLevel1Enabled && (
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
