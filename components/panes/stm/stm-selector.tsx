import CheckboxTree, { Node } from "react-checkbox-tree";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import stmStyles from "./stm-selector.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight, faCheckSquare } from "@fortawesome/free-solid-svg-icons";
import "react-checkbox-tree/lib/react-checkbox-tree.css";
import { faSquare, faSquareMinus } from "@fortawesome/free-regular-svg-icons";
import { STM_Coverage } from "./stm-coverage";

const STMSelector: FunctionComponent<{
  editMode: boolean;
  stmUuidRefs: string[];
  onSTMChange: Function;
}> = ({ editMode, stmUuidRefs, onSTMChange }) => {
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
      // build the expanded list to include all nodes so expanded by default
      const newExpandedList: string[] = [];
      const stmTree: Node[] = [];
      for (const objective of allSTMObjectives) {
        newExpandedList.push(objective.uuid);
        const objectiveNode: Node = {
          value: objective.uuid,
          label: (
            <>
              <span className={stmStyles.stmHeading}>Objective {objective.numbering}</span> -{" "}
              <span data-tooltip-id="aegis-tooltip" data-tooltip-html={objective.name}>
                {objective.name}
              </span>
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
          newExpandedList.push(goal.uuid);
          const goalNode: Node = {
            value: goal.uuid,
            label: (
              <>
                <span className={stmStyles.stmHeading}>
                  Goal {objective.numbering}
                  {goal.numbering}
                </span>{" "}
                -{" "}
                <span data-tooltip-id="aegis-tooltip" data-tooltip-html={goal.name}>
                  {goal.name}
                </span>
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
            newExpandedList.push(invstg.uuid);
            const invstgNode: Node = {
              value: invstg.uuid,
              label: (
                <>
                  <span className={stmStyles.stmHeading}>
                    Investigation {objective.numbering}
                    {goal.numbering}-{invstg.numbering}
                  </span>{" "}
                  -{" "}
                  <span data-tooltip-id="aegis-tooltip" data-tooltip-html={invstg.name}>
                    {invstg.name}
                  </span>
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
      setStmTreeNodes([
        {
          value: "root",
          label: <span className={stmStyles.stmHeading}>All STM Items</span>,
          children: stmTree,
          className: `${stmStyles.stmText}`,
        } as Node,
      ]);

      setExpanded(newExpandedList);
    }
  }, [allSTMInvstgs, allSTMGoals, allSTMObjectives]);

  return (
    <>
      {editMode ? (
        <CheckboxTree
          nodes={stmTreeNodes}
          checked={stmUuidRefs || []}
          expanded={expanded}
          onCheck={(checked: string[]) => onSTMChange(checked)}
          onExpand={(expanded) => setExpanded(expanded)}
          showNodeIcon={false}
          onClick={(onCheckNode) => {
            let newStmUuidRefs: string[] = [];
            if (stmUuidRefs && stmUuidRefs.includes(onCheckNode.value)) {
              const uuidsToRemove: string[] = [onCheckNode.value];
              // recursively add all children to the list of uuids to remove
              const addChildren = (node: Node) => {
                if (node.children) {
                  node.children.forEach((child) => {
                    uuidsToRemove.push(child.value);
                    addChildren(child);
                  });
                }
              };
              addChildren(onCheckNode);

              //remove the nodes from the list
              stmUuidRefs.forEach((stmUuidRef) => {
                if (stmUuidRef && !uuidsToRemove.includes(stmUuidRef)) {
                  newStmUuidRefs.push(stmUuidRef);
                }
              });
            } else {
              //add the node to the list
              if (stmUuidRefs) newStmUuidRefs = [...stmUuidRefs];
              newStmUuidRefs.push(onCheckNode.value);

              // recursively add all children to the list
              const addChildren = (node: Node) => {
                if (node.children) {
                  node.children.forEach((child) => {
                    newStmUuidRefs.push(child.value);
                    addChildren(child);
                  });
                }
              };
              addChildren(onCheckNode);
            }
            onSTMChange(newStmUuidRefs);
          }}
          icons={{
            expandClose: <FontAwesomeIcon className="rct-icon" icon={faCaretRight} />,
            expandOpen: <FontAwesomeIcon className="rct-icon" icon={faCaretDown} />,
            check: (
              <FontAwesomeIcon className={`${stmStyles.highlight} rct-icon`} icon={faCheckSquare} />
            ),
            uncheck: <FontAwesomeIcon className="rct-icon" icon={faSquare} />,
            halfCheck: <FontAwesomeIcon className="rct-icon" icon={faSquareMinus} />,
          }}
        />
      ) : (
        <div className={stmStyles.stmText}>
          <STM_Coverage stmUuidRefs={[stmUuidRefs]} mini={true} horizontal={true} />
        </div>
      )}
    </>
  );
};

export default STMSelector;
