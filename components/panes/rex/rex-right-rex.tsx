import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import {
  faBan,
  faCircleInfo,
  faEdit,
  faFloppyDisk,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";

import Info_panel from "./rex-right-rex-info";
import paneStyles from "../global-pane-styles.module.css";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";
import { validators } from "components/interface/form/formValidators";
import { isModified } from "utils/component-helpers";
import { RightTabs } from "components/interface/side-controls";
import { setRexEditMode, setSelectedRexRightNavItem, upsertRexByField } from "store/rex";
import { thunkCancelRex, thunkDeleteRex, thunkSaveRex } from "store/thunk/thunkRex";

const RexRightRex: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.rex.selectedRexRightNavItem,
    refEqual
  );
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const selectedRex = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.uuid === state.rex.selectedRexUuid),
    shallowEqual
  );
  const selectedRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb?.find((rex) => rex.uuid === state.rex.selectedRexUuid),
    shallowEqual
  );
  const rexesEditing = useAppSelector((state) => state.rex.rexesEditing, shallowEqual);

  const [modified, setModified] = useState(false);

  useEffect(() => {
    setModified(isModified([selectedRex], [selectedRexFromDb]));
  }, [selectedRex, selectedRexFromDb]);

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "REX Information",
      panel: Info_panel,
      selectedColor: "white",
      icon: faCircleInfo,
    },
  };

  let ActiveComponent = null;
  if (selectedRightNavItem !== null) {
    ActiveComponent = panelTypes[selectedRightNavItem].panel;
  }

  return (
    <>
      {selectedRex && (
        <>
          <div className={paneStyles.rightTopTitle} style={{ color: "var(--rex)" }}>
            <div className={paneStyles.rightTopTitleText}>
              <InLineEditInput
                value={selectedRex.name}
                editing={rexesEditing.includes(selectedRex.uuid)}
                fieldProps={{
                  name: "name",
                  ariaLabel: "Rex Title",
                  style: {
                    width: "100%",
                    color: "var(--rex)",
                    fontSize: "1em",
                  },
                  validators: [validators.required, validators.maxLength(255)],
                }}
                styleContainer={{ paddingLeft: 0 }}
                styleValue={{ padding: 0, height: "auto" }}
                onSubmit={(val) => {
                  dispatch(upsertRexByField(selectedRex.uuid, "name", val));
                }}
                key={`${selectedRex.uuid}-name`}
              />
            </div>
          </div>
          <div className={paneStyles.rightSubTray}>
            <RightTabs
              selectedRightNavItem={selectedRightNavItem}
              panelTypes={panelTypes}
              dispatchFunction={setSelectedRexRightNavItem}
            />
            <div className={paneStyles.saveCancelContainer}>
              {rexesEditing.includes(selectedRex.uuid) && (
                <Button
                  icon={faTrashAlt}
                  onClick={() => {
                    dispatch(thunkDeleteRex({ rexUuid: selectedRex.uuid }));
                  }}
                  toolTip="Delete Rex Item"
                  style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
                />
              )}
              {!rexesEditing.includes(selectedRex.uuid) && editPerms && (
                <Button
                  icon={faEdit}
                  onClick={() => {
                    dispatch(setRexEditMode({ rexUuid: selectedRex.uuid, editMode: true }));
                  }}
                  label="Edit"
                  toolTip="Edit Rex Item"
                  style={{ width: "60px", fontSize: "0.9em" }}
                  labelStyle={{ marginTop: "2px" }}
                />
              )}

              {rexesEditing.includes(selectedRex.uuid) && (
                <>
                  <Button
                    onClick={() => {
                      if (modified) {
                        dispatch(thunkSaveRex({ rexUuid: selectedRex.uuid }));
                      }
                    }}
                    icon={faFloppyDisk}
                    toolTip={`Save Rex Item${modified ? "" : " (nothing to save)"}`}
                    enabled={modified}
                    style={{
                      width: "30px",
                      backgroundColor: modified ? "var(--alert)" : "var(--alert-disabled)",
                      color: modified ? "white" : "var(--grey4)",
                      fontSize: "0.9em",
                      paddingLeft: "10px",
                    }}
                  />
                  <Button
                    onClick={() => {
                      dispatch(thunkCancelRex({ rexUuid: selectedRex.uuid }));
                    }}
                    icon={faBan}
                    toolTip="Cancel Edit"
                    style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
                  />
                </>
              )}
            </div>
          </div>

          <ActiveComponent
            className={paneStyles.rightActiveWindow}
            editMode={rexesEditing.includes(selectedRex.uuid)}
          />
        </>
      )}
    </>
  );
};

export default RexRightRex;
