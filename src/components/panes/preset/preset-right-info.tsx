import type { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import presetStyles from "./preset.module.css";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { Button } from "components/interface/form/globalFields";
import { ValidatedTextArea } from "components/interface/form/globalFieldsAutomerge";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faMessage } from "@fortawesome/free-solid-svg-icons";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import {
  applySetMissionDefaultPreset,
  applyUpdatePresetByField,
} from "operations/apply/apply-mission-preset";

const Info_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useMissionDocSelector(
    (mission) => mission.presets?.[selectedPresetUuid],
    deepEqual
  );
  if (!selectedPreset) return null;

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
                      // Only one preset can be the default; the others are cleared in the same change
                      withMissionChange((m) =>
                        applySetMissionDefaultPreset(m, {
                          presetUuid: selectedPresetUuid,
                          missionDefault: true,
                        })
                      );
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
          <div className={paneStyles.fieldContainerAutomerge}>
            <ValidatedTextArea
              key={selectedPreset.uuid}
              value={selectedPreset.description || ""}
              editMode={editMode}
              onSubmit={(value: string) => {
                withMissionChange((m) =>
                  applyUpdatePresetByField(m, {
                    presetUuid: selectedPresetUuid,
                    fieldName: "description",
                    value: value || "",
                  })
                );
              }}
              fieldProps={{ name: "presetDescription", ariaLabel: "Preset Description" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Info_Panel;
