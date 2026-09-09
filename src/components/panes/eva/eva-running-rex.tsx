import type { FunctionComponent } from "react";
import { useCallback } from "react";
import { useAppSelector, refEqual } from "utils/useAppSelector";
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
import EvaItemSequence from "./eva-item-sequence";
import { Button } from "components/interface/form/globalFields";
import { thunkDocAddStationToEva } from "store/thunk/thunkEva";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import { useMissionDocSelector } from "utils/useDocSelector";

const EvaRunningRex: FunctionComponent = () => {
  const dispatch = useAppDispatch();

  const rexUuid = useMissionDocSelector(
    (mission) =>
      mission.rexes
        ? (Object.values(mission.rexes).find((rex) => rex.isRunning)?.uuid ?? null)
        : null,
    refEqual
  );

  const rexName = useMissionDocSelector(
    (mission) =>
      mission.rexes
        ? (Object.values(mission.rexes).find((rex) => rex.isRunning)?.name ?? null)
        : null,
    refEqual
  );

  const evaUuid = useMissionDocSelector(
    (mission) =>
      mission.rexes
        ? (Object.values(mission.rexes).find((rex) => rex.isRunning)?.evaUuid ?? null)
        : null,
    refEqual
  );

  const asPlannedEvaName = useMissionDocSelector((mission) => {
    if (!mission.rexes) return null;
    const runningRex = Object.values(mission.rexes).find((rex) => rex.isRunning);
    if (!runningRex) return null;
    const rexEva = mission.evas?.[runningRex.evaUuid];
    return getAsPlannedEvaFromRefUuid(mission, rexEva?.refUuid)?.name ?? null;
  }, refEqual);

  // Interface stuff
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const isExpanded = useAppSelector((state) => state.eva.runningRexExpanded, refEqual);

  const selectedEvaIsRunningRex =
    evaUuid !== null && selectedEvaUuid === evaUuid && selectedRexUuid === rexUuid;

  // Set styles. if this eva is selected, highlight it. if the sequence item is selected, emphasize it
  const selectedStyleState: null | "highlight" =
    evaUuid === selectedEvaUuid && selectedEvaSequenceItemUuid === null ? "highlight" : null;

  const handleClickOnEvaName = useCallback(() => {
    if (selectedEvaUuid === evaUuid && selectedEvaSequenceItemUuid === null) {
      // Re-selecting the currently selected item. Deselect it
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

  if (!rexUuid || !evaUuid) return null;

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
            <div className={styles.nameSpacer} />
            <FontAwesomeIcon
              icon={faPersonWalkingArrowRight}
              className={styles.rexIconWrapper}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-content={"Execution in Progress"}
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
  const editMode = useAppSelector((state) => state.mission.isInEditMode, refEqual);

  return (
    <>
      <div className={styles.evaSequenceContainer}>
        <EvaItemSequence evaUuid={evaUuid} />
      </div>
      {editMode && (
        <div className={styles.evaFooterContainer}>
          <div className={styles.iconButtons}>
            <Button
              onClick={() => {
                dispatch(thunkDocAddStationToEva({ evaUuid }));
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
