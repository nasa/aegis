import { ModifiedIndicator } from "components/interface/_global-elements";
import { Button, Dropdown } from "components/interface/form/globalFields";
import { FunctionComponent, useCallback, useMemo, useState } from "react";
import { useAppSelector, refEqual, shallowEqual, deepEqual } from "utils/useAppSelector";
import {
  upsertExpandedEvaUuids,
  setSelectedEvaUuid,
  setSelectedEvaSequenceItemUuid,
  deleteExpandedEvaUuids,
} from "store/eva";
import evaStyles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faCaretRight,
  faPersonWalkingArrowRight,
  faPlusCircle,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import EvaItemSequence from "./eva-item-sequence";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkAddStationToEva, thunkChangeEvaDropdown } from "store/thunk/thunkEva";
import {
  decodeEmoji,
  hhmmssFromSeconds,
  hmmFromMinutes,
  isNotNumber,
  secondsFromhhmmss,
} from "utils/formatting";
import { setHoverUuidsForSequence } from "store/hover";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { RexStatusMenu } from "../rex/rex-status-menu";
import PetInterval from "components/page/petInterval";
import { getCalculatedFieldsByEva } from "store/processing/calculatedFields";
import { thunkCreateRex } from "store/thunk/thunkRex";
import { setSelectedRexUuid } from "store/rex";

const EvaItem: FunctionComponent<{ evaUuid: string; first?: boolean }> = ({
  evaUuid,
  first = false,
}) => {
  const dispatch = useAppDispatch();

  const asPlannedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === evaUuid),
    deepEqual
  );

  // for the dropdown, get the list of rexes for the as-planned eva
  const evaRexesPartialForDropdown = useAppSelector((state) => {
    const evasUuidsWithSameRefUuid = state.eva.evas
      .filter((e) => e.refUuid === asPlannedEva.refUuid)
      .map((e) => e.uuid);
    const rexes = state.rex.rexesFromDb.filter(
      (rex) => evasUuidsWithSameRefUuid.includes(rex.evaUuid) && rex.evaUuid !== asPlannedEva.uuid
    );
    if (state.eva.showRunningRexOnly) {
      // only show rex that is running
      return rexes.filter((rex) => rex.isRunning);
    }
    const unsortedRexes = rexes.map((r) => {
      return {
        uuid: r.uuid,
        name: r.name,
        isRunning: r.isRunning,
        evaUuid: r.evaUuid,
      };
    });
    return unsortedRexes.sort((a, b) => a.name.localeCompare(b.name)); // sort by name
  }, deepEqual);
  const dropdownEvaUuid = useAppSelector(
    (state) => state.eva.evaDropdownUIStates[asPlannedEva.uuid] || asPlannedEva.uuid,
    refEqual
  );
  const dropdownRexUuid = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.evaUuid === dropdownEvaUuid)?.uuid || null,
    refEqual
  );
  const isDropdownRexUuidRunning = useAppSelector(
    (state) =>
      state.rex.rexesFromDb.find((rex) => rex.uuid === dropdownRexUuid)?.isRunning || false,
    refEqual
  );
  const showRunningRexOnly = useAppSelector((state) => state.eva.showRunningRexOnly, refEqual);

  // this eva is the one in the dropdown. It may be different than the component prop asPlannedEva.
  const thisEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === dropdownEvaUuid),
    deepEqual
  );
  const thisEvaFromDb = useAppSelector(
    (state) => state.eva.evasFromDb.find((evaItem) => evaItem.uuid === dropdownEvaUuid),
    deepEqual
  );
  const evaTraversesForModified = useAppSelector((state) => {
    const traverseUuidInEva = thisEva?.sequence.filter((item) => item.type === "traverse");
    const traverseSubset = state.traverse.traverses.filter((traverse) =>
      traverseUuidInEva.find((traverseUuid) => traverseUuid.uuid === traverse.uuid)
    );
    return traverseSubset.map((traverse) => {
      return { uuid: traverse.uuid, updatedAt: traverse.updatedAt };
    });
  }, deepEqual);
  const evaTraversesFromDbForModified = useAppSelector((state) => {
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
  // tracking the expand/collapse state is off of the as-planned eva uuid
  const isExpanded = useAppSelector(
    (state) => state.eva.expandedEvaUuids.includes(asPlannedEva.uuid),
    shallowEqual
  );

  // set styles. if this eva is selected, highlight it. if the sequence item is selected, emphasize it
  const selectedStyleState: null | "highlight" = useMemo(() => {
    if (dropdownEvaUuid === selectedEvaUuid && selectedEvaSequenceItemUuid === null) {
      return "highlight";
    }
    return null;
  }, [dropdownEvaUuid, selectedEvaUuid, selectedEvaSequenceItemUuid]);

  const handleClickOnEvaName = useCallback(() => {
    if (selectedEvaUuid === dropdownEvaUuid && selectedEvaSequenceItemUuid === null) {
      // reselecting the currently selected item. Deselect it
      dispatch(setSelectedEvaUuid(null));
      dispatch(setSelectedRexUuid(null));
      dispatch(thunkSetRightPanelIsOpenIfAuto(false));
    } else {
      dispatch(setSelectedEvaUuid(dropdownEvaUuid));
      dispatch(setSelectedRexUuid(dropdownRexUuid));
      dispatch(thunkSetRightPanelIsOpenIfAuto(true));
      dispatch(upsertExpandedEvaUuids([asPlannedEva.uuid]));
    }
    dispatch(setSelectedEvaSequenceItemUuid(null));
  }, [
    selectedEvaUuid,
    dropdownEvaUuid,
    selectedEvaSequenceItemUuid,
    dispatch,
    dropdownRexUuid,
    asPlannedEva.uuid,
  ]);

  // used for the loading overlay when creating a new REX
  const [isCreatingRex, setIsCreatingRex] = useState(false);

  return (
    <div
      className={evaStyles.evaContainer}
      style={{ borderTop: first ? null : "1px var(--grey3) solid" }}
    >
      <div className={evaStyles.nameitem} key={asPlannedEva.uuid}>
        <div
          className={`${evaStyles.nameCaret}`}
          onClick={() => {
            // toggle the expansion of this eva item
            // expand/collapse is based off the as-planned eva
            if (isExpanded) {
              dispatch(deleteExpandedEvaUuids([asPlannedEva.uuid]));
            } else {
              dispatch(upsertExpandedEvaUuids([asPlannedEva.uuid]));
            }
          }}
        >
          <FontAwesomeIcon
            icon={isExpanded ? faCaretDown : faCaretRight}
            style={{ color: "var(--grey4)" }}
          />
        </div>
        <div
          className={`${evaStyles.name} ${selectedStyleState === "highlight" && evaStyles.nameSelected}`}
          onClick={() => {
            handleClickOnEvaName();
          }}
        >
          <div className={evaStyles.nameText}>{asPlannedEva.name}</div>
          <ModifiedIndicator
            obj1={[thisEva, ...evaTraversesForModified]}
            obj2={[thisEvaFromDb, ...evaTraversesFromDbForModified]}
          />

          <div className={evaStyles.nameSpacer} />
          {isDropdownRexUuidRunning && (
            <div
              className={`${selectedStyleState === "highlight" ? evaStyles.rexIconWrapperSelected : evaStyles.rexIconWrapper}`}
            >
              <FontAwesomeIcon icon={faPersonWalkingArrowRight} />
            </div>
          )}
          <div className={evaStyles.nameIcons}>
            <Dropdown
              selected={dropdownEvaUuid}
              arrowClassName={evaStyles.dropdownArrow}
              selectClassName={`${evaStyles.dropdownSelector}`}
              onChange={async (val) => {
                dispatch(upsertExpandedEvaUuids([asPlannedEva.uuid]));
                if (val === "") {
                  setIsCreatingRex(true); // Show loading overlay
                  try {
                    await dispatch(thunkCreateRex({ asPlannedEvaUuid: asPlannedEva.uuid }));
                  } finally {
                    // Hide loading overlay when operation completes (success or failure)
                    setIsCreatingRex(false);
                  }
                } else {
                  dispatch(
                    thunkChangeEvaDropdown({
                      dropdownEvaUuid: val,
                      asPlanedEvaUuid: asPlannedEva.uuid,
                    })
                  );
                }
              }}
              toolTip="Executions"
            >
              {!showRunningRexOnly && (
                <option key={asPlannedEva.uuid} value={asPlannedEva.uuid}>
                  As Planned
                </option>
              )}
              {evaRexesPartialForDropdown.map((rexPartial) => (
                <option key={rexPartial.uuid} value={rexPartial.evaUuid}>
                  {rexPartial.name}
                </option>
              ))}
              {!showRunningRexOnly && (
                <option key={""} value={""}>
                  + Add REX
                </option>
              )}
            </Dropdown>
            <FontAwesomeIcon icon={faSliders} style={{}} />
          </div>
        </div>
      </div>
      {isExpanded && <EvaSequence evaUuid={dropdownEvaUuid} />}

      {/* Loading overlay */}
      {isCreatingRex && (
        <div className={evaStyles.loadingOverlay}>
          <div className={evaStyles.loadingSpinner}></div>
          <div>Creating REX Execution...</div>
        </div>
      )}
    </div>
  );
};

export default EvaItem;

export const EvaSequence: FunctionComponent<{
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
      <div className={evaStyles.evaSequenceContainer}>
        <EvaEgressIngressListing eva={eva} isEgress={true} isRexEva={isRexEva} />
        <EvaItemSequence evaUuid={evaUuid} />
        <EvaEgressIngressListing eva={eva} isEgress={false} isRexEva={isRexEva} />
      </div>
      {editMode && (
        <div className={evaStyles.evaFooterContainer}>
          <div className={paneStyles.iconButtons}>
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

export const EvaEgressIngressListing: FunctionComponent<{
  eva: Eva;
  isEgress: boolean;
  isRexEva: boolean;
}> = ({ isEgress, eva, isRexEva }) => {
  const dispatch = useAppDispatch();
  const station = useAppSelector((state) => {
    return state.station.stations.find(
      (station) => station.uuid === (isEgress ? eva.egressLocationUuid : eva.ingressLocationUuid)
    );
  }, deepEqual);

  // returns the rex from db object if this is a rex eva and is executing
  const rexFromDbIfExecuting = useAppSelector((state) => {
    if (!isRexEva) return null;
    return state.rex.rexesFromDb.find((rex) => rex.isRunning && rex.evaUuid === eva.uuid);
  }, deepEqual);

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);

  const xgressIdentifier = isEgress ? "egress" : "ingress";

  const xgressRexStatus = useAppSelector((state) => {
    const rex = state.rex.rexes.find((rex) => rex.evaUuid === eva.uuid);
    if (!rex || !rex.xgressEntries) return null;
    return rex.xgressEntries[xgressIdentifier]?.rexStatus;
  }, deepEqual);

  const [rexPetTime, setRexPetTime] = useState("");

  const evaCalculatedFields: EvaCalculatedFields = useAppSelector(
    (state) =>
      getCalculatedFieldsByEva({
        evaUuid: eva.uuid,
        evas: state.eva.evas,
        stations: state.station.stations,
        mission: state.mission.mission,
        actions: state.action.actions,
        traverses: state.traverse.traverses,
      }),
    deepEqual
  );

  const displayInProgressItemTimeRemaining = useCallback(
    (rexPetSeconds: number) => {
      let totalEvaTime;
      if (isNotNumber(eva.duration)) {
        if (evaCalculatedFields) {
          totalEvaTime = evaCalculatedFields.totalEvaTime;
        } else {
          return null;
        }
      } else {
        totalEvaTime = eva.duration;
      }
      let secondsRemaining = 0;
      if (xgressIdentifier === "egress") {
        secondsRemaining = (eva.egressDuration * 60 - rexPetSeconds) * -1;
      } else {
        secondsRemaining = (totalEvaTime * 60 - eva.ingressDuration * 60 - rexPetSeconds) * -1;
      }
      return hhmmssFromSeconds(secondsRemaining);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evaCalculatedFields, eva]
  );

  let xgressStyle = null;
  if (
    (xgressIdentifier === "egress" && hoverItemUuid === eva.egressLocationUuid) ||
    (xgressIdentifier === "ingress" && hoverItemUuid === eva.ingressLocationUuid)
  ) {
    xgressStyle = evaStyles.evaItemNameHoverMode;
  }

  if (xgressRexStatus === "in-progress") {
    xgressStyle = evaStyles.evaItemNameRexInProgress;
  } else if (xgressRexStatus === "complete") {
    xgressStyle = evaStyles.evaItemNameRexComplete;
  } else if (xgressRexStatus === "skipped") {
    xgressStyle = evaStyles.evaItemNameRexSkipped;
  }

  const icon = station ? station.icon : "1f680"; //rocket
  const name = `${isEgress ? "Egress" : "Ingress"} at ${station ? station.name : "Lander"}`;

  return (
    <div className={evaStyles.evaItem}>
      <PetInterval
        runningRex={rexFromDbIfExecuting}
        rexPetTime={rexPetTime}
        setRexPetTime={setRexPetTime}
      />
      <div className={evaStyles.iconCustom}>{decodeEmoji(icon)}</div>
      {isRexEva && (
        <RexStatusMenu
          rexStatus={xgressRexStatus}
          divClassName={evaStyles.rexStatusWrapper}
          entryType="xgress"
          uuid={xgressIdentifier}
          editPerms={!!(editPerms && rexFromDbIfExecuting)} // the !! converts result into boolean
        />
      )}
      <div
        className={`${evaStyles.evaItemName} ${xgressStyle}`}
        style={{ cursor: "pointer" }}
        onClick={() => {
          dispatch(setSelectedEvaUuid(eva.uuid));
          dispatch(thunkSetRightPanelIsOpenIfAuto(true));
          dispatch(setSelectedEvaSequenceItemUuid(null));
        }}
        onMouseEnter={() => {
          dispatch(
            setHoverUuidsForSequence({
              sequenceUuid: isEgress ? eva.egressLocationUuid : eva.ingressLocationUuid,
              mapItemType: null,
            })
          );
        }}
        onMouseLeave={() => {
          dispatch(setHoverUuidsForSequence({ sequenceUuid: null, mapItemType: null }));
        }}
      >
        <div className={evaStyles.evaItemLeft}>
          <div className={evaStyles.evaItemNameText}>{name}</div>
        </div>
        <div className={evaStyles.evaItemRight}>
          <div
            className={evaStyles.evaItemRightItem}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html={isEgress ? "Egress duration (hh:mm)" : "Ingress duration (hh:mm)"}
            data-tooltip-place="right"
          >
            {hmmFromMinutes(isEgress ? eva.egressDuration : eva.ingressDuration)}
          </div>
          {rexFromDbIfExecuting && xgressRexStatus === "in-progress" && (
            <div
              className={evaStyles.evaItemRightItem}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={"Time remaining (hh:mm:ss)"}
              data-tooltip-place="right"
            >
              {displayInProgressItemTimeRemaining(secondsFromhhmmss(rexPetTime))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
