import { LoadingOverlay } from "components/interface/_global-elements";
import { Dropdown } from "components/interface/form/globalFields";
import type { FunctionComponent, MouseEvent } from "react";
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
  faClone,
  faEllipsisV,
  faPersonWalkingArrowRight,
  faPlusCircle,
} from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDocDuplicateEva, thunkUIChangeEvaDropdown } from "store/thunk/thunkEva";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { thunkDocCreateRex } from "store/thunk/thunkRex";
import { setSelectedRexUuid } from "store/rex";
import { EvaSequence } from "./eva-item-sequence";
import { useMissionDocSelector } from "utils/useDocSelector";

const EvaItemMenu: FunctionComponent<{
  selectedEvaUuid: string;
  asPlannedEvaUuid: string;
}> = ({ selectedEvaUuid, asPlannedEvaUuid }) => {
  const dispatch = useAppDispatch();
  const dialogRef = useRef(null);
  const menuRef = useRef(null);
  const isSelectedEvaUuidARex = useMissionDocSelector(
    (mission) =>
      mission.rexes
        ? Object.values(mission.rexes).some((rex) => rex.evaUuid === selectedEvaUuid)
        : false,
    refEqual
  );
  const [showOverlay, setShowOverlay] = useState<{ showOverlay: boolean; message?: string }>({
    showOverlay: false,
    message: "",
  });
  const showRunningRexOnly = useAppSelector((state) => state.eva.showRunningRexOnly, refEqual);

  const handleMenuOpen = (e: MouseEvent) => {
    const x = e.clientX + 5;
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${e.clientY}px`;
  };

  // enabled: !!selectedEvaUuid && !isSelectedEvaUuidARex
  const handleDuplicateEVA = async () => {
    if (selectedEvaUuid) {
      setShowOverlay({ showOverlay: true, message: "Duplicating EVA..." });
      try {
        await dispatch(
          thunkDocDuplicateEva({
            evaUuid: selectedEvaUuid,
            includeStations: false,
            isRexEva: false,
          })
        );
      } finally {
        setShowOverlay({ showOverlay: false });
      }
    }
  };

  // enabled: !!selectedEvaUuid
  const handleDuplicateEVAWithStations = async () => {
    if (selectedEvaUuid) {
      if (
        confirm(
          "This will duplicate the EVA and also make duplicates of all stations in this EVA and will name them 'station name (copy X)'. Are you sure?"
        )
      ) {
        setShowOverlay({
          showOverlay: true,
          message: "Duplicating EVA with Stations...",
        });
        try {
          await dispatch(
            thunkDocDuplicateEva({
              evaUuid: selectedEvaUuid,
              includeStations: true,
              isRexEva: false,
            })
          );
        } finally {
          setShowOverlay({ showOverlay: false });
        }
      }
    }
  };

  const handleAddRex = async () => {
    setShowOverlay({
      showOverlay: true,
      message: "Creating Real-time Execution (REX)...",
    });
    try {
      await dispatch(thunkDocCreateRex({ asPlannedEvaUuid }));
    } finally {
      setShowOverlay({ showOverlay: false });
    }
  };

  return (
    !showRunningRexOnly && (
      <>
        <dialog
          ref={dialogRef}
          className={evaStyles.menuContainer}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dialogRef.current?.close();
          }}
        >
          <div ref={menuRef} className={evaStyles.menu}>
            <div
              className={evaStyles.menuItem}
              onClick={(e) => {
                e.stopPropagation();
                dialogRef.current?.close();
                handleAddRex();
              }}
            >
              <div className={evaStyles.menuItemIcon}>
                <FontAwesomeIcon icon={faPlusCircle} size="sm" />
              </div>
              <div className={evaStyles.menuItemText}>Add REX</div>
            </div>
            {!isSelectedEvaUuidARex && (
              <>
                <div
                  className={evaStyles.menuItem}
                  onClick={(e) => {
                    e.stopPropagation();
                    dialogRef.current?.close();
                    handleDuplicateEVA();
                  }}
                >
                  <div className={evaStyles.menuItemIcon}>
                    <FontAwesomeIcon icon={faClone} size="sm" />
                  </div>
                  <div className={evaStyles.menuItemText}>Duplicate EVA</div>
                </div>
              </>
            )}
            <div
              className={evaStyles.menuItem}
              onClick={(e) => {
                e.stopPropagation();
                dialogRef.current?.close();
                handleDuplicateEVAWithStations();
              }}
            >
              <div className={evaStyles.menuItemIcon}>
                <FontAwesomeIcon icon={faClone} size="sm" />
              </div>
              <div className={evaStyles.menuItemText}>Duplicate w/ Stations</div>
            </div>
          </div>
        </dialog>
        <FontAwesomeIcon
          icon={faEllipsisV}
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMenuOpen(e);
            dialogRef.current?.showModal();
          }}
          className={evaStyles.kebabIcon}
          tabIndex={0}
        />

        {showOverlay.showOverlay && <LoadingOverlay message={showOverlay.message} />}
      </>
    )
  );
};

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

  const showEvaMenu = useAppSelector(
    (state) => state.user.missionPerms.permissions.edit && state.mission.isInEditMode,
    refEqual
  );

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
                data-tooltip-content={"Execution in Progress"}
              />
            )}
            {showEvaMenu && (
              <EvaItemMenu selectedEvaUuid={selectedEvaUuid} asPlannedEvaUuid={asPlannedEva.uuid} />
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
          </div>
        </div>
      </div>
      {isExpanded && <EvaSequence evaUuid={dropdownEvaUuid} />}
    </div>
  );
};

export default EvaItem;
