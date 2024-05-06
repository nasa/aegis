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
import { Checkbox } from "components/interface/form/globalFields";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faMessage } from "@fortawesome/free-solid-svg-icons";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();

  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const presets = useAppSelector((state) => state.preset.presets, deepEqual);
  const selectedPreset = presets.find((preset) => preset.uuid === selectedPresetUuid);
  const isRexRunning = useAppSelector(
    (state) => state.rex.rexes.find((rex) => rex.isRunning)?.isRunning,
    refEqual
  );

  const handleDefaultPresetChange = (evt: ChangeEvent<HTMLInputElement>) => {
    // If the preset is being set as the default, then we need to unset the default flag on all other presets
    if (evt.target.checked) {
      dispatch(upsertPresetByField(selectedPresetUuid, "missionPresetDefault", true));
      //check the other presets
      const otherPresets = presets.filter((preset) => preset.uuid !== selectedPresetUuid);
      otherPresets.forEach((preset) => {
        //there should only be one of these
        if (preset.missionPresetDefault) {
          // save the preset to the store and db
          const modifiedDate = roundDateToSecond(getAccurateNow()).toISOString();
          const updatedPreset = { ...preset, missionPresetDefault: false, updatedAt: modifiedDate };
          dispatch(upsertPreset(updatedPreset, true));
          dispatch(upsertPresetFromDb(updatedPreset));
          httpClient_Preset.upsertPresets([updatedPreset], isRexRunning);
          dispatch(setPresetEditMode({ presetUuid: preset.uuid, editMode: false }));
        }
      });
    } else {
      dispatch(upsertPresetByField(selectedPresetUuid, "missionPresetDefault", false));
    }
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Preset Information</div>
      <div className={paneStyles.panelContainer}>
        <div className={paneStyles.panelSection}>
          <div className={paneStyles.panelSectionTitle}>
            <div className={presetStyles.toggleMenuItemRow}>
              {editMode ? (
                <>
                  Preset Status
                  <div
                    className={`${presetStyles.toggleLeft} ${presetStyles.center} ${
                      selectedPreset.missionPreset && presetStyles.toggleSelected
                    }`}
                    onClick={() => {
                      dispatch(upsertPresetByField(selectedPresetUuid, "missionPreset", true));
                    }}
                  >
                    Active
                  </div>
                  <div
                    className={`${presetStyles.toggleRight} ${presetStyles.center} ${
                      !selectedPreset.missionPreset && presetStyles.toggleSelected
                    }`}
                    onClick={() => {
                      dispatch(upsertPresetByField(selectedPresetUuid, "missionPreset", false));
                      dispatch(
                        upsertPresetByField(selectedPresetUuid, "missionPresetDefault", false)
                      );
                    }}
                  >
                    Staging
                  </div>
                </>
              ) : (
                <span className={paneStyles.checkUneditable}>
                  {selectedPreset.missionPreset ? <>Preset is active</> : <>Preset is in staging</>}
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
                      label="Preset is the mission's default"
                      labelStyle={{
                        justifyContent: "space-around",
                        display: "flex",
                        flexDirection: "column",
                      }}
                      uniqueId="presetDefault"
                    />
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
              key={selectedPreset?.uuid}
              value={selectedPreset?.description}
              defaultValue="Enter description here"
              editing={editMode}
              onChange={(value) => {
                dispatch(upsertPresetByField(selectedPresetUuid, "description", value));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
