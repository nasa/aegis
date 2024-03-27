import { ModifiedIndicator } from "components/interface/_global-elements";
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import { useAppSelector, refEqual, shallowEqual, deepEqual } from "utils/useAppSelector";
import { setSelectedEvaRightNavItem, setSelectedEvaUuid } from "store/eva";
import evaStyles from "./eva.module.css";
import { secondsFromhhmmss, hhmmssFromSeconds, hmmFromMinutes } from "utils/formatting";
import { setHoverUuidsForSequence } from "store/hover";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { getRexStatusDisplayProperties } from "../../../utils/rex";
import _ from "lodash";
import PetInterval from "components/interface/page/petInterval";
import { RexStatusMenu } from "../rex/rex";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import {
  getCalculatedFieldsByEva,
  getCalculatedFieldsByTraverse,
} from "store/processing/calculatedFields";

const SequenceItemTraverse: FunctionComponent<{
  evaUuid: string;
  traverseUuid: string;
  editMode: boolean;
  isRexRunning: boolean;
}> = ({ evaUuid, traverseUuid, editMode, isRexRunning }) => {
  const dispatch = useAppDispatch();

  const thisTraverse = useAppSelector(
    (state) => state.traverse.traverses.find((traverse) => traverse.uuid === traverseUuid),
    deepEqual
  );
  const thisTraverseFromDb = useAppSelector(
    (state) => state.traverse.traversesFromDb.find((traverse) => traverse.uuid === traverseUuid),
    deepEqual
  );
  const thisTraverseCalculatedFields = useAppSelector(
    (state) =>
      getCalculatedFieldsByTraverse({
        traverseUuid,
        wholeStoreState: state,
      }),
    deepEqual
  );

  const traverseRexStatus = useAppSelector((state) => {
    const rex = state.rex.rexesFromDb.find((rex) => rex.isRunning);
    if (!rex || !rex.traverseEntries) return null;
    return _.last(rex.traverseEntries[traverseUuid])?.rexStatus;
  }, shallowEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );

  const sequenceItemMetadata = useAppSelector(
    (state) =>
      getCalculatedFieldsByEva({
        evaUuid,
        wholeStoreState: state,
      })?.sequenceItemsCalculatedData?.find((sequenceItem) => sequenceItem.uuid === traverseUuid),
    deepEqual
  );

  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);
  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning),
    deepEqual
  );
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");
  const [evaSequenceStyle, setEvaSequenceStyle] = useState<string>(null);

  useEffect(() => {
    let isEvaSequenceItemSelectedOrHoveredStyle = null;
    if (traverseUuid === selectedEvaSequenceItemUuid) {
      isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameSelected;
    } else if (traverseUuid === hoverItemUuid) {
      isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameHoverMode;
    }

    // add rex status styles
    if (isRexRunning) {
      if (traverseRexStatus === "in-progress") {
        isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexInProgress;
        if (traverseUuid === selectedEvaSequenceItemUuid) {
          isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexInProgressSelected;
        }
      } else if (traverseRexStatus === "complete") {
        isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexComplete;
        if (traverseUuid === selectedEvaSequenceItemUuid) {
          isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameSelected;
        }
      } else if (traverseRexStatus === "skipped") {
        isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexSkipped;
        if (traverseUuid === selectedEvaSequenceItemUuid) {
          isEvaSequenceItemSelectedOrHoveredStyle = evaStyles.evaItemNameRexSkippedSelected;
        }
      }
    }
    setEvaSequenceStyle(isEvaSequenceItemSelectedOrHoveredStyle);
  }, [hoverItemUuid, isRexRunning, traverseRexStatus, selectedEvaSequenceItemUuid, traverseUuid]);

  const displayTraverseDuration = useCallback(() => {
    const durationMinutes = thisTraverseCalculatedFields?.durationMinutes || null;
    return !isNaN(durationMinutes) ? hmmFromMinutes(durationMinutes) : "N/A";
  }, [thisTraverseCalculatedFields]);

  const displayInProgressItemTimeRemaining = useCallback(
    (rexPetSeconds: number) => {
      if (!sequenceItemMetadata) return "N/A";
      const secondsRemaining = (sequenceItemMetadata.endSeconds - rexPetSeconds) * -1;
      return hhmmssFromSeconds(secondsRemaining);
    },
    [sequenceItemMetadata]
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
        runningRex={runningRexFromDb}
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

        {isRexRunning && (
          <RexStatusMenu
            rexStatus={traverseRexStatus}
            divClassName={evaStyles.rexStatusWrapper}
            entryType="traverse"
            uuid={traverseUuid}
            editPerms={editPerms}
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
              {getTraverseDisplay(thisTraverse?.name)}
            </div>
            <ModifiedIndicator obj1={[thisTraverse]} obj2={[thisTraverseFromDb]} />
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
