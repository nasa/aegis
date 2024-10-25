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
        <div className={paneStyles.panelSection} aria-label="presetInfoPanel">
          <div className={paneStyles.panelSectionTitle}>
            <div className={presetStyles.toggleMenuItemRow}>
              {editMode ? (
                <>
                  List preset as
                  <div
                    className={`${presetStyles.toggleLeft} ${presetStyles.center} ${
                      selectedPreset.missionPreset && presetStyles.toggleSelected
                    }`}
                    onClick={() => {
                      dispatch(upsertPresetByField(selectedPresetUuid, "missionPreset", true));
                    }}
                    data-tooltip-id="aegis-tooltip"
                    data-tooltip-html="Show in the top list of primary presets for this mission"
                    aria-label="listAsPrimary"
                  >
                    Primary
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
                    data-tooltip-id="aegis-tooltip"
                    data-tooltip-html="Show in the bottom list of secondary presets for this mission"
                    aria-label="listAsSecondary"
                  >
                    Secondary
                  </div>
                </>
              ) : (
                <span className={paneStyles.checkUneditable}>
                  {selectedPreset.missionPreset ? (
                    selectedPreset.missionPresetDefault ? (
                      <>Preset is primary, mission default</>
                    ) : (
                      <>Preset is primary</>
                    )
                  ) : (
                    <>Preset is secondary</>
                  )}
                </span>
              )}
            </div>
            {selectedPreset.missionPreset && editMode && (
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
                      label="Set as default"
                      labelStyle={{
                        justifyContent: "space-around",
                        display: "flex",
                        flexDirection: "column",
                      }}
                      uniqueId="presetDefault"
                    />
                  </>
                ) : null}
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
