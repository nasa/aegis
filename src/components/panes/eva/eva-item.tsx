import { LoadingOverlay } from "components/interface/_global-elements";
import { Button, Dropdown } from "components/interface/form/globalFields";
import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppSelector, refEqual, shallowEqual, deepEqual } from "utils/useAppSelector";
import {
  upsertExpandedEvaUuids,
  setSelectedEvaUuid,
  setSelectedEvaSequenceItemUuid,
  deleteExpandedEvaUuids,
} from "store/eva";
import evaStyles from "./eva.module.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faCaretRight,
  faPersonWalkingArrowRight,
  faPlusCircle,
} from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkUIChangeEvaDropdown } from "store/thunk/thunkEva";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { thunkDocCreateRex } from "store/thunk/thunkRex";
import { setSelectedRexUuid } from "store/rex";
import { EvaSequence } from "./eva-item-sequence";
import { useMissionDocSelector } from "utils/useDocSelector";

const EvaItem: FunctionComponent<{ asPlannedEvaUuid: string; first?: boolean }> = ({
  asPlannedEvaUuid,
  first = false,
}) => {
  const dispatch = useAppDispatch();

  const asPlannedEva = useMissionDocSelector(
    (mission) => mission.evas?.[asPlannedEvaUuid] ?? null,
    refEqual
  );

  // For the dropdown, get the list of rexes for the as-planned eva
  const evaRexesPartialForDropdown = useMissionDocSelector((mission) => {
    const eva = mission.evas?.[asPlannedEvaUuid];
    if (!eva || !mission.evas || !mission.rexes) return [];
    const evaUuidsWithSameRefUuid = Object.values(mission.evas)
      .filter((e) => e.refUuid === eva.refUuid)
      .map((e) => e.uuid);
    const rexes = Object.values(mission.rexes).filter(
      (rex) => evaUuidsWithSameRefUuid.includes(rex.evaUuid) && rex.evaUuid !== eva.uuid
    );
    const unsortedRexes = rexes.map((r) => ({
      uuid: r.uuid,
      name: r.name,
      isRunning: r.isRunning,
      evaUuid: r.evaUuid,
    }));
    return unsortedRexes.sort((a, b) => a.name.localeCompare(b.name));
  }, deepEqual);

  const showRunningRexOnly = useAppSelector((state) => state.eva.showRunningRexOnly, refEqual);
  const filteredEvaRexesPartialForDropdown = useMemo(() => {
    if (showRunningRexOnly) return evaRexesPartialForDropdown?.filter((r) => r.isRunning) ?? [];
    return evaRexesPartialForDropdown ?? [];
  }, [evaRexesPartialForDropdown, showRunningRexOnly]);

  const dropdownEvaUuid = useAppSelector(
    (state) => state.eva.evaDropdownUIStates[asPlannedEvaUuid] || asPlannedEvaUuid,
    refEqual
  );
  const dropdownRexUuid = useMissionDocSelector(
    (mission) =>
      Object.values(mission.rexes ?? {}).find((rex) => rex.evaUuid === dropdownEvaUuid)?.uuid ??
      null,
    refEqual
  );

  const isDropdownRexUuidRunning = useMissionDocSelector(
    (mission) => (dropdownRexUuid ? (mission.rexes?.[dropdownRexUuid]?.isRunning ?? false) : false),
    refEqual
  );

  // Interface stuff
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  // Tracking the expand/collapse state is off of the as-planned eva uuid
  const isExpanded = useAppSelector(
    (state) => state.eva.expandedEvaUuids.includes(asPlannedEvaUuid),
    shallowEqual
  );
  const showAddRexButton = useAppSelector(
    (state) => state.user.missionPerms.permissions.edit && state.mission.isInEditMode,
    refEqual
  );

  // Set styles. if this eva is selected, highlight it. if the sequence item is selected, emphasize it
  const selectedStyleState: null | "highlight" =
    dropdownEvaUuid === selectedEvaUuid && selectedEvaSequenceItemUuid === null
      ? "highlight"
      : null;

  const handleClickOnEvaName = useCallback(() => {
    if (selectedEvaUuid === dropdownEvaUuid && selectedEvaSequenceItemUuid === null) {
      // Re-selecting the currently selected item. Deselect it
      dispatch(setSelectedEvaUuid(null));
      dispatch(setSelectedRexUuid(null));
      dispatch(thunkSetRightPanelIsOpenIfAuto(false));
    } else {
      dispatch(setSelectedEvaUuid(dropdownEvaUuid));
      dispatch(setSelectedRexUuid(dropdownRexUuid));
      dispatch(thunkSetRightPanelIsOpenIfAuto(true));
      dispatch(upsertExpandedEvaUuids([asPlannedEvaUuid]));
    }
    dispatch(setSelectedEvaSequenceItemUuid(null));
  }, [
    selectedEvaUuid,
    dropdownEvaUuid,
    selectedEvaSequenceItemUuid,
    dispatch,
    dropdownRexUuid,
    asPlannedEvaUuid,
  ]);

  // Scroll into view when this EVA becomes selected (e.g. after add/duplicate)
  const itemRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedStyleState === "highlight") {
      itemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedStyleState]);

  // Used for the loading overlay when creating a new REX
  const [isCreatingRex, setIsCreatingRex] = useState(false);

  if (!asPlannedEva) return null;

  return (
    <div
      ref={itemRef}
      className={evaStyles.evaContainer}
      style={{ borderTop: first ? null : "1px var(--grey3) solid" }}
    >
      <div className={evaStyles.nameitem} key={asPlannedEva.uuid}>
        <div
          className={`${evaStyles.nameCaret}`}
          onClick={() => {
            // Toggle the expansion of this eva item
            // Expand/collapse is based off the as-planned eva
            if (isExpanded) {
              dispatch(deleteExpandedEvaUuids([asPlannedEvaUuid]));
            } else {
              dispatch(upsertExpandedEvaUuids([asPlannedEvaUuid]));
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
          <div className={evaStyles.nameTopRow}>
            <div className={evaStyles.nameText}>{asPlannedEva.name}</div>
            <div className={evaStyles.nameSpacer} />
            {isDropdownRexUuidRunning && (
              <FontAwesomeIcon
                icon={faPersonWalkingArrowRight}
                className={`${evaStyles.rexIconWrapper} ${selectedStyleState === "highlight" && evaStyles.rexIconWrapperSelected}`}
                data-tooltip-id="aegis-tooltip"
                data-tooltip-html={"Execution in Progress"}
              />
            )}
          </div>
          <div className={evaStyles.nameBottomRow}>
            {filteredEvaRexesPartialForDropdown.length > 0 ? (
              <Dropdown
                selected={dropdownEvaUuid}
                arrowClassName={evaStyles.dropdownArrow}
                selectClassName={`${evaStyles.dropdownSelector}`}
                onChange={async (val) => {
                  dispatch(upsertExpandedEvaUuids([asPlannedEvaUuid]));
                  dispatch(
                    thunkUIChangeEvaDropdown({
                      dropdownEvaUuid: val,
                      asPlanedEvaUuid: asPlannedEvaUuid,
                    })
                  );
                }}
              >
                {!showRunningRexOnly && (
                  <option key={asPlannedEva.uuid} value={asPlannedEva.uuid}>
                    As Planned
                  </option>
                )}
                {filteredEvaRexesPartialForDropdown.map((rexPartial) => (
                  <option key={rexPartial.uuid} value={rexPartial.evaUuid}>
                    {rexPartial.name}
                  </option>
                ))}
              </Dropdown>
            ) : (
              <div className={evaStyles.noRexes}>As Planned</div>
            )}

            {showAddRexButton && (
              <Button
                onClick={async (e) => {
                  e.stopPropagation(); // Prevent click from bubbling to the EVA name div and triggering deselection
                  setIsCreatingRex(true);
                  try {
                    await dispatch(thunkDocCreateRex({ asPlannedEvaUuid: asPlannedEva.uuid }));
                  } finally {
                    setIsCreatingRex(false);
                  }
                }}
                label={"Add REX"}
                icon={faPlusCircle}
                className={evaStyles.addRexButton}
                enabled={true}
                toolTip="Add Real-time Execution (REX)"
              />
            )}
          </div>
        </div>
      </div>
      {isExpanded && <EvaSequence evaUuid={dropdownEvaUuid} />}

      {isCreatingRex && <LoadingOverlay message="Creating Real-time Execution (REX)..." />}
    </div>
  );
};

export default EvaItem;
