import { IconButton, ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import {
  setSelectedEvaRightNavItem,
  setExpandedEvaUuids,
  setSelectedEvaSequenceItemUuid,
  setSelectedEvaUuid,
  setEvaSequence,
} from "store/eva";
import { upsertTraverse } from "store/traverse";
import evaStyles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretRight, faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { setSelectedStationUuid } from "store/station";
import { v4 as uuidv4 } from "uuid";
import EvaItemSequence from "./eva-item-sequence";
import { generateUniqueName } from "utils/unique-name";
import { setRightPanelOpen } from "store/interface";

const EvaItem: FunctionComponent<{ eva: Eva }> = ({ eva }) => {
  const dispatch = useDispatch();

  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, shallowEqual);

  const thisEvaFromDb = useAppSelector(
    (state) => state.eva.evasFromDb.find((evaItem) => evaItem.uuid === eva.uuid),
    shallowEqual
  );

  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const editMode = useAppSelector(
    (state) => state.eva.evasEditing.includes(eva.uuid),
    shallowEqual
  );
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedRightNavItem = useAppSelector(
    (state) => state.eva.selectedEvaRightNavItem,
    refEqual
  );
  const expandedEvaUuids = useAppSelector((state) => state.eva.expandedEvaUuids, shallowEqual);
  const missionId = useAppSelector((state) => state.mission.mission.id, shallowEqual);

  const [traversesInEva, setTraversesInEva] = useState<Traverse[]>([]);
  const [traversesInEvaFromDb, setTraversesInEvaFromDb] = useState<Traverse[]>([]);

  const createBlankTraverse = (): Traverse => {
    const randomName = generateUniqueName({
      dictName: "adjectives",
      existingNames: traverses.map((item) => item.name),
    });

    return {
      missionId: missionId,
      uuid: uuidv4(),
      name: randomName,
      description: "",
      durationLower: null,
      durationUpper: null,
      path: [],
      pathSegmentDistances: null,
      pathSegmentElevations: null,
      elevationResolutionMeters: null,
      status: null,
    };
  };

  const handleAddStation = () => {
    const newEvaSequence = [...eva.sequence];

    const newStationSequenceItem: EvaSequenceItem = {
      type: "station",
      uuid: "",
    };
    if (newEvaSequence.length === 0) {
      newEvaSequence.push(newStationSequenceItem);
    } else {
      // add a traverse before the station
      const newTraverse = createBlankTraverse();
      dispatch(upsertTraverse(newTraverse));

      newEvaSequence.push({
        type: "traverse",
        uuid: newTraverse.uuid,
      });
      newEvaSequence.push(newStationSequenceItem);
    }
    dispatch(setEvaSequence({ evaUuid: eva.uuid, sequence: newEvaSequence }));
  };

  useEffect(() => {
    if (eva.sequence) {
      const traverseUuidInEva = eva.sequence.filter((item) => item.type === "traverse");
      const traverseSubset = traverses.filter((traverse) =>
        traverseUuidInEva.find((traverseUuid) => traverseUuid.uuid === traverse.uuid)
      );
      setTraversesInEva(traverseSubset);
    }
  }, [eva, traverses]);

  useEffect(() => {
    if (thisEvaFromDb?.sequence) {
      const traverseUuidInEva = thisEvaFromDb.sequence.filter((item) => item.type === "traverse");
      const traverseSubset = traverses.filter((traverse) =>
        traverseUuidInEva.find((traverseUuid) => traverseUuid.uuid === traverse.uuid)
      );
      setTraversesInEvaFromDb(traverseSubset);
    }
  }, [thisEvaFromDb, traverses]);

  let evaSelectionStyle = null;

  // if this is the this eva, highlight or emphasize it
  if (eva.uuid === selectedEvaUuid) {
    evaSelectionStyle = evaStyles.nameSelected;
    // if there is a selected sequence item and it's in this eva, then only emphasize the eva name rather than highlighting it
    if (selectedEvaSequenceItemUuid) {
      const evaSequenceItem = eva.sequence.find(
        (sequenceItem) => sequenceItem.uuid === selectedEvaSequenceItemUuid
      );
      if (evaSequenceItem) {
        evaSelectionStyle = evaStyles.nameEmphasized;
      }
    }
  }

  return (
    <div className={evaStyles.evaContainer}>
      <div className={evaStyles.nameitem} key={eva.uuid}>
        <div
          className={evaStyles.nameCaret}
          onClick={() => {
            // toggle the expansion of this eva item
            if (expandedEvaUuids.find((uuid) => uuid === eva.uuid)) {
              dispatch(setExpandedEvaUuids(expandedEvaUuids.filter((uuid) => uuid !== eva.uuid)));
            } else {
              if (!expandedEvaUuids.find((uuid) => uuid === eva.uuid)) {
                dispatch(setExpandedEvaUuids([...expandedEvaUuids, eva.uuid]));
              }
            }
          }}
        >
          {expandedEvaUuids.find((uuid) => uuid === eva.uuid) ? (
            <FontAwesomeIcon icon={faCaretDown} style={{ color: "var(--grey4)" }} />
          ) : (
            <FontAwesomeIcon icon={faCaretRight} style={{ color: "var(--grey4)" }} />
          )}
        </div>
        <div
          className={`${evaStyles.name} ${evaSelectionStyle}`}
          onClick={() => {
            if (selectedEvaUuid === eva.uuid) {
              if (selectedEvaSequenceItemUuid === null) {
                dispatch(setSelectedEvaUuid(null));
                dispatch(setRightPanelOpen(false));
              }
              dispatch(setSelectedEvaSequenceItemUuid(null));
            } else {
              dispatch(setSelectedEvaUuid(eva.uuid));
              dispatch(setSelectedEvaSequenceItemUuid(null));

              if (!selectedRightNavItem) dispatch(setSelectedEvaRightNavItem("info_panel"));
              dispatch(setRightPanelOpen(true));

              // add this eva uuid to the expanded list if it's not already there
              if (!expandedEvaUuids.find((uuid) => uuid === eva.uuid)) {
                dispatch(setExpandedEvaUuids([...expandedEvaUuids, eva.uuid]));
              }
            }
            dispatch(setSelectedStationUuid(null));
          }}
        >
          <div className={evaStyles.nameText}>{eva.name}</div>
          <ModifiedIndicator
            obj1={[eva, ...traversesInEva]}
            obj2={[thisEvaFromDb, ...traversesInEvaFromDb]}
            svgStyle={{
              width: "15",
              height: "12",
              cx: "5",
              cy: "9",
              r: "3",
              fill: "#ff0000",
            }}
          />
          <div className={evaStyles.nameItemRightSpacer}></div>
        </div>
      </div>
      {expandedEvaUuids.find((uuid) => uuid === eva.uuid) && (
        <div className={evaStyles.evaSequenceContainer}>
          <EvaItemSequence evaUuid={eva.uuid} evaSequence={eva.sequence} editMode={editMode} />
        </div>
      )}
      {editMode && (
        <div className={evaStyles.evaFooterContainer}>
          <div className={paneStyles.iconButtons}>
            <IconButton
              onClick={() => {
                handleAddStation();
              }}
              label="Add Station"
              icon={faPlusCircle}
            ></IconButton>
          </div>
        </div>
      )}
    </div>
  );
};

export default EvaItem;
