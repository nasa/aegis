import CheckboxTree, { Node } from "react-checkbox-tree";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
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
  const allSTMLevel1: STMLevel1[] = useAppSelector((state) => state.stm.level1s, deepEqual);
  const allSTMLevel2: STMLevel2[] = useAppSelector((state) => state.stm.level2s, deepEqual);
  const allSTMLevel3: STMLevel3[] = useAppSelector((state) => state.stm.level3s, deepEqual);

  const [expanded, setExpanded] = useState<string[]>([]); //array of values at the parent levels that are expanded
  const [stmTreeNodes, setStmTreeNodes] = useState<Node[]>([]);

  //build the stm tree
  useEffect(() => {
    if (allSTMLevel3?.length > 0 && allSTMLevel2 && allSTMLevel3) {
      // build the expanded list to include all nodes so expanded by default
      const newExpandedList: string[] = [];
      const stmTree: Node[] = [];
      for (const level1 of allSTMLevel1) {
        newExpandedList.push(level1.uuid);
        const level1Node: Node = {
          value: level1.uuid,
          label: (
            <>
              <span className={stmStyles.stmHeading}>Goal {level1.numbering}</span> -{" "}
              <span data-tooltip-id="aegis-tooltip" data-tooltip-html={level1.name}>
                {level1.name}
              </span>
            </>
          ),
          className: `${stmStyles.stmText}`,
          children: [],
          title: level1.name,
        };
        const objLevel2s: STMLevel2[] = allSTMLevel2.filter(
          (level2) => level2.level1Uuid === level1.uuid
        );
        const level1Children: Node[] = [];
        for (const level2 of objLevel2s) {
          newExpandedList.push(level2.uuid);
          const level2Node: Node = {
            value: level2.uuid,
            label: (
              <>
                <span className={stmStyles.stmHeading}>
                  Objective {level1.numbering}
                  {level2.numbering}
                </span>{" "}
                -{" "}
                <span data-tooltip-id="aegis-tooltip" data-tooltip-html={level2.name}>
                  {level2.name}
                </span>
              </>
            ),
            className: `${stmStyles.stmText}`,
            children: [],
            title: level2.name,
          };
          const objLevel3s: STMLevel3[] = allSTMLevel3.filter(
            (level3) => level3.level2Uuid === level2.uuid
          );
          const level2Children: Node[] = [];
          for (const level3 of objLevel3s) {
            newExpandedList.push(level3.uuid);
            const level3Node: Node = {
              value: level3.uuid,
              label: (
                <>
                  <span className={stmStyles.stmHeading}>
                    Investigation {level1.numbering}
                    {level2.numbering}-{level3.numbering}
                  </span>{" "}
                  -{" "}
                  <span data-tooltip-id="aegis-tooltip" data-tooltip-html={level3.name}>
                    {level3.name}
                  </span>
                </>
              ),
              className: `${stmStyles.stmText}`,
              title: level3.name,
            };
            level2Children.push(level3Node);
          }
          level2Node.children = level2Children;
          level1Children.push(level2Node);
        }
        level1Node.children = level1Children;
        stmTree.push(level1Node);
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
  }, [allSTMLevel3, allSTMLevel2, allSTMLevel1]);

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
