import { FunctionComponent } from "react";
import { useAppSelector, shallowEqual, refEqual, deepEqual } from "utils/useAppSelector";
import {
  faBan,
  faBullseye,
  faCircleInfo,
  faEdit,
  faFloppyDisk,
  faLayerGroup,
  faTrashAlt,
  faSun,
} from "@fortawesome/free-solid-svg-icons";

import Info_panel from "./preset-right-info";
import Layers_Panel from "./preset-right-layers";
import Circles_Panel from "./preset-right-circles";
import Azimuth_Panel from "./preset-right-azimuth";
import paneStyles from "../global-pane-styles.module.css";
import {
  setPresetEditMode,
  setSelectedPresetRightNavItem,
  upsertPresetByField,
} from "store/preset";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDeletePreset, thunkPresetCancel, thunkSavePreset } from "store/thunk/thunkPreset";
import { validators } from "components/interface/form/formValidators";
import { isModified } from "utils/component-helpers";
import { RightTabs } from "components/interface/side-controls";

const PresetEditorRight: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.preset.selectedRightNavItem,
    refEqual
  );
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((preset) => preset.uuid === selectedPresetUuid),
    deepEqual
  );
  const selectedPresetFromDb = useAppSelector(
    (state) => state.preset.presetsFromDb.find((preset) => preset.uuid === selectedPresetUuid),
    deepEqual
  );
  const presetsEditing = useAppSelector((state) => state.preset.presetsEditing, shallowEqual);

  const modified = isModified([selectedPreset], [selectedPresetFromDb]);

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "Preset Information",
      panel: Info_panel,
      selectedColor: "white",
      icon: faCircleInfo,
    },
    layers_panel: {
      title: "Preset Layer Configuration",
      panel: Layers_Panel,
      selectedColor: "white",
      icon: faLayerGroup,
    },
    circle_panel: {
      title: "Vector Layer Configuration",
      panel: Circles_Panel,
      selectedColor: "white",
      icon: faBullseye,
    },
    azimuth_panel: {
      title: "Celestial Body Direction",
      panel: Azimuth_Panel,
      selectedColor: "white",
      icon: faSun,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ActiveComponent: FunctionComponent<any> = panelTypes[selectedRightNavItem]?.panel;

  return (
    selectedPreset && (
      <>
        <div className={paneStyles.rightTopTitle} style={{ color: "var(--preset)" }}>
          <div className={paneStyles.rightTopTitleText}>
            <InLineEditInput
              value={selectedPreset.name}
              editing={presetsEditing.includes(selectedPresetUuid)}
              fieldProps={{
                name: "name",
                ariaLabel: "Preset Title",
                style: {
                  width: "100%",
                  color: "var(--preset)",
                  fontSize: "1em",
                },
                validators: [validators.required, validators.maxLength(255)],
              }}
              styleContainer={{ paddingLeft: 0 }}
              styleValue={{ padding: 0, height: "auto" }}
              onSubmit={(val) => {
                dispatch(upsertPresetByField(selectedPreset.uuid, "name", val));
              }}
              key={`${selectedPreset.uuid}-name`}
            />
          </div>
        </div>
        <div className={paneStyles.rightSubTray}>
          <RightTabs
            selectedRightNavItem={selectedRightNavItem}
            panelTypes={panelTypes}
            dispatchFunction={setSelectedPresetRightNavItem}
          />
          <div className={paneStyles.saveCancelContainer}>
            {presetsEditing.includes(selectedPresetUuid) && (
              <Button
                icon={faTrashAlt}
                onClick={() => {
                  dispatch(thunkDeletePreset({ presetUuid: selectedPreset.uuid }));
                }}
                toolTip="Delete Preset"
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
                ariaLabel="deleteButton"
              />
            )}
            {!presetsEditing.includes(selectedPresetUuid) && editPerms && (
              <Button
                icon={faEdit}
                onClick={() => {
                  dispatch(setPresetEditMode({ presetUuid: selectedPresetUuid, editMode: true }));
                }}
                label="Edit"
                toolTip="Edit Preset"
                style={{ width: "60px", fontSize: "0.9em" }}
                labelStyle={{ marginTop: "2px" }}
                ariaLabel="Edit"
              />
            )}

            {presetsEditing.includes(selectedPresetUuid) && (
              <>
                <Button
                  onClick={() => {
                    if (modified) {
                      dispatch(thunkSavePreset({ preset: selectedPreset }));
                    }
                  }}
                  icon={faFloppyDisk}
                  toolTip={`Save Preset${modified ? "" : " (nothing to save)"}`}
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
                    dispatch(thunkPresetCancel({ presetUuid: selectedPreset.uuid }));
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
          editMode={presetsEditing.includes(selectedPresetUuid)}
        />
      </>
    )
  );
};

export default PresetEditorRight;
