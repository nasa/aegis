import { FunctionComponent } from "react";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import {
  faBan,
  faCircleInfo,
  faCrosshairs,
  faEdit,
  faFileExport,
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
import Positions_panel from "./rex-right-rex-posTypes";
import Export_panel from "./rex-right-rex-export";

const RexRightRex: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.rex.selectedRexRightNavItem,
    refEqual
  );
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const selectedRex = useAppSelector((state) => {
    const r = state.rex.rexes.find((rex) => rex.uuid === state.rex.selectedRexUuid);
    return {
      uuid: r.uuid,
      updatedAt: r.updatedAt,
      name: r.name,
      isRunning: r.isRunning,
    };
  }, deepEqual);
  const selectedRexFromDb = useAppSelector((state) => {
    const r = state.rex.rexesFromDb?.find((rex) => rex.uuid === state.rex.selectedRexUuid);
    return {
      uuid: r?.uuid,
      updatedAt: r?.updatedAt,
      name: r?.name,
      isRunning: r?.isRunning,
    };
  }, deepEqual);
  const rexesEditing = useAppSelector((state) => state.rex.rexesEditing, deepEqual);

  const rexNames = useAppSelector(
    (state) => state.rex.rexes.map(({ name, uuid }) => ({ name, uuid })),
    deepEqual
  );

  const modified = isModified([selectedRex], [selectedRexFromDb]);

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "REX Information",
      panel: Info_panel,
      selectedColor: "white",
      icon: faCircleInfo,
    },
    positions_panel: {
      title: "Position Marker Tracking",
      panel: Positions_panel,
      selectedColor: "white",
      icon: faCrosshairs,
    },
    export_panel: {
      title: "Export REX",
      panel: Export_panel,
      selectedColor: "white",
      icon: faFileExport,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ActiveComponent: FunctionComponent<any> = panelTypes[selectedRightNavItem]?.panel;

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
                  validators: [
                    validators.required,
                    validators.maxLength(255),
                    validators.mustBeUnique(selectedRex.uuid, rexNames),
                  ],
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
                  // Make sure that the selectedRex store wise & database isn't running.
                  // It will crash if they're running in at any point
                  onClick={() => {
                    if (
                      window.confirm("Are you sure you want to delete this rex") &&
                      !selectedRex.isRunning &&
                      !selectedRexFromDb.isRunning
                    ) {
                      dispatch(thunkDeleteRex({ rexUuid: selectedRex.uuid }));
                    } else {
                      window.alert("This rex is currently running and cannot be deleted");
                    }
                  }}
                  toolTip="Delete Rex Item"
                  style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
                  ariaLabel="deleteButton"
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
                    ariaLabel="saveButton"
                  />
                  <Button
                    onClick={() => {
                      dispatch(thunkCancelRex({ rexUuid: selectedRex.uuid }));
                    }}
                    icon={faBan}
                    toolTip="Cancel Edit"
                    style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
                    ariaLabel="cancelButton"
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
