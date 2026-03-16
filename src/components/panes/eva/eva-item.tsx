import { LoadingOverlay, ModifiedIndicator } from "components/interface/_global-elements";
import { Button, Dropdown } from "components/interface/form/globalFields";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useState } from "react";
import { useAppSelector, refEqual, deepEqual, shallowEqual } from "utils/useAppSelector";
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
import { thunkChangeEvaDropdown } from "store/thunk/thunkEva";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { thunkCreateRex } from "store/thunk/thunkRex";
import { setSelectedRexUuid } from "store/rex";
import { EvaSequence } from "./eva-item-sequence";

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
      traverseUuidInEva?.find((traverseUuid) => traverseUuid.uuid === traverse.uuid)
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
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  // set styles. if this eva is selected, highlight it. if the sequence item is selected, emphasize it
  const selectedStyleState: null | "highlight" = useMemo(() => {
    if (dropdownEvaUuid === selectedEvaUuid && selectedEvaSequenceItemUuid === null) {
      return "highlight";
    }
    return null;
  }, [dropdownEvaUuid, selectedEvaUuid, selectedEvaSequenceItemUuid]);

  const handleClickOnEvaName = useCallback(() => {
    if (selectedEvaUuid === dropdownEvaUuid && selectedEvaSequenceItemUuid === null) {
      // re-selecting the currently selected item. Deselect it
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
          <div className={evaStyles.nameTopRow}>
            <div className={evaStyles.nameText}>{asPlannedEva.name}</div>
            <ModifiedIndicator
              obj1={[thisEva, ...evaTraversesForModified]}
              obj2={[thisEvaFromDb, ...evaTraversesFromDbForModified]}
            />

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
            {evaRexesPartialForDropdown.length > 0 ? (
              <Dropdown
                selected={dropdownEvaUuid}
                arrowClassName={evaStyles.dropdownArrow}
                selectClassName={`${evaStyles.dropdownSelector}`}
                onChange={async (val) => {
                  dispatch(upsertExpandedEvaUuids([asPlannedEva.uuid]));
                  dispatch(
                    thunkChangeEvaDropdown({
                      dropdownEvaUuid: val,
                      asPlanedEvaUuid: asPlannedEva.uuid,
                    })
                  );
                }}
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
              </Dropdown>
            ) : (
              <div className={evaStyles.noRexes}>As Planned</div>
            )}

            {editPerms && (
              <Button
                onClick={async () => {
                  setIsCreatingRex(true); // Show loading overlay
                  try {
                    await dispatch(thunkCreateRex({ asPlannedEvaUuid: asPlannedEva.uuid }));
                  } finally {
                    // Hide loading overlay when operation completes (success or failure)
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
