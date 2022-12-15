import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { RootState } from "store";
import { ContentEditableTextArea } from "components/interface/_global-elements";
import { upsertPreset } from "store/preset";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useDispatch();

  const selectedPresetUuid = useSelector(
    (state: RootState) => state.preset.selectedPresetUuid,
    shallowEqual
  );
  const presets = useSelector((state: RootState) => state.preset.presets, shallowEqual);
  const selectedPreset: Preset = presets.filter((preset) => preset.uuid === selectedPresetUuid)[0];
  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Preset Information</div>
      <div className={paneStyles.panelContainer}>
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

        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSmallField}>
            <div className={paneStyles.panelSectionTitle}>
              {editMode ? (
                <input
                  className={paneStyles.check}
                  type="checkbox"
                  checked={selectedPreset.missionPreset}
                  onChange={(evt) => {
                    if (!editMode) return;
                    dispatch(
                      upsertPreset({
                        ...selectedPreset,
                        missionPreset: evt.target.checked,
                      })
                    );
                  }}
                />
              ) : (
                <span className={paneStyles.checkUneditable}>
                  {selectedPreset.missionPreset ? (
                    <FontAwesomeIcon icon={faCheck} />
                  ) : (
                    <FontAwesomeIcon icon={faXmark} />
                  )}
                </span>
              )}
              Preset is available to everyone
            </div>
            <div className={paneStyles.inputField}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
