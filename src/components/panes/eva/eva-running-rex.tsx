import { ModifiedIndicator } from "components/interface/_global-elements";
import type { FunctionComponent } from "react";
import { useCallback, useMemo } from "react";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import {
  setSelectedEvaUuid,
  setSelectedEvaSequenceItemUuid,
  setRunningRexExpanded,
} from "store/eva";
import styles from "./eva-running-rex.module.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faCaretRight,
  faPersonWalkingArrowRight,
  faPlusCircle,
} from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { setSelectedRexUuid } from "store/rex";
import EvaItemSequence, { EvaEgressIngressListing } from "./eva-item-sequence";
import { Button } from "components/interface/form/globalFields";
import { thunkAddStationToEva } from "store/thunk/thunkEva";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";

const EvaRunningRex: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const rexUuid = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning)?.uuid,
    refEqual
  );
  const rexName = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning)?.name,
    refEqual
  );
  const evaUuid = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning)?.evaUuid,
    refEqual
  );
  // only used for modified indicator, so strip out partial properties to prevent over-rendering
  const partialThisEva = useAppSelector((state) => {
    const thisEva = state.eva.evas.find((eva) => eva.uuid === evaUuid);
    if (thisEva) {
      return {
        uuid: thisEva.uuid,
        refUuid: thisEva.refUuid,
        updatedAt: thisEva.updatedAt,
        createdAt: thisEva.createdAt,
      };
    }
  }, deepEqual);
  // only used for modified indicator, so strip out partial properties to prevent over-rendering
  const partialThisEvaFromDb = useAppSelector((state) => {
    const thisEva = state.eva.evasFromDb.find((eva) => eva.uuid === evaUuid);
    if (thisEva) {
      return {
        uuid: thisEva.uuid,
        refUuid: thisEva.refUuid,
        updatedAt: thisEva.updatedAt,
        createdAt: thisEva.createdAt,
      };
    }
  }, deepEqual);

  const asPlannedEvaName = useAppSelector((state) => {
    return getAsPlannedEvaFromRefUuid(state, partialThisEva.refUuid)?.name;
  }, refEqual);

  const evaTraversesForModified = useAppSelector((state) => {
    const thisEva = state.eva.evas.find((eva) => eva.uuid === evaUuid);
    const traverseUuidInEva = thisEva?.sequence.filter((item) => item.type === "traverse");
    const traverseSubset = state.traverse.traverses.filter((traverse) =>
      traverseUuidInEva?.find((traverseUuid) => traverseUuid.uuid === traverse.uuid)
    );
    return traverseSubset.map((traverse) => {
      return { uuid: traverse.uuid, updatedAt: traverse.updatedAt };
    });
  }, deepEqual);
  const evaTraversesFromDbForModified = useAppSelector((state) => {
    const thisEvaFromDb = state.eva.evasFromDb.find((eva) => eva.uuid === evaUuid);
    const traverseUuidInEva = thisEvaFromDb?.sequence.filter((item) => item.type === "traverse");
    const traverseSubset = state.traverse.traverses.filter((traverse) =>
      traverseUuidInEva?.find((traverseUuid) => traverseUuid.uuid === traverse.uuid)
    );
    return traverseSubset.map((traverse) => {
      return { uuid: traverse.uuid, updatedAt: traverse.updatedAt };
    });
  }, deepEqual);

  // interface stuff
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const isExpanded = useAppSelector((state) => state.eva.runningRexExpanded, refEqual);

  const selectedEvaIsRunningRex = useAppSelector((state) => {
    const selectedRex = state.rex.rexesFromDb.find((r) => r.uuid === state.rex.selectedRexUuid);
    const runningRex = state.rex.rexesFromDb.find((rex) => rex.isRunning);
    return selectedRex?.evaUuid === runningRex?.evaUuid && selectedRex?.uuid === runningRex?.uuid;
  }, refEqual);

  // set styles. if this eva is selected, highlight it. if the sequence item is selected, emphasize it
  const selectedStyleState: null | "highlight" = useMemo(() => {
    if (evaUuid === selectedEvaUuid && selectedEvaSequenceItemUuid === null) {
      return "highlight";
    }
    return null;
  }, [evaUuid, selectedEvaUuid, selectedEvaSequenceItemUuid]);

  const handleClickOnEvaName = useCallback(() => {
    if (selectedEvaUuid === evaUuid && selectedEvaSequenceItemUuid === null) {
      // re-selecting the currently selected item. Deselect it
      dispatch(setSelectedEvaUuid(null));
      dispatch(setSelectedRexUuid(null));
      dispatch(thunkSetRightPanelIsOpenIfAuto(false));
    } else {
      dispatch(setSelectedEvaUuid(evaUuid));
      dispatch(setSelectedRexUuid(rexUuid));
      dispatch(thunkSetRightPanelIsOpenIfAuto(true));
    }
    dispatch(setSelectedEvaSequenceItemUuid(null));
  }, [selectedEvaUuid, evaUuid, selectedEvaSequenceItemUuid, dispatch, rexUuid]);

  // Early return if no running rex or eva data
  if (!rexUuid || !evaUuid) {
    return null;
  }

  return (
    <div
      className={
        selectedEvaIsRunningRex ? styles.runningRexContainerSelected : styles.runningRexContainer
      }
    >
      <div className={selectedEvaIsRunningRex ? styles.nameitemSelected : styles.nameitem}>
        <div
          className={`${styles.nameCaret}`}
          onClick={() => {
            dispatch(setRunningRexExpanded(!isExpanded));
          }}
        >
          <FontAwesomeIcon icon={isExpanded ? faCaretDown : faCaretRight} />
        </div>
        <div
          className={`${styles.name} ${selectedStyleState === "highlight" && styles.nameSelected}`}
          onClick={() => {
            handleClickOnEvaName();
          }}
        >
          <div className={styles.nameTopRow}>
            <div className={styles.nameText}>{asPlannedEvaName}</div>
            <ModifiedIndicator
              obj1={[partialThisEva, ...evaTraversesForModified]}
              obj2={[partialThisEvaFromDb, ...evaTraversesFromDbForModified]}
            />

            <div className={styles.nameSpacer} />
            <FontAwesomeIcon
              icon={faPersonWalkingArrowRight}
              className={styles.rexIconWrapper}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={"Execution in Progress"}
            />
          </div>
          <div className={styles.nameBottomRow}>
            <div className={styles.rexName}>{rexName}</div>
          </div>
        </div>
      </div>
      {isExpanded && <EvaSequenceRunningRex evaUuid={evaUuid} />}
    </div>
  );
};

export default EvaRunningRex;

export const EvaSequenceRunningRex: FunctionComponent<{
  evaUuid: string;
}> = ({ evaUuid }) => {
  const dispatch = useAppDispatch();
  const eva = useAppSelector((state) => {
    return state.eva.evas.find((eva) => eva.uuid === evaUuid);
  }, deepEqual);
  const editMode = useAppSelector((state) => state.eva.evasEditing.includes(evaUuid), refEqual);
  const isRexEva = useAppSelector((state) => {
    const rexEvaUuids = state.rex.rexes.map((rex) => rex.evaUuid);
    return rexEvaUuids.includes(evaUuid);
  }, refEqual);

  return (
    <>
      <div className={styles.evaSequenceContainer}>
        <EvaEgressIngressListing eva={eva} isEgress={true} isRexEva={isRexEva} />
        <EvaItemSequence evaUuid={evaUuid} />
        <EvaEgressIngressListing eva={eva} isEgress={false} isRexEva={isRexEva} />
      </div>
      {editMode && (
        <div className={styles.evaFooterContainer}>
          <div className={styles.iconButtons}>
            <Button
              onClick={() => {
                dispatch(thunkAddStationToEva({ evaUuid }));
              }}
              label="Add Station"
              icon={faPlusCircle}
              style={{ width: "105px" }}
            />
          </div>
        </div>
      )}
    </>
  );
};
