import { FunctionComponent, ChangeEvent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import presetStyles from "./preset.module.css";
import { useAppDispatch } from "utils/useAppDispatch";

import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { setPresetEditMode, upsertPreset } from "store/preset";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { Checkbox } from "components/interface/form/globalFields";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faMessage } from "@fortawesome/free-solid-svg-icons";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();

  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const presets = useAppSelector((state) => state.preset.presets, shallowEqual);
  const selectedPreset = presets.find((preset) => preset.uuid === selectedPresetUuid);

  const handleDefaultPresetChange = (evt: ChangeEvent<HTMLInputElement>) => {
    // If the preset is being set as the default, then we need to unset the default flag on all other presets
    if (evt.target.checked) {
      const otherPresets = presets.filter((preset) => preset.uuid !== selectedPresetUuid);
      otherPresets.forEach((preset) => {
        if (preset.missionPresetDefault) {
          // add the preset to the edit mode list because we are changing the default and the user will have to save the changes
          dispatch(setPresetEditMode({ presetUuid: preset.uuid, editMode: true }));
        }
        dispatch(upsertPreset({ ...preset, missionPresetDefault: false }));
      });
      dispatch(upsertPreset({ ...selectedPreset, missionPresetDefault: true }));
    } else {
      dispatch(upsertPreset({ ...selectedPreset, missionPresetDefault: false }));
    }
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Preset Information</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>
            <div className={presetStyles.checkboxRow}>
              {editMode ? (
                <>
                  <Checkbox
                    checked={selectedPreset.missionPreset}
                    onChange={(evt) => {
                      if (!editMode) return;
                      if (evt.target.checked) {
                        dispatch(upsertPreset({ ...selectedPreset, missionPreset: true }));
                      } else {
                        // if the preset is being unset as a mission preset, then we need to also make sure it is not the default preset
                        dispatch(
                          upsertPreset({
                            ...selectedPreset,
                            missionPreset: false,
                            missionPresetDefault: false,
                          })
                        );
                      }
                    }}
                    toolTip="Set preset visibility"
                  />
                  <div className={paneStyles.verticalCenter}>Preset is visible to everyone</div>
                </>
              ) : (
                <span className={paneStyles.checkUneditable}>
                  {selectedPreset.missionPreset ? (
                    <>Preset is visible to everyone</>
                  ) : (
                    <>Preset is visible to only you</>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
        {selectedPreset.missionPreset && (
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              <div className={presetStyles.checkboxRow}>
                {editMode ? (
                  <>
                    <Checkbox
                      checked={selectedPreset.missionPresetDefault}
                      onChange={(evt) => {
                        if (!editMode) return;
                        handleDefaultPresetChange(evt);
                      }}
                      toolTip="Set default preset"
                    />
                    <div className={paneStyles.verticalCenter}>
                      Preset is the mission&apos;s default
                    </div>
                  </>
                ) : (
                  <span className={paneStyles.checkUneditable}>
                    {selectedPreset.missionPresetDefault ? (
                      <>Preset is the mission&apos;s default</>
                    ) : (
                      <>Preset is not the mission&apos;s default</>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>
            <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
          </div>
          <div className={paneStyles.descriptionContainer}>
            <WysiwygTextArea
              value={selectedPreset?.description}
              defaultValue="Enter description here"
              editing={editMode}
              onChange={(value) => {
                dispatch(
                  upsertPreset({
                    ...selectedPreset,
                    description: value,
                  })
                );
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
