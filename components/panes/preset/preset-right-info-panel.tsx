import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import { ContentEditableTextArea } from "components/interface/_global-elements";
import { setPresetEditMode, upsertPreset } from "store/preset";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();

  const selectedPresetUuid = useSelector(
    (state: RootState) => state.preset.selectedPresetUuid,
    shallowEqual
  );
  const presets = useSelector((state: RootState) => state.preset.presets, shallowEqual);
  const selectedPreset: Preset = presets.filter((preset) => preset.uuid === selectedPresetUuid)[0];

  const handleDefaultPresetChange = (evt: React.ChangeEvent<HTMLInputElement>) => {
    // If the preset is being set as the default, then we need to unset the default flag on all other presets
    if (evt.target.checked) {
      const otherPresets = presets.filter((preset) => preset.uuid !== selectedPresetUuid);
      otherPresets.forEach((preset) => {
        if (preset.missionPresetDefault) {
          // add the preset to the edit mode list because we are changing the default and the user will have to save the changes
          dispatch(setPresetEditMode({ presetUuid: preset.uuid, editMode: true }));
        }
        dispatch(
          upsertPreset({
            ...preset,
            missionPresetDefault: false,
          })
        );
      });
      dispatch(
        upsertPreset({
          ...selectedPreset,
          missionPresetDefault: true,
        })
      );
    } else {
      const preset = presets.filter((preset) => preset.uuid === selectedPresetUuid)[0];
      dispatch(
        upsertPreset({
          ...preset,
          missionPresetDefault: false,
        })
      );
    }
  };

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
                  checked={selectedPreset.missionPreset}
                  onChange={(evt) => {
                    if (!editMode) return;
                    if (evt.target.checked) {
                      dispatch(
                        upsertPreset({
                          ...selectedPreset,
                          missionPreset: true,
                        })
                      );
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
                  <>Preset visible to only you</>
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
                    checked={selectedPreset.missionPresetDefault}
                    onChange={(evt) => {
                      if (!editMode) return;
                      handleDefaultPresetChange(evt);
                    }}
                  />
                  <>Mission default preset</>
                </>
              ) : (
                <span className={paneStyles.checkUneditable}>
                  {selectedPreset.missionPresetDefault ? (
                    <>This is the mission&apos;s default preset</>
                  ) : (
                    <>This is not the mission&apos;s default preset</>
                  )}
                </span>
              )}
            </div>
          </div>
        )}
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>Preset Description</div>
          <ContentEditableTextArea
            html={selectedPreset?.description} // innerHTML of the editable div
            editing={editMode}
            onChange={(evt) => {
              dispatch(
                upsertPreset({
                  ...selectedPreset,
                  description: evt.target.value,
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
