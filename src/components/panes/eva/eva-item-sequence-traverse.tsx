import { ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent, useCallback, useState } from "react";
import { useAppSelector, refEqual, shallowEqual, deepEqual } from "utils/useAppSelector";
import { setSelectedEvaRightNavItem, setSelectedEvaUuid } from "store/eva";
import evaStyles from "./eva.module.css";
import {
  secondsFromhhmmss,
  hhmmssFromSeconds,
  hmmFromMinutes,
  isNotNumber,
} from "utils/formatting";
import { setHoverUuidsForSequence } from "store/hover";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { getRexStatusDisplayProperties } from "../../../utils/rex";
import last from "lodash/last";
import PetInterval from "components/page/petInterval";
import { RexStatusMenu } from "../rex/rex-status-menu";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import {
  getCalculatedFieldsByEva,
  getCalculatedFieldsByTraverse,
} from "store/processing/calculatedFields";

const SequenceItemTraverse: FunctionComponent<{
  evaUuid: string;
  traverseUuid: string;
  isRexRunning: boolean;
}> = ({ evaUuid, traverseUuid, isRexRunning }) => {
  const dispatch = useAppDispatch();

  const isRexEva = useAppSelector((state) => {
    const rexEvaUuids = state.rex.rexes.map((rex) => rex.evaUuid);
    return rexEvaUuids.includes(evaUuid);
  }, refEqual);
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const editMode = useAppSelector((state) => state.eva.evasEditing.includes(evaUuid), refEqual);
  const traverseName = useAppSelector(
    (state) => state.traverse.traverses.find((traverse) => traverse.uuid === traverseUuid)?.name,
    refEqual
  );

  const thisTraverseForModified = useAppSelector((state) => {
    const traverse = state.traverse.traverses.find((traverse) => traverse.uuid === traverseUuid);
    return { uuid: traverse?.uuid, duration: traverse?.duration, updatedAt: traverse?.updatedAt };
  }, deepEqual);
  const thisTraverseFromDbForModified = useAppSelector((state) => {
    const traverse = state.traverse.traversesFromDb.find(
      (traverse) => traverse.uuid === traverseUuid
    );
    return { uuid: traverse?.uuid, duration: traverse?.duration, updatedAt: traverse?.updatedAt };
  }, deepEqual);
  const thisTraverseCalculatedFields = useAppSelector(
    (state) =>
      getCalculatedFieldsByTraverse({
        traverseUuid,
        traverses: state.traverse.traverses,
        mission: state.mission.mission,
        evas: state.eva.evas,
        actions: state.action.actions,
      }),
    deepEqual
  );

  const traverseRexStatus = useAppSelector((state) => {
    const rex = state.rex.rexesFromDb.find((rex) => rex.evaUuid === evaUuid);
    if (!rex || !rex.traverseEntries) return null;
    return last(rex.traverseEntries[traverseUuid])?.rexStatus;
  }, shallowEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );

  const sequenceItemCalculatedDataEndSeconds = useAppSelector(
    (state) =>
      getCalculatedFieldsByEva({
        evaUuid,
        evas: state.eva.evas,
        stations: state.station.stations,
        mission: state.mission.mission,
        actions: state.action.actions,
        traverses: state.traverse.traverses,
      })?.sequenceItemsCalculatedData?.find((sequenceItem) => sequenceItem.uuid === traverseUuid)
        ?.manualEndSeconds,
    refEqual
  );

  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);
  // returns the rex from db object if this is a rex eva and is executing
  const rexFromDbIfExecuting = useAppSelector((state) => {
    if (!isRexEva) return null;
    return state.rex.rexesFromDb.find((rex) => rex.isRunning && rex.evaUuid === evaUuid);
  }, deepEqual);

  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");

  // determine styling
  let evaSequenceStyle = null;
  if (traverseUuid === selectedEvaSequenceItemUuid) {
    evaSequenceStyle = evaStyles.evaItemNameSelected;
  } else if (traverseUuid === hoverItemUuid) {
    evaSequenceStyle = evaStyles.evaItemNameHoverMode;
  }
  if (isRexEva) {
    if (traverseRexStatus === "in-progress") {
      evaSequenceStyle = evaStyles.evaItemNameRexInProgress;
      if (traverseUuid === selectedEvaSequenceItemUuid) {
        evaSequenceStyle = evaStyles.evaItemNameRexInProgressSelected;
      }
    } else if (traverseRexStatus === "complete") {
      evaSequenceStyle = evaStyles.evaItemNameRexComplete;
      if (traverseUuid === selectedEvaSequenceItemUuid) {
        evaSequenceStyle = evaStyles.evaItemNameSelected;
      }
    } else if (traverseRexStatus === "skipped") {
      evaSequenceStyle = evaStyles.evaItemNameRexSkipped;
      if (traverseUuid === selectedEvaSequenceItemUuid) {
        evaSequenceStyle = evaStyles.evaItemNameRexSkippedSelected;
      }
    }
  }

  const displayTraverseDuration = useCallback(() => {
    const durationMinutes = isNotNumber(thisTraverse?.duration)
      ? thisTraverseCalculatedFields?.durationMinutes +
          thisTraverseCalculatedFields?.totalActionTime || null
      : thisTraverseForModified.duration;
    return isNotNumber(durationMinutes) ? "N/A" : hmmFromMinutes(durationMinutes);
  }, [
    thisTraverseCalculatedFields?.durationMinutes,
    thisTraverseCalculatedFields?.totalActionTime,
    thisTraverseForModified.duration,
  ]);

  const displayInProgressItemTimeRemaining = useCallback(
    (rexPetSeconds: number) => {
      if (!sequenceItemCalculatedDataEndSeconds) return "N/A";
      const secondsRemaining = (sequenceItemCalculatedDataEndSeconds - rexPetSeconds) * -1;
      return hhmmssFromSeconds(secondsRemaining);
    },
    [sequenceItemCalculatedDataEndSeconds]
  );

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

  return (
    <div className={evaStyles.evaSequence}>
      <PetInterval
        runningRex={rexFromDbIfExecuting}
        rexPetTime={rexPetTime}
        setRexPetTime={setRexPetTime}
      />

      <div
        className={evaStyles.evaItem}
        key={`${traverseUuid}`}
        onMouseEnter={() => {
          dispatch(
            setHoverUuidsForSequence({ sequenceUuid: traverseUuid, mapItemType: "traverse" })
          );
        }}
        onMouseLeave={() => {
          dispatch(setHoverUuidsForSequence({ sequenceUuid: null, mapItemType: null }));
        }}
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
            editPerms={!!(editPerms && rexFromDbIfExecuting)} // the !! converts result into boolean
          />
        )}
        <div
          className={`${evaStyles.evaItemName} ${
            editMode && evaStyles.editMode
          }  ${evaSequenceStyle} ${
            getRexStatusDisplayProperties(traverseRexStatus).customTextClassName
          }`}
          onClick={() => {
            if (editMode) return;

            handleSequenceItemClick(traverseUuid);
          }}
        >
          <div className={evaStyles.evaItemLeft}>
            <div className={`${evaStyles.evaTraverseNameText}`}>
              {getTraverseDisplay(traverseName)}
            </div>
            <ModifiedIndicator
              obj1={[thisTraverseForModified]}
              obj2={[thisTraverseFromDbForModified]}
            />
          </div>
          <div className={evaStyles.evaItemRight}>
            <div
              className={evaStyles.evaItemRightItem}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={"Est traverse time"}
              data-tooltip-place="right"
            >
              {displayTraverseDuration()}
            </div>

            {isRexRunning && traverseRexStatus === "in-progress" && (
              <div
                className={evaStyles.evaItemRightItem}
                data-tooltip-id="aegis-tooltip"
                data-tooltip-html={"Time remaining"}
                data-tooltip-place="right"
              >
                {displayInProgressItemTimeRemaining(secondsFromhhmmss(rexPetTime))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SequenceItemTraverse;
