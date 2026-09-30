import type { FunctionComponent } from "react";
import { useCallback } from "react";
import { useAppSelector, refEqual, shallowEqual, deepEqual } from "utils/useAppSelector";
import { setSelectedEvaRightNavItem, setSelectedEvaUuid } from "store/eva";
import evaStyles from "./eva.module.css";
import { hmmFromMinutes, isNotNumber } from "utils/formatting";
import { setHoverUuidsForSequence } from "store/hover";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { getRexStatusDisplayProperties, getSequenceItemRowStyles } from "utils/component-helpers";
import { RexStatusMenu } from "../rex/rex-status-menu";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { getCalcFieldsForTraverse } from "store/processing/calculatedFields";
import { useMissionDocSelector } from "utils/useDocSelector";

const SequenceItemTraverse: FunctionComponent<{
  evaUuid: string;
  traverseUuid: string;
  isRexRunning: boolean;
}> = ({ evaUuid, traverseUuid }) => {
  const dispatch = useAppDispatch();
  const missionTraverseRate = useMissionDocSelector((mission) => mission.traverseRate, refEqual);

  const isRexEva = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return false;
    return Object.values(mission.rexes).some((rex) => rex.evaUuid === evaUuid);
  }, refEqual);
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const traverseDurationAndName: { name: string; duration: number } = useMissionDocSelector(
    (mission) => {
      return {
        name: mission.traverses[traverseUuid]?.name,
        duration: mission.traverses[traverseUuid]?.duration,
      };
    },
    deepEqual
  );

  const traverseEvaTraverseRate = useMissionDocSelector((mission) => {
    if (!mission?.evas) return null;
    return (
      Object.values(mission.evas).find((eva) =>
        eva.sequence.some((seqItem) => seqItem.uuid === traverseUuid)
      )?.traverseRate ?? null
    );
  }, deepEqual);
  const thisTraverseCalculatedFields = useMissionDocSelector((mission) => {
    const traverseActions = Object.values(mission.actions ?? {}).filter(
      (a) => a.traverseUuid === traverseUuid && a.enabled
    );
    return getCalcFieldsForTraverse({
      traverse: mission.traverses ? mission.traverses[traverseUuid] : undefined,
      missionTraverseRate,
      evaTraverseRate: traverseEvaTraverseRate,
      traverseActions,
    });
  }, deepEqual);

  const traverseRexStatus = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return null;
    const rex = Object.values(mission.rexes).find((rex) => rex.evaUuid === evaUuid);
    if (!rex || !rex.traverseEntries) return null;
    return rex.traverseEntries[traverseUuid]?.rexStatus;
  }, shallowEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );

  const rexMaestroControlled = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return false;
    return Object.values(mission.rexes).find((rex) => rex.isRunning)?.maestroControlled ?? false;
  }, refEqual);

  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);
  // returns the rex from db object if this is a rex eva and is executing
  const rexIfExecuting = useMissionDocSelector((mission) => {
    if (!isRexEva || !mission?.rexes) return null;
    return (
      Object.values(mission.rexes).find((rex) => rex.isRunning && rex.evaUuid === evaUuid) ?? null
    );
  }, deepEqual);

  const displayTraverseDuration = useCallback(() => {
    const traverseCalculatedTime = thisTraverseCalculatedFields
      ? thisTraverseCalculatedFields.movementDurationMinutes +
        thisTraverseCalculatedFields.totalDwellTime
      : null;
    const durationMinutes = isNotNumber(traverseDurationAndName?.duration)
      ? traverseCalculatedTime
      : traverseDurationAndName?.duration;
    return isNotNumber(durationMinutes) ? "N/A" : hmmFromMinutes(durationMinutes);
  }, [thisTraverseCalculatedFields, traverseDurationAndName?.duration]);

  const getTraverseDisplay = (name: string) => {
    if (!name) {
      return "No traverse name";
    }
    const traverseNameParts: string[] = name.split(" to ", 2);
    let beforeTraverseName: string = traverseNameParts[0];
    let afterTraverseName: string = traverseNameParts[1];
    if (beforeTraverseName.length + afterTraverseName.length >= 30) {
      if (beforeTraverseName.length < 15) {
        afterTraverseName =
          afterTraverseName.substring(0, 12 + (15 - beforeTraverseName.length)) + "...";
      } else if (afterTraverseName.length < 15) {
        beforeTraverseName =
          traverseNameParts[0].substring(0, 12 + (15 - afterTraverseName.length)) + "...";
      } else {
        beforeTraverseName = beforeTraverseName.substring(0, 11) + "...";
        afterTraverseName = afterTraverseName.substring(0, 11) + "...";
      }
    }
    return `${beforeTraverseName} to ${afterTraverseName}`;
  };

  const handleSequenceItemClick = useCallback(
    (sequenceItemUuid: string) => {
      if (selectedEvaSequenceItemUuid === sequenceItemUuid) {
        dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: null }));
        dispatch(setSelectedEvaRightNavItem("info_panel"));
      } else {
        dispatch(setSelectedEvaUuid(evaUuid));
        dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid }));
        dispatch(thunkSetRightPanelIsOpenIfAuto(true));
      }
    },
    [dispatch, evaUuid, selectedEvaSequenceItemUuid]
  );

  const { rowClassName, nameClassName } = getSequenceItemRowStyles({
    rexStatus: traverseRexStatus,
    isSelected: traverseUuid === selectedEvaSequenceItemUuid,
    isHovered: traverseUuid === hoverItemUuid,
    isRexEva,
  });

  return (
    <div className={evaStyles.evaSequence}>
      <div
        className={`${evaStyles.evaItem} ${rowClassName}`}
        key={`${traverseUuid}`}
        onMouseEnter={() => {
          dispatch(
            setHoverUuidsForSequence({ sequenceUuid: traverseUuid, mapItemType: "traverse" })
          );
        }}
        onMouseLeave={() => {
          dispatch(setHoverUuidsForSequence({ sequenceUuid: null, mapItemType: null }));
        }}
        onClick={() => handleSequenceItemClick(traverseUuid)}
        style={{ cursor: "pointer" }}
      >
        <div className={evaStyles.evaTraverseIndicator}>
          <div className={evaStyles.iconTraverseDotsContainer}>
            <div className={evaStyles.iconTraverse} />
          </div>
        </div>

        {isRexEva && (
          <RexStatusMenu
            rexStatus={traverseRexStatus}
            divClassName={evaStyles.rexStatusWrapper}
            entryType="traverse"
            uuid={traverseUuid}
            editPerms={!!(editPerms && rexIfExecuting)} // the !! converts result into boolean
            maestroControlled={rexMaestroControlled}
          />
        )}
        <div
          className={`${evaStyles.evaItemName} ${nameClassName} ${
            getRexStatusDisplayProperties(traverseRexStatus).customTextClassName ?? ""
          }`}
        >
          <div className={evaStyles.evaItemLeft}>
            <div className={`${evaStyles.evaTraverseNameText}`}>
              {getTraverseDisplay(traverseDurationAndName?.name)}
            </div>
          </div>
          <div className={evaStyles.evaItemRight}>
            <div
              className={evaStyles.evaItemRightItem}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-content={"Est traverse time"}
              data-tooltip-place="right"
            >
              {displayTraverseDuration()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SequenceItemTraverse;
