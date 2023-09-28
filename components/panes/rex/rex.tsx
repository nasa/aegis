import _ from "lodash";
import { FunctionComponent } from "react";

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
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import { Button } from "components/interface/form/globalFields";
import { setSelectedEvaSequenceItemUuid, setSelectedEvaUuid } from "store/eva";
import EvaItemSequence from "../eva/eva-item-sequence";
import RexClocks from "./rex-clocks";
import { thunkCreateRex } from "store/thunk/thunkRex";
import { setExpandedRexUuids, setSelectedRexRightNavItem, setSelectedRexUuid } from "store/rex";
import { setRightPanelOpen } from "store/interface";
import { selectEVASequenceItem } from "store/cross-slice";
import { setSelectedStationUuid } from "store/station";
import { ModifiedIndicator } from "components/interface/_global-elements";
import { thunkAddStationToEva } from "store/thunk/thunkEva";

const EvaRexLeft: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const rexes = useAppSelector((state) => state.rex.rexes, shallowEqual);
  // sort the rexes by name
  const rexesSorted = _.sortBy(rexes, ["name"]);

  const rexRunningFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.rexRunning),
    refEqual
  );

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  return (
    <>
      <div className={styles.leftContainer}>
        <div className={styles.leftBody}>
          {rexRunningFromDb ? (
            <div className={styles.panelContainer}>
              <EvaRexItem rexUuid={rexRunningFromDb.uuid} />
            </div>
          ) : (
            <>
              {_.sortBy(rexesSorted, ["name"]).map((rex) => (
                <div className={styles.panelContainer} key={rex.uuid}>
                  <EvaRexItem rexUuid={rex.uuid} key={rex.uuid} />
                </div>
              ))}
            </>
          )}
        </div>

        {editPerms && !rexRunningFromDb && (
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
  const expandedRexUuids = useAppSelector((state) => state.rex.expandedRexUuids, refEqual);
  const rex = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.uuid === rexUuid),
    shallowEqual
  );

  const evasEditing = useAppSelector((state) => state.eva.evasEditing, refEqual);

  const rexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb?.find((rexFromDb) => rexFromDb.uuid === rex.uuid),
    refEqual
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
    (state) => state.eva.evas.find((eva) => eva.uuid === rex.selectedRexEvaUuid)?.name,
    refEqual
  );

  const selectedRexEvaUuid = rex?.selectedRexEvaUuid;
  const selectedRexEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === rex?.selectedRexEvaUuid),
    refEqual
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

  let evaLabelSelectedStyle = styles.selectedEvaLabelContainerEmphasized;
  if (selectedEvaUuid && !selectedEvaSequenceItemUuid) {
    evaLabelSelectedStyle = styles.selectedEvaLabelContainerSelected;
  }
  return (
    <>
      <div className={styles.rexContainer}>
        <div className={styles.nameitem} key={rex.uuid}>
          {!rexFromDb?.rexRunning && (
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
            style={rexFromDb?.rexRunning ? { marginLeft: "5px" } : {}}
            onClick={() => {
              if (selectedRexUuid !== rex.uuid) {
                dispatch(setSelectedRexUuid(rex.uuid));
              }

              if (!selectedRexRightNavItem) dispatch(setSelectedRexRightNavItem("info_panel"));
              dispatch(setRightPanelOpen(true));

              // add this rex uuid to the expanded list if it's not already there
              if (expandedRexUuids.indexOf(rex.uuid) === -1) {
                dispatch(setExpandedRexUuids([...expandedRexUuids, rex.uuid]));
              }
              dispatch(setSelectedEvaUuid(null));
              dispatch(selectEVASequenceItem({ sequenceItemUuid: null }));
              dispatch(setSelectedStationUuid(null));
            }}
          >
            <div className={styles.nameText}>{rex.name}</div>
            <ModifiedIndicator obj1={[rex]} obj2={[rexFromDb]} />

            <div className={styles.nameItemRightSpacer} />
            <div className={styles.nameItemsRightButton}>
              <FontAwesomeIcon icon={faSliders} style={{ color: settingsIconColor }} />
            </div>
          </div>
        </div>
        {expandedRexUuids.find((uuid) => uuid === rex.uuid) && (
          <div
            className={styles.rexBody}
            style={rexFromDb?.rexRunning ? { marginLeft: "1px" } : {}}
          >
            <RexClocks selectedRex={rex} />
            <div className={styles.rexEvaDropdown}>
              <div
                className={`${styles.selectedEvaLabelContainer}  ${evaLabelSelectedStyle}`}
                onClick={() => {
                  dispatch(setSelectedEvaUuid(selectedRexEvaUuid));
                  dispatch(setSelectedEvaSequenceItemUuid(null));
                }}
              >
                <div className={styles.selectedEvaLabel}>{selectedRexEvaName}</div>
                <div className={styles.rexButton}>
                  <FontAwesomeIcon icon={faSliders} size="sm" />
                </div>
              </div>
            </div>
            {selectedRexEva && (
              <EvaItemSequence
                evaUuid={selectedRexEva.uuid}
                evaSequence={selectedRexEva?.sequence}
                editMode={evasEditing.includes(selectedRexEva.uuid)}
              />
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
