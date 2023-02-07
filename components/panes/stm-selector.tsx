import CheckboxTree, { Node } from "react-checkbox-tree";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import stmStyles from "./stm-selector.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight, faCheckSquare } from "@fortawesome/free-solid-svg-icons";
import "react-checkbox-tree/lib/react-checkbox-tree.css";
import { faSquare, faSquareMinus } from "@fortawesome/free-regular-svg-icons";

const STMSelector: FunctionComponent<{
  editMode: boolean;
  action: Action;
  onSTMChange: Function;
}> = ({ editMode, action, onSTMChange: onChange }) => {
  const allSTMObjectives: STMObjective[] = useAppSelector(
    (state) => state.stm.objectives,
    shallowEqual
  );
  const allSTMGoals: STMGoal[] = useAppSelector((state) => state.stm.goals, shallowEqual);
  const allSTMInvstgs: STMInvestigation[] = useAppSelector(
    (state) => state.stm.investigations,
    shallowEqual
  );

  const [expanded, setExpanded] = useState<string[]>([]); //array of values at the parent levels that are expanded
  const [stmTreeNodes, setStmTreeNodes] = useState<Node[]>([]);

  //build the stm tree
  useEffect(() => {
    if (allSTMInvstgs?.length > 0 && allSTMGoals && allSTMInvstgs) {
      const stmTree: Node[] = [];
      for (const objective of allSTMObjectives) {
        const objectiveNode: Node = {
          value: objective.uuid,
          label: (
            <>
              <b>Objective {objective.numbering}</b> - {objective.name}
            </>
          ),
          className: `${stmStyles.stmText}`,
          children: [],
          title: objective.name,
        };
        const objGoals: STMGoal[] = allSTMGoals.filter(
          (goal) => goal.objectiveUuid === objective.uuid
        );
        const objChildren: Node[] = [];
        for (const goal of objGoals) {
          const goalNode: Node = {
            value: goal.uuid,
            label: (
              <>
                <b>
                  Goal {objective.numbering}
                  {goal.numbering}
                </b>{" "}
                - {goal.name}
              </>
            ),
            className: `${stmStyles.stmText}`,
            children: [],
            title: goal.name,
          };
          const goalInvstg: STMInvestigation[] = allSTMInvstgs.filter(
            (invstg) => invstg.goalUuid === goal.uuid
          );
          const goalChildren: Node[] = [];
          for (const invstg of goalInvstg) {
            const invstgNode: Node = {
              value: invstg.uuid,
              label: (
                <>
                  <b>
                    Investigation {objective.numbering}
                    {goal.numbering}-{invstg.numbering}
                  </b>{" "}
                  - {invstg.name}
                </>
              ),
              className: `${stmStyles.stmText}`,
              title: invstg.name,
            };
            goalChildren.push(invstgNode);
          }
          goalNode.children = goalChildren;
          objChildren.push(goalNode);
        }
        objectiveNode.children = objChildren;
        stmTree.push(objectiveNode);
      }
      setStmTreeNodes(stmTree);
    }
  }, [allSTMInvstgs, allSTMGoals, allSTMObjectives]);

  //build the full numbering for an investigation that includes objective and goal
  function getInvstgNumbering(invstgUUID: string): string {
    const invstg = allSTMInvstgs.find((eachInvstg) => eachInvstg.uuid === invstgUUID);
    const goal = allSTMGoals.find((eachGoal) => eachGoal.uuid === invstg.goalUuid);
    const objective = allSTMObjectives.find((eachObj) => eachObj.uuid === goal.objectiveUuid);

    return `${objective.numbering}${goal.numbering}-${invstg.numbering}`;
  }

  return (
    <>
      {editMode ? (
        <div>
          <CheckboxTree
            nodes={stmTreeNodes}
            checked={action.stmUuidRefs || []}
            expanded={expanded}
            onCheck={(checked: string[]) => onChange(checked)}
            onExpand={(expanded) => setExpanded(expanded)}
            showNodeIcon={false}
            expandOnClick={true}
            onClick={() => {}}
            icons={{
              expandClose: <FontAwesomeIcon className="rct-icon" icon={faCaretRight} />,
              expandOpen: <FontAwesomeIcon className="rct-icon" icon={faCaretDown} />,
              check: (
                <FontAwesomeIcon
                  className={`${stmStyles.highlight} rct-icon`}
                  icon={faCheckSquare}
                />
              ),
              uncheck: <FontAwesomeIcon className="rct-icon" icon={faSquare} />,
              halfCheck: <FontAwesomeIcon className="rct-icon" icon={faSquareMinus} />,
            }}
          />
        </div>
      ) : (
        <div className={stmStyles.stmText}>
          {action.stmUuidRefs
            ? action.stmUuidRefs.map((invstgUuid, index, array) => {
                const numbering = getInvstgNumbering(invstgUuid);
                return (
                  <div key={invstgUuid} className={stmStyles.stmItem}>
                    {numbering}
                    {index === array.length - 1 ? "" : ","}&nbsp;
                  </div>
                );
              })
            : "None"}
        </div>
      )}
    </>
  );
};

export default STMSelector;
