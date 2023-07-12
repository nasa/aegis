import _ from "lodash";
import { FunctionComponent, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBan,
  faCircleInfo,
  faEdit,
  faFloppyDisk,
  faLayerGroup,
  faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";

import Info_panel from "./preset-right-info";
import Layers_Panel from "./preset-right-layers";
import paneStyles from "../global-pane-styles.module.css";
import { setPresetEditMode, setSelectedPresetRightNavItem, upsertPreset } from "store/preset";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDeletePreset, thunkPresetCancel, thunkSavePreset } from "store/thunk/thunkPreset";
import { validators } from "components/interface/form/formValidators";

const PresetEditorRight: FunctionComponent = () => {
  const dispatch = useDispatch();
  const thunkDispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.preset.selectedRightNavItem,
    refEqual
  );
  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((preset) => preset.uuid === selectedPresetUuid),
    shallowEqual
  );
  const selectedPresetFromDb = useAppSelector(
    (state) => state.preset.presetsFromDb.find((preset) => preset.uuid === selectedPresetUuid),
    shallowEqual
  );
  const presetsEditing = useAppSelector((state) => state.preset.presetsEditing, shallowEqual);

  const [modified, setModified] = useState(false);

  useEffect(() => {
    setModified(!_.isEqual(selectedPreset, selectedPresetFromDb));
  }, [selectedPreset, selectedPresetFromDb]);

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
  };

  let ActiveComponent = null;
  if (selectedRightNavItem !== null) {
    ActiveComponent = panelTypes[selectedRightNavItem].panel;
  }

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
                dispatch(upsertPreset({ ...selectedPreset, name: val }));
              }}
            />
          </div>
        </div>
        <div className={paneStyles.rightSubTray}>
          <div className={paneStyles.rightIconRow}>
            {Object.keys(panelTypes).map((panelType) => {
              return (
                <div
                  key={panelType}
                  className={
                    selectedRightNavItem === panelType
                      ? paneStyles.rightIconContainerSelectedPreset
                      : paneStyles.rightIconContainer
                  }
                >
                  <div
                    className={paneStyles.rightIcon}
                    style={{
                      color:
                        selectedRightNavItem === panelType
                          ? panelTypes[panelType].selectedColor
                          : "white",
                    }}
                    data-tooltip-id="aegis-tooltip"
                    data-tooltip-html={panelTypes[panelType].title}
                    onClick={() => dispatch(setSelectedPresetRightNavItem(panelType))}
                  >
                    <FontAwesomeIcon icon={panelTypes[panelType].icon} size="lg" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className={paneStyles.saveCancelContainer}>
            {presetsEditing.includes(selectedPresetUuid) && (
              <Button
                icon={faTrashAlt}
                onClick={() => {
                  thunkDispatch(thunkDeletePreset({ preset: selectedPreset }));
                }}
                toolTip="Delete Preset"
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "10px" }}
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
              />
            )}

            {presetsEditing.includes(selectedPresetUuid) && (
              <>
                <Button
                  onClick={() => {
                    thunkDispatch(thunkSavePreset({ preset: selectedPreset }));
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
                />
                <Button
                  onClick={() => {
                    thunkDispatch(thunkPresetCancel({ preset: selectedPreset }));
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
          editMode={presetsEditing.includes(selectedPresetUuid)}
        />
      </>
    )
  );
};

export default PresetEditorRight;
