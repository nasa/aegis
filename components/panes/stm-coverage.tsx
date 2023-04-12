import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "./global-pane-styles.module.css";
import stmStyles from "./stm-coverage.module.css";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import "react-tooltip/dist/react-tooltip.css";
import _ from "lodash";
import { Tooltip } from "react-tooltip";
import ReactDOMServer from "react-dom/server";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faToggleOff, faToggleOn } from "@fortawesome/free-solid-svg-icons";

const STM_Panel: FunctionComponent<{
  actions: Action[];
  mini: boolean;
  horizontal: boolean;
  onInvstgHover?: (invstgUUID: string) => void;
  uniqueKey: string;
}> = ({ actions, mini, horizontal, onInvstgHover, uniqueKey }) => {
  const [stmMode, setStmMode] = useState(horizontal);

  //wrap the STM inside a body panel
  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>STM Coverage</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={stmStyles.flipSwitch}>
          Flip
          <FontAwesomeIcon
            icon={stmMode ? faToggleOn : faToggleOff}
            onClick={() => {
              setStmMode(!stmMode);
            }}
          />
        </div>
        <STM_Coverage
          actions={actions}
          mini={mini}
          horizontal={stmMode}
          onInvstgHover={onInvstgHover}
          uniqueKey={uniqueKey}
        />
      </div>
    </div>
  );
};

export const STM_Coverage: FunctionComponent<{
  actions: Action[];
  mini: boolean;
  horizontal: boolean;
  onInvstgHover?: (invstgUUID: string) => void;
  uniqueKey: string;
}> = (props: {
  actions: Action[];
  mini: boolean;
  horizontal: boolean;
  onInvstgHover?: (invstgUUID: string) => void;
  uniqueKey: string;
}) => {
  const allSTMObjectives = useAppSelector((state) => state.stm.objectives, shallowEqual);
  const allSTMGoals = useAppSelector((state) => state.stm.goals, shallowEqual);
  const allSTMInvstgs = useAppSelector((state) => state.stm.investigations, shallowEqual);

  const [invstgs, setInvstgs] = useState<STMInvestigation[]>(null);
  const [highlightedGoals, setHighlightedGoals] = useState<STMGoal[]>(null);
  const [highlightedObjectives, setHighlightedObjectives] = useState<STMObjective[]>(null);

  //get all STM investigations
  useEffect(() => {
    if (props.actions && allSTMInvstgs) {
      const stms: STMInvestigation[] = [];
      //get all stms for actions
      for (const action of props.actions) {
        const stmUuidRefs = action.stmUuidRefs;
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
  }, [props.actions, allSTMInvstgs]);

  //determine highlighted objectives and goals. objectives and goals are highlighted only if all their children are highlighted.
  useEffect(() => {
    if (invstgs && allSTMGoals && allSTMInvstgs && allSTMObjectives) {
      //find all highlighted goals
      const highlightedGoals: STMGoal[] = [];
      for (const goal of allSTMGoals) {
        let goalHighlight: boolean = true;
        const allGoalInvstgs: STMInvestigation[] = allSTMInvstgs.filter(
          (invstg) => invstg.goalUuid === goal.uuid
        );
        //check all investigations for this goal and see if it exists in this station
        for (const invstg of allGoalInvstgs) {
          if (!invstgs.includes(invstg)) {
            goalHighlight = false; //this invstg isn't included, so this goal won't be highlighted. no need to check the rest. break out of the loop
            break;
          }
        }
        if (goalHighlight) highlightedGoals.push(goal);
      }
      setHighlightedGoals(highlightedGoals);

      //find all highlighted objectives
      const highlightedObjectives: STMObjective[] = [];
      for (const objective of allSTMObjectives) {
        let objectiveHighlight: boolean = true;
        const allObjectiveGoals: STMGoal[] = allSTMGoals.filter(
          (goal) => goal.objectiveUuid === objective.uuid
        );
        for (const goal of allObjectiveGoals) {
          if (!highlightedGoals.includes(goal)) {
            objectiveHighlight = false;
            break;
          }
        }
        if (objectiveHighlight) highlightedObjectives.push(objective);
      }
      setHighlightedObjectives(highlightedObjectives);
    }
  }, [invstgs, allSTMGoals, allSTMInvstgs, allSTMObjectives]);

  //build hover tooltip jsx
  function buildSTMTooltip(
    stmUuid: string,
    stmType: "objective" | "goal" | "investigation",
    full: boolean
  ) {
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

  return (
    <>
      {props.mini ? (
        //minified stm
        <div
          className={`${stmStyles.stm_mini} ${
            props.horizontal ? stmStyles.flexRow : stmStyles.flexColumn
          }`}
        >
          {invstgs &&
            allSTMObjectives.map((objective) => {
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
                    id={objective.uuid + props.uniqueKey}
                  >
                    {objective.numbering}
                  </div>
                  <Tooltip
                    anchorId={objective.uuid + props.uniqueKey}
                    html={ReactDOMServer.renderToString(
                      buildSTMTooltip(objective.uuid, "objective", true)
                    )}
                    className={stmStyles.tooltip}
                    events={["hover", "click"]}
                  />
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
                                      }
                                        ${
                                          index === array.length - 1 &&
                                          (props.horizontal
                                            ? stmStyles.investgNumberingRow_miniEnd
                                            : stmStyles.investgNumberingCol_miniEnd)
                                        } ${invstgs?.includes(invstg) && stmStyles.highlight}`}
                                      id={invstg.uuid + props.uniqueKey}
                                    >
                                      &nbsp;
                                    </div>
                                    {props.onInvstgHover ? (
                                      <Tooltip
                                        anchorId={invstg.uuid + props.uniqueKey}
                                        html={ReactDOMServer.renderToString(
                                          buildSTMTooltip(invstg.uuid, "investigation", true)
                                        )}
                                        className={stmStyles.tooltip}
                                        events={["hover", "click"]}
                                        delayShow={100}
                                        afterShow={() => props.onInvstgHover(invstg.uuid)}
                                        afterHide={() => props.onInvstgHover(null)}
                                      />
                                    ) : (
                                      <Tooltip
                                        anchorId={invstg.uuid + props.uniqueKey}
                                        html={ReactDOMServer.renderToString(
                                          buildSTMTooltip(invstg.uuid, "investigation", true)
                                        )}
                                        className={stmStyles.tooltip}
                                        events={["hover", "click"]}
                                      />
                                    )}
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
      ) : (
        //regular (not mini) stm
        <div
          className={`${stmStyles.stm} ${
            props.horizontal ? stmStyles.flexRow : stmStyles.flexColumn
          }`}
        >
          {invstgs &&
            allSTMObjectives.map((objective) => {
              return (
                <div
                  key={objective.uuid}
                  className={`${stmStyles.objective} ${
                    props.horizontal ? stmStyles.flexColumn : stmStyles.flexRow
                  }`}
                >
                  <div
                    className={`${
                      props.horizontal
                        ? stmStyles.objectiveNumberingCol
                        : stmStyles.objectiveNumberingRow
                    } ${highlightedObjectives?.includes(objective) && stmStyles.highlight}`}
                    id={objective.uuid + props.uniqueKey}
                  >
                    {objective.numbering}
                  </div>
                  <Tooltip
                    anchorId={objective.uuid + props.uniqueKey}
                    html={ReactDOMServer.renderToString(
                      buildSTMTooltip(objective.uuid, "objective", false)
                    )}
                    className={stmStyles.tooltip}
                    events={["hover", "click"]}
                  />
                  <div
                    className={`${stmStyles.goalsContainer} ${
                      props.horizontal ? stmStyles.flexRow : stmStyles.flexColumn
                    }`}
                  >
                    {allSTMGoals
                      .filter((goal) => goal.objectiveUuid === objective.uuid)
                      .map((goal) => {
                        return (
                          <div
                            key={goal.uuid}
                            className={`${stmStyles.goal} ${
                              props.horizontal ? stmStyles.flexColumn : stmStyles.flexRow
                            }`}
                          >
                            <div
                              className={`${
                                props.horizontal
                                  ? stmStyles.goalNumberingCol
                                  : stmStyles.goalNumberingRow
                              } ${highlightedGoals?.includes(goal) && stmStyles.highlight}`}
                              id={goal.uuid + props.uniqueKey}
                            >
                              {goal.numbering}
                            </div>
                            <Tooltip
                              anchorId={goal.uuid + props.uniqueKey}
                              html={ReactDOMServer.renderToString(
                                buildSTMTooltip(goal.uuid, "goal", false)
                              )}
                              className={stmStyles.tooltip}
                              events={["hover", "click"]}
                            />
                            <div
                              className={`${stmStyles.invstgsContainer} ${
                                props.horizontal ? stmStyles.flexRow : stmStyles.flexColumn
                              }`}
                            >
                              {allSTMInvstgs
                                .filter((invstg) => invstg.goalUuid === goal.uuid)
                                .map((invstg) => {
                                  return (
                                    <div key={invstg.uuid} className={stmStyles.investigation}>
                                      <div
                                        className={`${
                                          props.horizontal
                                            ? stmStyles.invstgNumberingRow
                                            : stmStyles.invstgNumberingCol
                                        } ${invstgs?.includes(invstg) && stmStyles.highlight}`}
                                        id={invstg.uuid + props.uniqueKey}
                                      >
                                        {invstg.numbering}
                                      </div>
                                      <Tooltip
                                        anchorId={invstg.uuid + props.uniqueKey}
                                        html={ReactDOMServer.renderToString(
                                          buildSTMTooltip(invstg.uuid, "investigation", false)
                                        )}
                                        className={stmStyles.tooltip}
                                        events={["hover", "click"]}
                                        delayShow={props.onInvstgHover ? 100 : 0}
                                        afterShow={() => {
                                          return (
                                            props.onInvstgHover && props.onInvstgHover(invstg.uuid)
                                          );
                                        }}
                                        afterHide={() => {
                                          return props.onInvstgHover && props.onInvstgHover(null);
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </>
  );
};
export default STM_Panel;
