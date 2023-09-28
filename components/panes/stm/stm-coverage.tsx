import { FunctionComponent, useEffect, useState } from "react";
import stmStyles from "./stm-coverage.module.css";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import _ from "lodash";
import ReactDOMServer from "react-dom/server";

export const STM_Coverage: FunctionComponent<{
  stmUuidRefs: string[][]; //2d array of action stmUuidRefs
  mini: boolean;
  horizontal: boolean;
  onInvstgHover?: (invstgUUID: string) => void;
  stmUuidRefsCompleted?: string[][]; //used in rex mode
  stmUuidRefsInProgress?: string[][]; //used in rex mode
}> = (props: {
  stmUuidRefs: string[][];
  mini: boolean;
  horizontal: boolean;
  onInvstgHover?: (invstgUUID: string) => void;
  stmUuidRefsCompleted?: string[][];
  stmUuidRefsInProgress?: string[][];
}) => {
  const allSTMObjectives = useAppSelector((state) => state.stm.objectives, shallowEqual);
  const allSTMGoals = useAppSelector((state) => state.stm.goals, shallowEqual);
  const allSTMInvstgs = useAppSelector((state) => state.stm.investigations, shallowEqual);

  const [invstgs, setInvstgs] = useState<STMInvestigation[]>(null);
  const [completedInvstgUuids, setCompletedInvstgUuids] = useState<string[]>([]);
  const [inProgressInvstgUuids, setInProgressInvstgUuids] = useState<string[]>([]);

  //get all STM investigations
  useEffect(() => {
    if (props.stmUuidRefs && allSTMInvstgs) {
      const stms: STMInvestigation[] = [];
      //get all stms for actions
      for (const stmUuidRefs of props.stmUuidRefs) {
        if (!stmUuidRefs || stmUuidRefs.length === 0) {
          continue; //no referenced uuids. skip to next action
        } else {
          //loop through all uuids and find the stm investigation
          for (const stmUuidRef of stmUuidRefs) {
            const invstg = allSTMInvstgs.find((investigation) => investigation.uuid === stmUuidRef);
            if (invstg) stms.push(invstg);
          }
        }
      }
      //filter unique and sort
      setInvstgs(_.uniqBy(stms, "uuid"));
    }
  }, [props.stmUuidRefs, allSTMInvstgs]);

  //get all in progress stm investigations uuids
  useEffect(() => {
    if (props.stmUuidRefsInProgress) {
      let stms: string[] = [];
      //get all stms for actions
      for (const stmUuidRefs of props.stmUuidRefsInProgress) {
        if (!stmUuidRefs || stmUuidRefs.length === 0) {
          continue; //no referenced uuids. skip to next action
        } else {
          stms = stms.concat(stmUuidRefs);
        }
      }
      //filter unique and sort
      setInProgressInvstgUuids(_.uniq(stms));
    }
  }, [props.stmUuidRefsInProgress]);

  //get all completed stm investigations uuids
  useEffect(() => {
    if (props.stmUuidRefsCompleted) {
      let stms: string[] = [];
      //get all stms for actions
      for (const stmUuidRefs of props.stmUuidRefsCompleted) {
        if (!stmUuidRefs || stmUuidRefs.length === 0) {
          continue; //no referenced uuids. skip to next action
        } else {
          stms = stms.concat(stmUuidRefs);
        }
      }
      //filter unique and sort
      setCompletedInvstgUuids(_.uniq(stms));
    }
  }, [props.stmUuidRefsCompleted]);

  //build hover tooltip jsx
  function buildSTMTooltip(stmUuid: string, stmType: string, full: boolean) {
    let toolTip: JSX.Element;

    if (stmType === "objective") {
      const objective = allSTMObjectives.find((eachObj) => eachObj.uuid === stmUuid);
      toolTip = (
        <div key={"tooltip_" + stmUuid}>
          <b>{"Objective " + objective.numbering}</b> - {objective.name}
        </div>
      );
    } else if (stmType === "goal") {
      const goal = allSTMGoals.find((eachGoal) => eachGoal.uuid === stmUuid);
      const objective = allSTMObjectives.find((eachObj) => eachObj.uuid === goal.objectiveUuid);
      if (full) {
        toolTip = (
          <div key={"tooltip_" + goal.uuid}>
            <b>Objective {objective.numbering}</b> - {objective.name}
            <br />
            <b>
              Goal {objective.numbering}
              {goal.numbering}
            </b>
            - {goal.name}
          </div>
        );
      } else {
        toolTip = (
          <div key={"tooltip_" + stmUuid}>
            <b>{"Goal " + objective.numbering + goal.numbering}</b> - {goal.name}
          </div>
        );
      }
    } else if (stmType === "investigation") {
      const invstg = allSTMInvstgs.find((eachInvstg) => eachInvstg.uuid === stmUuid);
      const goal = allSTMGoals.find((eachGoal) => eachGoal.uuid === invstg.goalUuid);
      const objective = allSTMObjectives.find((eachObj) => eachObj.uuid === goal.objectiveUuid);
      if (full) {
        toolTip = (
          <div key={"tooltip_" + goal.uuid}>
            <b>Objective {objective.numbering}</b> - {objective.name}
            <br />
            <b>
              Goal {objective.numbering}
              {goal.numbering}
            </b>
            - {goal.name}
            <br />
            <b>
              Investigation {objective.numbering}
              {goal.numbering}-{invstg.numbering}
            </b>
            - {invstg.name}
          </div>
        );
      } else {
        toolTip = (
          <div key={"tooltip_" + stmUuid}>
            <b>
              {"Investigation " + objective.numbering + goal.numbering + "-" + invstg.numbering}
            </b>{" "}
            - {invstg.name}
          </div>
        );
      }
    }

    return toolTip;
  }

  function handleHover(uuid: string) {
    if (!props.onInvstgHover) return;
    props.onInvstgHover(uuid);
  }

  return (
    <>
      <div
        className={`${stmStyles.stm_mini} ${
          props.horizontal ? stmStyles.stmHorizontal_mini : stmStyles.stmVertical_mini
        }`}
      >
        {invstgs &&
          allSTMObjectives.map((objective) => {
            const tooltipString = ReactDOMServer.renderToStaticMarkup(
              buildSTMTooltip(objective.uuid, "objective", true)
            );
            return (
              <div
                key={objective.uuid}
                className={`${stmStyles.objective_mini} ${
                  props.horizontal ? stmStyles.flexRow : stmStyles.flexColumn
                }`}
              >
                <div
                  className={`${
                    props.horizontal
                      ? stmStyles.objectiveNumberingCol_mini
                      : stmStyles.objectiveNumberingRow_mini
                  }`}
                  data-tooltip-id="aegis-tooltip"
                  data-tooltip-html={tooltipString}
                >
                  {objective.numbering}
                </div>
                <div
                  className={`${stmStyles.goalsContainer_mini} ${
                    props.horizontal ? stmStyles.flexRow : stmStyles.flexColumn
                  }`}
                >
                  {allSTMGoals
                    .filter((goal) => goal.objectiveUuid === objective.uuid)
                    .map((goal) => {
                      return (
                        <div
                          key={goal.uuid}
                          className={`${stmStyles.invstgsContainer} ${
                            props.horizontal ? stmStyles.flexRow : stmStyles.flexColumn
                          }`}
                        >
                          {allSTMInvstgs
                            .filter((invstg) => invstg.goalUuid === goal.uuid)
                            .map((invstg, index, array) => {
                              const tooltipString = ReactDOMServer.renderToStaticMarkup(
                                buildSTMTooltip(invstg.uuid, "investigation", true)
                              );
                              return (
                                <div key={invstg.uuid}>
                                  <div
                                    className={`${
                                      props.horizontal
                                        ? stmStyles.invstgNumberingRow_mini
                                        : stmStyles.invstgNumberingCol_mini
                                    } ${
                                      index === 0 &&
                                      (props.horizontal
                                        ? stmStyles.invstgNumberingRow_miniStart
                                        : stmStyles.invstgNumberingCol_miniStart)
                                    } ${
                                      index === array.length - 1 &&
                                      (props.horizontal
                                        ? stmStyles.investgNumberingRow_miniEnd
                                        : stmStyles.investgNumberingCol_miniEnd)
                                    } ${invstgs?.includes(invstg) && stmStyles.highlight}
                                    ${
                                      completedInvstgUuids?.includes(invstg.uuid) &&
                                      stmStyles.rexCompleted
                                    }
                                    ${
                                      inProgressInvstgUuids?.includes(invstg.uuid) &&
                                      !completedInvstgUuids?.includes(invstg.uuid) &&
                                      stmStyles.rexInProgress
                                    }`}
                                    data-tooltip-id="aegis-tooltip"
                                    data-tooltip-html={tooltipString}
                                    onMouseOver={() => {
                                      handleHover(invstg.uuid);
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
