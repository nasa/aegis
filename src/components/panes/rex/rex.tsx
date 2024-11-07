import _ from "lodash";
import { CSSProperties, FunctionComponent, useRef } from "react";

import styles from "./rex.module.css";
import paneStyles from "../global-pane-styles.module.css";
import evaStyles from "../eva/eva.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faCaretRight,
  faPlusCircle,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual, refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { Button } from "components/interface/form/globalFields";
import { setSelectedEvaSequenceItemUuid, setSelectedEvaUuid } from "store/eva";
import EvaItemSequence from "../eva/eva-item-sequence";
import RexClocks from "./rex-clocks";
import { thunkAddRexStatusEntry, thunkCreateRex } from "store/thunk/thunkRex";
import { setExpandedRexUuids, setSelectedRexRightNavItem, setSelectedRexUuid } from "store/rex";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { setSelectedStationUuid } from "store/station";
import { ModifiedIndicator } from "components/interface/_global-elements";
import { thunkAddStationToEva } from "store/thunk/thunkEva";
import { EvaEgressIngressListing } from "../eva/eva-item";
import { getRexStatusDisplayProperties } from "utils/rex";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";

const EvaRexLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const rexes = useAppSelector((state) => state.rex.rexes, deepEqual);
  // sort the rexes by name
  const rexesSorted = _.sortBy(rexes, [(rex) => rex.name.toLowerCase()]);

  const isRexRunningFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning),
    refEqual
  );

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  return (
    <>
      <div className={styles.leftContainer}>
        <div className={styles.leftBody}>
          {isRexRunningFromDb ? (
            <div className={styles.panelContainer}>
              <EvaRexItem rexUuid={isRexRunningFromDb.uuid} />
            </div>
          ) : (
            <>
              {_.sortBy(rexesSorted, [(rex) => rex.name.toLowerCase()]).map((rex) => (
                <div className={styles.panelContainer} key={rex.uuid} aria-label="rex-item">
                  <EvaRexItem rexUuid={rex.uuid} key={rex.uuid} />
                </div>
              ))}
            </>
          )}
        </div>

        {editPerms && !isRexRunningFromDb && (
          <div className={styles.evasLeftFooter}>
            <div className={paneStyles.iconButtons}>
              <Button
                onClick={() => {
                  dispatch(thunkCreateRex());
                }}
                label="Add"
                icon={faPlusCircle}
                style={{ width: "65px" }}
              />
              {/* <Button
                onClick={() => {
                  if (selectedRexUuid) {
                    dispatch(thunkDuplicateRex({ rexUuid: selectedRexUuid }));
                  }
                }}
                label="Duplicate"
                icon={faClone}
                enabled={!_.isNull(selectedRexUuid)}
                style={{ width: "95px" }}
              /> */}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default EvaRexLeft;

const EvaRexItem: FunctionComponent<{ rexUuid: string }> = ({ rexUuid }) => {
  const dispatch = useAppDispatch();
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const expandedRexUuids = useAppSelector((state) => state.rex.expandedRexUuids, shallowEqual);
  const rex = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.uuid === rexUuid),
    deepEqual
  );

  const evasEditing = useAppSelector((state) => state.eva.evasEditing, shallowEqual);

  const rexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb?.find((rexFromDb) => rexFromDb.uuid === rex.uuid),
    deepEqual
  );

  const selectedRexRightNavItem = useAppSelector(
    (state) => state.rex.selectedRexRightNavItem,
    refEqual
  );

  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedRexEvaName = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === rex.evaUuid)?.name,
    refEqual
  );

  const evaUuid = rex?.evaUuid;
  const selectedRexEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === rex?.evaUuid),
    deepEqual
  );

  let rexSelectionStyle = null;
  let settingsIconColor = "var(--grey4)";

  // if this eva is selected, highlight or emphasize it
  if (rex.uuid === selectedRexUuid) {
    rexSelectionStyle = styles.nameSelected;
    settingsIconColor = "var(--grey1)";

    if (selectedEvaUuid) {
      rexSelectionStyle = evaStyles.nameEmphasized;
      settingsIconColor = "var(--grey4)";
    }
  }

  //set eva selected style
  let evaLabelSelectedStyle = styles.selectedEvaLabelContainerEmphasized;
  if (selectedEvaUuid === rex.evaUuid && !selectedEvaSequenceItemUuid) {
    evaLabelSelectedStyle = styles.selectedEvaLabelContainerSelected;
  }
  return (
    <>
      <div
        className={styles.rexContainer}
        aria-label={rex.uuid === selectedRexUuid ? "selectedRex" : ""}
      >
        <div className={styles.nameitem} key={rex.uuid}>
          {!rexFromDb?.isRunning && (
            <div
              className={styles.nameCaret}
              onClick={() => {
                // toggle the expansion of this eva item
                if (expandedRexUuids.find((uuid) => uuid === rex.uuid)) {
                  dispatch(
                    setExpandedRexUuids(expandedRexUuids.filter((uuid) => uuid !== rex.uuid))
                  );
                } else {
                  if (!expandedRexUuids.find((uuid) => uuid === rex.uuid)) {
                    dispatch(setExpandedRexUuids([...expandedRexUuids, rex.uuid]));
                  }
                }
              }}
            >
              <FontAwesomeIcon
                icon={
                  expandedRexUuids.find((uuid) => uuid === rex.uuid) ? faCaretDown : faCaretRight
                }
                style={{ color: "var(--grey4)" }}
              />
            </div>
          )}
          <div
            className={`${styles.name} ${rexSelectionStyle}`}
            style={rexFromDb?.isRunning ? { marginLeft: "5px" } : {}}
            onClick={() => {
              if (selectedRexUuid !== rex.uuid) {
                dispatch(setSelectedRexUuid(rex.uuid));
              }

              if (!selectedRexRightNavItem) dispatch(setSelectedRexRightNavItem("info_panel"));
              dispatch(thunkSetRightPanelIsOpenIfAuto(true));

              // add this rex uuid to the expanded list if it's not already there
              if (expandedRexUuids.indexOf(rex.uuid) === -1) {
                dispatch(setExpandedRexUuids([...expandedRexUuids, rex.uuid]));
              }
              dispatch(setSelectedEvaUuid(null));
              dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: null }));
              dispatch(setSelectedStationUuid(null));
            }}
          >
            <div className={styles.nameText} aria-label="leftRexName">
              {rex.name}
            </div>
            <ModifiedIndicator obj1={[rex]} obj2={[rexFromDb]} />

            <div className={styles.nameItemRightSpacer} />
            <div className={styles.nameItemsRightButton}>
              <FontAwesomeIcon icon={faSliders} style={{ color: settingsIconColor }} />
            </div>
          </div>
        </div>
        {expandedRexUuids.find((uuid) => uuid === rex.uuid) && (
          <div className={styles.rexBody} style={rexFromDb?.isRunning ? { marginLeft: "1px" } : {}}>
            <RexClocks selectedRex={rex} />
            <div className={styles.rexEvaDropdown}>
              <div
                className={`${styles.selectedEvaLabelContainer}  ${evaLabelSelectedStyle}`}
                onClick={() => {
                  dispatch(setSelectedEvaUuid(evaUuid));
                  dispatch(setSelectedEvaSequenceItemUuid(null));
                  dispatch(setSelectedRexUuid(rex.uuid)); // if we click the eva, we want to select the rex
                }}
              >
                <div className={styles.selectedEvaLabel}>{selectedRexEvaName}</div>
                <div className={styles.rexButton}>
                  <FontAwesomeIcon icon={faSliders} size="sm" />
                </div>
              </div>
            </div>
            {selectedRexEva && (
              <>
                <EvaEgressIngressListing eva={selectedRexEva} isEgress={true} />
                <EvaItemSequence
                  evaUuid={selectedRexEva.uuid}
                  evaSequence={selectedRexEva?.sequence}
                  editMode={evasEditing.includes(selectedRexEva.uuid)}
                />
                <EvaEgressIngressListing eva={selectedRexEva} isEgress={false} />
              </>
            )}
            {evasEditing.includes(selectedEvaUuid) && (
              <div className={evaStyles.evaFooterContainer}>
                <div className={paneStyles.iconButtons}>
                  <Button
                    onClick={() => {
                      dispatch(thunkAddStationToEva({ evaUuid: selectedEvaUuid }));
                    }}
                    label="Add Station"
                    icon={faPlusCircle}
                    style={{ width: "105px" }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export const RexStatusMenu: FunctionComponent<{
  rexStatus: RexStatus;
  divClassName: string;
  divStyle?: CSSProperties;
  entryType: "action" | "station" | "traverse";
  uuid: string;
  editPerms: boolean;
}> = ({ rexStatus, divClassName, divStyle = {}, entryType, uuid, editPerms }): JSX.Element => {
  const dispatch = useAppDispatch();
  const rexStatusDisplayProperties = getRexStatusDisplayProperties(rexStatus);
  const dialogRef = useRef(null);
  const menuRef = useRef(null);

  const handleMenuOpen = (e: React.MouseEvent) => {
    const x = e.clientX + 5; // width of the menu
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${e.clientY}px`;
  };

  const handleRexStatusClick = (rexStatus: RexStatus) => {
    dispatch(thunkAddRexStatusEntry({ entryType, uuid, rexStatus }));
    dialogRef.current?.close();
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        className={styles.rexStatusContainer}
        onClick={() => {
          dialogRef.current?.close();
        }}
      >
        <div ref={menuRef} className={styles.rexStatusMenu}>
          <RexStatusMenuItem
            rexStatus="pending"
            title="Pending"
            handleRexStatusClick={handleRexStatusClick}
          />
          <RexStatusMenuItem
            rexStatus="in-progress"
            title="In-Progress"
            handleRexStatusClick={handleRexStatusClick}
          />
          <RexStatusMenuItem
            rexStatus="complete"
            title="Complete"
            handleRexStatusClick={handleRexStatusClick}
          />
          <RexStatusMenuItem
            rexStatus="skipped"
            title="Skipped"
            handleRexStatusClick={handleRexStatusClick}
          />
        </div>
      </dialog>
      <div
        className={divClassName}
        style={{ ...divStyle, cursor: editPerms ? "pointer" : "default" }}
        onClick={(e) => {
          if (!editPerms) return;
          handleMenuOpen(e);
          dialogRef.current?.showModal();
          e.stopPropagation();
        }}
        data-tooltip-id="aegis-tooltip"
        data-tooltip-html={rexStatusDisplayProperties.tooltip}
      >
        <FontAwesomeIcon
          icon={rexStatusDisplayProperties.icon}
          className={`${evaStyles.rexStatusIcon} ${rexStatusDisplayProperties.iconStyle}`}
        />
      </div>
    </>
  );
};

const RexStatusMenuItem: FunctionComponent<{
  rexStatus: RexStatus;
  title: string;
  handleRexStatusClick: Function;
}> = ({ rexStatus, title, handleRexStatusClick }) => {
  return (
    <div
      className={styles.rexStatusMenuItem}
      onClick={() => {
        handleRexStatusClick(rexStatus);
      }}
    >
      <FontAwesomeIcon
        icon={getRexStatusDisplayProperties(rexStatus).icon}
        className={`${evaStyles.rexStatusMenuIcon} ${getRexStatusDisplayProperties(rexStatus).iconStyle}`}
      />
      <div className={styles.rexStatusMenuItemTitle}>{title}</div>
    </div>
  );
};
