import { FunctionComponent, ChangeEvent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import presetStyles from "./preset.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import * as httpClient_Preset from "http-client/preset";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import {
  setPresetEditMode,
  upsertPreset,
  upsertPresetByField,
  upsertPresetFromDb,
} from "store/preset";
import { WysiwygTextArea } from "components/interface/form/wysiwyg";
import { Button } from "components/interface/form/globalFields";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faMessage } from "@fortawesome/free-solid-svg-icons";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();

  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const presets = useAppSelector((state) => state.preset.presets, deepEqual);
  const selectedPreset = presets.find((preset) => preset.uuid === selectedPresetUuid);

  const handleDefaultPresetChange = (evt: ChangeEvent<HTMLInputElement>) => {
    // If the preset is being set as the default, then we need to unset the default flag on all other presets
    if (evt.target.checked) {
      dispatch(upsertPresetByField(selectedPresetUuid, "missionDefault", true));
      //check the other presets
      const otherPresets = presets.filter((preset) => preset.uuid !== selectedPresetUuid);
      otherPresets.forEach((preset) => {
        //there should only be one of these
        if (preset.missionDefault) {
          // save the preset to the store and db
          const modifiedDate = roundDateToSecond(getAccurateNow()).toISOString();
          const updatedPreset = { ...preset, missionDefault: false, updatedAt: modifiedDate };
          dispatch(upsertPreset(updatedPreset, true));
          dispatch(upsertPresetFromDb(updatedPreset));
          httpClient_Preset.upsertPresets([updatedPreset]);
          dispatch(setPresetEditMode({ presetUuid: preset.uuid, editMode: false }));
        }
      });
    } else {
      dispatch(upsertPresetByField(selectedPresetUuid, "missionDefault", false));
    }
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Preset Information</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection} aria-label="presetInfoPanel">
          <div className={paneStyles.descriptionContainer}>
            {editMode ? (
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {!selectedPreset.missionDefault && (
                  <Button
                    onClick={() => {
                      if (!editMode) return;
                      handleDefaultPresetChange({
                        target: { checked: true },
                      } as ChangeEvent<HTMLInputElement>);
                    }}
                    label="Set to Default"
                    style={{ width: "110px" }}
                  />
                )}
                <span style={{ fontSize: "0.9rem" }}>
                  {selectedPreset.missionDefault ? "Default Preset" : "Not Default"}
                </span>
              </div>
            ) : (
              <div className={presetStyles.defaultText}>
                {selectedPreset.missionDefault ? "Default Preset" : "Not Default"}
              </div>
            )}
          </div>
        </div>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>
            <SubpanelHeading icon={faMessage}>Description</SubpanelHeading>
          </div>
          <div className={paneStyles.descriptionContainer}>
            <WysiwygTextArea
              key={selectedPreset?.uuid}
              value={selectedPreset?.description}
              defaultValue="Enter description here"
              editing={editMode}
              onChange={(value) => {
                dispatch(upsertPresetByField(selectedPresetUuid, "description", value));
              }}
              ariaLabel="description"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
