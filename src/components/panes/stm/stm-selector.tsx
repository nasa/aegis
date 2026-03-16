import type { Node } from "react-checkbox-tree";
import CheckboxTree from "react-checkbox-tree";
import type { FunctionComponent } from "react";
import { useCallback, useEffect, useState } from "react";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
import stmStyles from "./stm-selector.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import "react-checkbox-tree/lib/react-checkbox-tree.css";
import { STM_Coverage } from "./stm-coverage";
import { upsertActionByField } from "store/action";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";

const STMSelector: FunctionComponent<{
  editMode: boolean;
  stmPriorities: StmPriorities;
  actionUuid: string;
}> = ({ editMode, stmPriorities, actionUuid }) => {
  const dispatch = useAppDispatch();
  const partialMission = useMissionDocSelector(
    (doc) => ({
      stmLevel1Name: doc.stmLevel1Name,
      stmLevel2Name: doc.stmLevel2Name,
      stmLevel3Name: doc.stmLevel3Name,
      stmLevel1Enabled: doc.stmLevel1Enabled,
    }),
    deepEqual
  );

  const allSTMLevel1: STMLevel1[] = useAppSelector((state) => state.stm.level1s, deepEqual);
  const allSTMLevel2: STMLevel2[] = useAppSelector((state) => state.stm.level2s, deepEqual);
  const allSTMLevel3: STMLevel3[] = useAppSelector((state) => state.stm.level3s, deepEqual);

  const [expanded, setExpanded] = useState<string[]>([]); //array of values at the parent levels that are expanded
  const [stmTreeNodes, setStmTreeNodes] = useState<Node[]>([]);

  const stmUuids = [];
  if (stmPriorities) {
    for (const [key, __] of Object.entries(stmPriorities)) {
      stmUuids.push(key);
    }
  }

  const changeSTMPriority = useCallback(
    (stmUuid: string, priority: number) => {
      const newStmPriorities: StmPriorities = stmPriorities ? { ...stmPriorities } : {};
      // if newStmPriorities already contains the stmUuid, remove it
      if (newStmPriorities[stmUuid] === priority) {
        delete newStmPriorities[stmUuid];
      } else {
        newStmPriorities[stmUuid] = priority;
      }
      dispatch(upsertActionByField(actionUuid, "stmPriorities", newStmPriorities));
    },
    [actionUuid, dispatch, stmPriorities]
  );

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
              <span className={stmStyles.stmHeading}>
                {partialMission?.stmLevel1Name} {level1.numbering}
              </span>{" "}
              -{" "}
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
                  {partialMission?.stmLevel2Name}{" "}
                  {partialMission?.stmLevel1Enabled && level1.numbering}
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
            const priority: number = stmPriorities ? stmPriorities[level3?.uuid] || null : null;
            const level3Node: Node = {
              value: level3.uuid,
              label: (
                <STMLabelLevel3
                  level1={level1}
                  level2={level2}
                  level3={level3}
                  priority={priority}
                  changeSTMPriority={changeSTMPriority}
                  mission={partialMission}
                />
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
      newExpandedList.push("root"); //expand the root node
      setStmTreeNodes([
        {
          value: "root",
          label: <span className={stmStyles.stmHeading}>All STM Items</span>,
          children: partialMission?.stmLevel1Enabled ? stmTree : stmTree[0].children, // hide level 1 if not enabled
          className: `${stmStyles.stmText}`,
        } as Node,
      ]);
      setExpanded(newExpandedList);
    }
  }, [allSTMLevel3, allSTMLevel2, allSTMLevel1, stmPriorities, changeSTMPriority, partialMission]);

  return (
    <>
      {editMode ? (
        <CheckboxTree
          nodes={stmTreeNodes}
          expanded={expanded}
          checkModel="leaf" //only leaf nodes can be checked, ie investigations
          onExpand={(newExpanded) => setExpanded(newExpanded)}
          showNodeIcon={false}
          onClick={() => {}} // needed or component dies
          icons={{
            expandClose: <FontAwesomeIcon className="rct-icon" icon={faCaretRight} />,
            expandOpen: <FontAwesomeIcon className="rct-icon" icon={faCaretDown} />,
          }}
        />
      ) : (
        <div>
          <STM_Coverage stmUuidsByActionUuid={[stmUuids]} horizontal={true} />
        </div>
      )}
    </>
  );
};

export default STMSelector;

const STMLabelLevel3: FunctionComponent<{
  level1: STMLevel1;
  level2: STMLevel2;
  level3: STMLevel3;
  priority: number;
  changeSTMPriority: Function;
  mission: { stmLevel3Name: string; stmLevel1Enabled: boolean };
}> = ({ level1, level2, level3, priority, changeSTMPriority, mission }) => {
  const changePriority = useCallback(
    (priority: number) => {
      changeSTMPriority(level3.uuid, priority);
    },
    [changeSTMPriority, level3.uuid]
  );

  const priorityClass = (buttonPriority: number) => {
    switch (buttonPriority) {
      case 1:
        return stmStyles.toggleLeft;
      case 2:
        return stmStyles.toggleMiddle;
      case 3:
        return stmStyles.toggleRight;
      default:
        return "";
    }
  };

  return (
    <span className={stmStyles.stmLevel3Container}>
      <span
        className={stmStyles.toggleContainer}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html="STM Priority"
      >
        <span
          className={`${priorityClass(1)} ${priority === 1 ? stmStyles.toggleSelected : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            changePriority(1);
          }}
        >
          H
        </span>

        <span
          className={`${priorityClass(2)} ${priority === 2 ? stmStyles.toggleSelected : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            changePriority(2);
          }}
        >
          M
        </span>
        <span
          className={`${priorityClass(3)} ${priority === 3 ? stmStyles.toggleSelected : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            changePriority(3);
          }}
        >
          L
        </span>
      </span>
      <span className={stmStyles.stmHeading}>
        {mission?.stmLevel3Name} {mission?.stmLevel1Enabled && level1.numbering}
        {level2.numbering}
        {level3.numbering} -{" "}
      </span>
      <span data-tooltip-id="aegis-tooltip" data-tooltip-html={level3.name}>
        {level3.name}
      </span>
    </span>
  );
};
