import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "./global-pane-styles.module.css";
import stmStyles from "./stm-coverage.module.css";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import "react-tooltip/dist/react-tooltip.css";
import _ from "lodash";
import { Tooltip } from "react-tooltip";
import ReactDOMServer from "react-dom/server";

const STM_Panel: FunctionComponent<{ actions: Action[] }> = (props: { actions: Action[] }) => {
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
  function buildSTMTooltip(stmUuid: string, stmType: "objective" | "goal" | "investigation") {
    let stmName: string = "";
    let stmNumbering: string = "";

    if (stmType === "objective") {
      const objective = allSTMObjectives.find((eachObj) => eachObj.uuid === stmUuid);
      stmNumbering = "Objective " + objective.numbering;
      stmName = objective.name;
    } else if (stmType === "goal") {
      const goal = allSTMGoals.find((eachGoal) => eachGoal.uuid === stmUuid);
      const objective = allSTMObjectives.find((eachObj) => eachObj.uuid === goal.objectiveUuid);
      stmNumbering = "Goal " + objective.numbering + goal.numbering;
      stmName = goal.name;
    } else if (stmType === "investigation") {
      const invstg = allSTMInvstgs.find((eachInvstg) => eachInvstg.uuid === stmUuid);
      const goal = allSTMGoals.find((eachGoal) => eachGoal.uuid === invstg.goalUuid);
      const objective = allSTMObjectives.find((eachObj) => eachObj.uuid === goal.objectiveUuid);
      stmNumbering =
        "Investigation " + objective.numbering + goal.numbering + "-" + invstg.numbering;
      stmName = invstg.name;
    }

    return (
      <div key={"tooltip_" + stmUuid}>
        <b>{stmNumbering}</b> - {stmName}
      </div>
    );
  }

  return (
    <div className={paneStyles.rightBody}>
      <div className={`${paneStyles.rightBodyTitle}`}>STM Coverage</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={stmStyles.stm}>
          {invstgs &&
            allSTMObjectives.map((objective) => {
              return (
                <div key={objective.uuid} className={stmStyles.objective}>
                  <div
                    className={`${stmStyles.objectiveNumbering} ${
                      highlightedObjectives?.includes(objective) && stmStyles.highlight
                    }`}
                    id={objective.uuid}
                  >
                    {objective.numbering}
                  </div>
                  <Tooltip
                    anchorId={objective.uuid}
                    html={ReactDOMServer.renderToString(
                      buildSTMTooltip(objective.uuid, "objective")
                    )}
                    className={stmStyles.tooltip}
                    events={["hover", "click"]}
                  />
                  <div className={stmStyles.goalsContainer}>
                    {allSTMGoals
                      .filter((goal) => goal.objectiveUuid === objective.uuid)
                      .map((goal) => {
                        return (
                          <div key={goal.uuid} className={stmStyles.goal}>
                            <div
                              className={`${stmStyles.goalNumbering} ${
                                highlightedGoals?.includes(goal) && stmStyles.highlight
                              }`}
                              id={goal.uuid}
                            >
                              {goal.numbering}
                            </div>
                            <Tooltip
                              anchorId={goal.uuid}
                              html={ReactDOMServer.renderToString(
                                buildSTMTooltip(goal.uuid, "goal")
                              )}
                              className={stmStyles.tooltip}
                              events={["hover", "click"]}
                            />
                            <div className={stmStyles.invstgsContainer}>
                              {allSTMInvstgs
                                .filter((invstg) => invstg.goalUuid === goal.uuid)
                                .map((invstg) => {
                                  return (
                                    <div key={invstg.uuid} className={stmStyles.investigation}>
                                      <div
                                        className={`${stmStyles.invstgNumbering} ${
                                          invstgs?.includes(invstg) && stmStyles.highlight
                                        }`}
                                        id={invstg.uuid}
                                      >
                                        {invstg.numbering}
                                      </div>
                                      <Tooltip
                                        anchorId={invstg.uuid}
                                        html={ReactDOMServer.renderToString(
                                          buildSTMTooltip(invstg.uuid, "investigation")
                                        )}
                                        className={stmStyles.tooltip}
                                        events={["hover", "click"]}
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
      </div>
    </div>
  );
};

export default STM_Panel;
