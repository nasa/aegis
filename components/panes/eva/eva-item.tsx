import { ModifiedIndicator } from "components/interface/_global-elements";
import { Button } from "components/interface/form/globalFields";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppSelector, refEqual, shallowEqual } from "utils/useAppSelector";
import { setSelectedEvaRightNavItem, setExpandedEvaUuids, setSelectedEvaUuid } from "store/eva";
import evaStyles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faCaretRight,
  faPlusCircle,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import { setSelectedStationUuid } from "store/station";
import EvaItemSequence from "./eva-item-sequence";
import { setRightPanelOpen } from "store/interface";
import { selectEVASequenceItem } from "store/cross-slice";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkAddStationToEva } from "store/thunk/thunkEva";

const EvaItem: FunctionComponent<{ eva: Eva }> = ({ eva }) => {
  const dispatch = useAppDispatch();
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

  const [traversesInEva, setTraversesInEva] = useState<Traverse[]>([]);
  const [traversesInEvaFromDb, setTraversesInEvaFromDb] = useState<Traverse[]>([]);

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
  let settingsIconColor = "var(--grey4)";

  // if this eva is selected, highlight or emphasize it
  if (eva.uuid === selectedEvaUuid) {
    evaSelectionStyle = evaStyles.nameSelected;
    settingsIconColor = "var(--grey1)";

    // if there is a selected sequence item and it's in this eva, then only emphasize the eva name rather than highlighting it
    if (selectedEvaSequenceItemUuid) {
      const evaSequenceItem = eva.sequence.find(
        (sequenceItem) => sequenceItem.uuid === selectedEvaSequenceItemUuid
      );
      if (evaSequenceItem) {
        evaSelectionStyle = evaStyles.nameEmphasized;
        settingsIconColor = "var(--grey4)";
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
          <FontAwesomeIcon
            icon={expandedEvaUuids.find((uuid) => uuid === eva.uuid) ? faCaretDown : faCaretRight}
            style={{ color: "var(--grey4)" }}
          />
        </div>
        <div
          className={`${evaStyles.name} ${evaSelectionStyle}`}
          onClick={() => {
            if (selectedEvaUuid === eva.uuid && selectedEvaSequenceItemUuid === null) {
              dispatch(setSelectedEvaUuid(null));
              dispatch(setRightPanelOpen(false));
            } else {
              dispatch(setSelectedEvaUuid(eva.uuid));

              if (!selectedRightNavItem) dispatch(setSelectedEvaRightNavItem("info_panel"));
              dispatch(setRightPanelOpen(true));

              // add this eva uuid to the expanded list if it's not already there
              if (expandedEvaUuids.indexOf(eva.uuid) === -1) {
                dispatch(setExpandedEvaUuids([...expandedEvaUuids, eva.uuid]));
              }
            }
            dispatch(selectEVASequenceItem({ sequenceItemUuid: null }));
            dispatch(setSelectedStationUuid(null));
          }}
        >
          <div className={evaStyles.nameText}>{eva.name}</div>
          <ModifiedIndicator
            obj1={[eva, ...traversesInEva]}
            obj2={[thisEvaFromDb, ...traversesInEvaFromDb]}
          />

          <div className={evaStyles.nameItemRightSpacer} />
          <div className={evaStyles.nameItemsRightButton}>
            <FontAwesomeIcon icon={faSliders} style={{ color: settingsIconColor }} />
          </div>
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
            <Button
              onClick={() => {
                dispatch(thunkAddStationToEva({ evaUuid: eva.uuid }));
              }}
              label="Add Station"
              icon={faPlusCircle}
              style={{ width: "105px" }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EvaItem;
