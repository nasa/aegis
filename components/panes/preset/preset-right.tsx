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
import {
  deleteAllPresetsFromDb,
  deletePreset,
  setPresetEditMode,
  setSelectedPresetUuid,
  setSelectedPresetRightNavItem,
  upsertPreset,
  upsertPresetsFromDb,
  resetAllPresetInteractions,
} from "store/preset";
import * as InternalAPI from "http-client/internal-api";
import { IconButton, InLineEditInput } from "components/interface/_global-elements";

const PresetEditorRight: FunctionComponent = () => {
  const dispatch = useDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.preset.selectedRightNavItem,
    refEqual
  );
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
  const selectedMissionId = useAppSelector((state) => state.mission.mission?.id, refEqual);

  const [modified, setModified] = useState(false);
  useEffect(() => {
    setModified(!_.isEqual(selectedPreset, selectedPresetFromDb));
  }, [selectedPreset, selectedPresetFromDb]);

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "Preset Information",
      panel: Info_panel,
      color: "var(--map)",
      icon: faCircleInfo,
    },
    layers_panel: {
      title: "Preset Layer Configuration",
      panel: Layers_Panel,
      color: "var(--map)",
      icon: faLayerGroup,
    },
  };

  const handleSave = async () => {
    if (selectedPreset && modified) {
      // upsert the changed Preset to the DB
      const upsertReponse = await InternalAPI.setPreset(selectedPreset);

      if (upsertReponse.status === "success") {
        // upsert the changed preset to the store
        dispatch(upsertPreset(upsertReponse.data));
        // update the preset in the store from the DB
        // get fresh copy of presets from DB
        const presetData = await InternalAPI.getPresets(selectedMissionId);
        if (presetData.data) {
          dispatch(deleteAllPresetsFromDb());
          dispatch(upsertPresetsFromDb(presetData.data));
        }
      } else {
        throw new Error("Error upserting Presets: " + upsertReponse.message);
      }
      dispatch(setPresetEditMode({ presetUuid: selectedPreset.uuid, editMode: false }));
      dispatch(resetAllPresetInteractions({ presetUuid: selectedPreset.uuid }));
    }
  };

  const handleCancel = () => {
    // if selected preset isn't in the db, delete it from the store
    if (!selectedPresetFromDb) {
      dispatch(deletePreset(selectedPreset));
      dispatch(setSelectedPresetUuid(null));
    } else {
      // if selected Preset is in the db, replace it with the one from the db (undoing any changes)
      dispatch(upsertPreset(selectedPresetFromDb));
    }
    dispatch(setPresetEditMode({ presetUuid: selectedPreset.uuid, editMode: false }));
    dispatch(resetAllPresetInteractions({ presetUuid: selectedPreset.uuid }));
  };

  const handleEdit = () => {
    dispatch(setPresetEditMode({ presetUuid: selectedPresetUuid, editMode: true }));
  };

  const handleDelete = async () => {
    if (selectedPreset) {
      // if the selected preset is in presetsFromDb then delete it from the db
      if (selectedPresetFromDb) {
        // delete the preset from the DB via internal API call
        const deleteResponse = await InternalAPI.deletePreset(selectedPreset.uuid);
        if (deleteResponse.status === "success") {
          // remove the corresponding preset from the store
          dispatch(deletePreset(selectedPreset));
          dispatch(setSelectedPresetUuid(null));

          // get fresh copy of presets from DB
          const presetData = await InternalAPI.getPresets(selectedMissionId);
          if (presetData.data) {
            dispatch(deleteAllPresetsFromDb());
            dispatch(upsertPresetsFromDb(presetData.data));
          }
        } else {
          console.error("Error deleting preset: " + deleteResponse.message);
        }
      } else {
        // if the selected preset is not in presetsFromDb then delete it from the store
        dispatch(deletePreset(selectedPreset));
        dispatch(setSelectedPresetUuid(null));
      }
      dispatch(setPresetEditMode({ presetUuid: selectedPresetUuid, editMode: false }));
    }
  };

  let ActiveComponent = null;
  if (selectedRightNavItem !== null) {
    ActiveComponent = panelTypes[selectedRightNavItem].panel;
  }

  return (
    selectedPreset && (
      <>
        <div className={paneStyles.rightTopTitle} style={{ color: "var(--map)" }}>
          <InLineEditInput
            fieldName="Preset Name"
            value={selectedPreset.name}
            editing={presetsEditing.includes(selectedPresetUuid)}
            maxLength={255}
            styleInput={{
              width: "100%",
              marginRight: "10px",
              color: "var(--map)",
              fontSize: "1em",
            }}
            containerStyle={{ paddingLeft: 0 }}
            onChange={(val) => {
              dispatch(upsertPreset({ ...selectedPreset, name: val }));
            }}
          />
        </div>
        <div className={paneStyles.rightSubTray}>
          <div className={paneStyles.rightIconRow}>
            {Object.keys(panelTypes).map((panelType) => {
              return (
                <div
                  key={panelType}
                  className={
                    selectedRightNavItem === panelType
                      ? paneStyles.rightIconContainerSelected
                      : paneStyles.rightIconContainer
                  }
                >
                  <div
                    className={paneStyles.rightIcon}
                    style={{
                      color:
                        selectedRightNavItem === panelType ? panelTypes[panelType].color : "white",
                    }}
                    title={panelTypes[panelType].title}
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
              <div className={paneStyles.verticalCenter}>
                <IconButton
                  icon={faTrashAlt}
                  onClick={() => {
                    handleDelete();
                  }}
                  label="Delete Preset"
                  style={{ width: "110px" }}
                />
              </div>
            )}
            {!presetsEditing.includes(selectedPresetUuid) && (
              <div className={paneStyles.verticalCenter}>
                <IconButton
                  icon={faEdit}
                  onClick={() => {
                    handleEdit();
                  }}
                  label="Edit Preset"
                  style={{ width: "100px" }}
                />
              </div>
            )}

            {presetsEditing.includes(selectedPresetUuid) && (
              <>
                <div className={paneStyles.verticalCenter}>
                  <IconButton
                    onClick={() => {
                      handleSave();
                    }}
                    icon={faFloppyDisk}
                    label="Save Preset"
                    enabled={modified}
                    style={{
                      width: "105px",
                      backgroundColor: modified ? "var(--alert)" : "var(--alert-disabled)",
                      color: modified ? "white" : "var(--grey4)",
                    }}
                  />
                </div>
                <div className={paneStyles.verticalCenter}>
                  <IconButton
                    onClick={() => {
                      handleCancel();
                    }}
                    icon={faBan}
                    label="Cancel"
                    style={{ width: "75px" }}
                  />
                </div>
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
