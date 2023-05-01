import { FunctionComponent, ChangeEvent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useDispatch } from "react-redux";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { ContentEditableTextArea } from "components/interface/_global-elements";
import { setPresetEditMode, upsertPreset } from "store/preset";
import _ from "lodash";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();

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

  const showDefaultDescription =
    !editMode && (selectedPreset?.description === "" || selectedPreset?.description === "<br>");

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Preset Information</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>
            {editMode ? (
              <>
                <input
                  className={paneStyles.check}
                  type="checkbox"
                  title="Set preset visibility"
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
                />
                <>Preset is visible to everyone</>
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
        {selectedPreset.missionPreset && (
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle}>
              {editMode ? (
                <>
                  <input
                    className={paneStyles.check}
                    type="checkbox"
                    title="Set default preset"
                    checked={selectedPreset.missionPresetDefault}
                    onChange={(evt) => {
                      if (!editMode) return;
                      handleDefaultPresetChange(evt);
                    }}
                  />
                  <>Preset is the mission&apos;s default</>
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
        )}
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>Preset Description</div>
          {/* Need to have the code duplication below to show the default description before and after edit mode */}
          <ContentEditableTextArea
            html={showDefaultDescription ? "Enter description here" : selectedPreset?.description} // innerHTML of the editable div
            defaultValue="Enter description here"
            editing={editMode}
            onChange={(evt) => {
              //Fix Richtext firefox bug
              const cleanValue = _.replace(evt.target.value, /^[/s]*<br>$/, "");
              dispatch(
                upsertPreset({
                  ...selectedPreset,
                  description: cleanValue,
                })
              );
            }} // handle innerHTML change
          />
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
