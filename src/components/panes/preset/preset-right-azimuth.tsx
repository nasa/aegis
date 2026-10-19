import debounce from "lodash/debounce";
import paneStyles from "../global-pane-styles.module.css";
import type { FunctionComponent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { faEarthAmerica, faSun, faMoon } from "@fortawesome/free-solid-svg-icons";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdatePresetByField } from "operations/apply/apply-mission-preset";

const AZIMUTH_WRITE_DEBOUNCE_MS = 250;

/** Write one preset field to the mission doc. */
const updatePresetField = <K extends keyof Preset>(
  presetUuid: string,
  fieldName: K,
  value: Preset[K]
): void => {
  withMissionChange((m) => applyUpdatePresetByField(m, { presetUuid, fieldName, value }));
};
import { Checkbox, DegreesInputSlider } from "components/interface/form/globalFields";
import { SubpanelHeading } from "components/interface/_global-elements";
import azimuthStyles from "./preset-right-azimuth.module.css";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import { validators } from "components/interface/form/formValidators";
import { useSunEarthAzimuths } from "components/interface/map/hooks/useSunEarthAzimuths";
import { numericDatetimeToISO } from "utils/formatting";

const Azimuth_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useMissionDocSelector(
    (mission) => mission.presets?.[selectedPresetUuid],
    deepEqual
  );

  const [isDragging, setIsDragging] = useState(false);
  const [displaySunAzimuth, setDisplaySunAzimuth] = useState(selectedPreset?.sunAzimuth ?? 0);
  const [displayEarthAzimuth, setDisplayEarthAzimuth] = useState(selectedPreset?.earthAzimuth ?? 0);

  useEffect(() => {
    setDisplaySunAzimuth(selectedPreset?.sunAzimuth ?? 0);
    setDisplayEarthAzimuth(selectedPreset?.earthAzimuth ?? 0);
  }, [selectedPreset?.sunAzimuth, selectedPreset?.earthAzimuth]);

  const computedAzimuths = useSunEarthAzimuths(selectedPreset);
  const fromDate = selectedPreset?.sunEarthFromDate ?? false;
  const usingComputed = computedAzimuths.source === "date";
  const manualEditable = editMode && !fromDate;
  const shownSunAzimuth = usingComputed
    ? Math.round(computedAzimuths.sunAzimuth) % 360
    : displaySunAzimuth;
  const shownEarthAzimuth = usingComputed
    ? Math.round(computedAzimuths.earthAzimuth) % 360
    : displayEarthAzimuth;

  // Dragging fires on every step; wait for a pause before writing to the mission doc
  const sunDebouncedFunc = useRef(
    debounce((preset: Preset, value: number) => {
      updatePresetField(preset.uuid, "sunAzimuth", value % 360);
    }, AZIMUTH_WRITE_DEBOUNCE_MS)
  );

  const handleOnChangeSunAzimuth = useCallback(
    (preset: Preset, value: number) => {
      //hook into isDragging to prevent this from triggering when values are reset via "Cancel" button
      if (manualEditable && isDragging) {
        setDisplaySunAzimuth(value);
        sunDebouncedFunc.current(preset, value);
      }
    },
    [sunDebouncedFunc, isDragging, manualEditable]
  );

  const earthDebouncedFunc = useRef(
    debounce((preset: Preset, value: number) => {
      updatePresetField(preset.uuid, "earthAzimuth", value % 360);
    }, AZIMUTH_WRITE_DEBOUNCE_MS)
  );

  // Write any pending azimuth before switching presets or unmounting
  useEffect(() => {
    const sunDebounced = sunDebouncedFunc.current;
    const earthDebounced = earthDebouncedFunc.current;
    return () => {
      sunDebounced.flush();
      earthDebounced.flush();
    };
  }, [selectedPresetUuid, manualEditable]);

  const handleOnChangeEarthAzimuth = useCallback(
    (preset: Preset, value: number) => {
      if (manualEditable && isDragging) {
        setDisplayEarthAzimuth(value);
        earthDebouncedFunc.current(preset, value);
      }
    },
    [earthDebouncedFunc, isDragging, manualEditable]
  );

  return (
    selectedPreset && (
      <div className={paneStyles.rightBody}>
        <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
          Celestial Body Direction
        </div>
        <div className={paneStyles.rightBodyBody}>
          <div className={paneStyles.panelContainer}>
            <div className={azimuthStyles.azimuthContainer}>
              <div className={azimuthStyles.azimuthBody}>
                <div className={azimuthStyles.azimuthGroup}>
                  <div className={azimuthStyles.fromDateRow}>
                    {editMode ? (
                      <Checkbox
                        checked={fromDate}
                        editable={editMode}
                        onChange={(e) => {
                          updatePresetField(
                            selectedPreset.uuid,
                            "sunEarthFromDate",
                            e.target.checked
                          );
                        }}
                        label="Calculate using EVA date and lander location"
                        labelClassName={paneStyles.displayFieldLabel}
                        labelPlacement="right"
                        uniqueId="sunEarthFromDateCheckbox"
                      />
                    ) : (
                      <div className={azimuthStyles.settingRow}>
                        <div className={paneStyles.displayFieldLabel}>
                          Calculate using EVA date and lander location:
                        </div>
                        <div className={paneStyles.displayFieldValue}>
                          {fromDate ? "On" : "Off"}
                        </div>
                      </div>
                    )}
                    {fromDate && (
                      <div className={azimuthStyles.fromDateNote} aria-label="sunEarthFromDateNote">
                        {usingComputed ? (
                          <>
                            <div>
                              Lander location at {numericDatetimeToISO(computedAzimuths.datetime)}
                            </div>
                            <div aria-label="sunEarthDateSource">
                              Source: {computedAzimuths.datetimeSourceLabel}
                            </div>
                          </>
                        ) : (
                          "Date or lander location unavailable; using manual azimuths"
                        )}
                      </div>
                    )}
                    {computedAzimuths.warning && (
                      <div className={azimuthStyles.warning} aria-label="sunEarthWarning">
                        {computedAzimuths.warning}
                      </div>
                    )}
                  </div>
                  <div className={azimuthStyles.directions}>
                    <div className={azimuthStyles.directionSection}>
                      <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                        <SubpanelHeading icon={faSun}>Sun Direction</SubpanelHeading>
                      </div>
                      <div className={paneStyles.panelSectionRow}>
                        <div className={azimuthStyles.directionControls}>
                          <div className={paneStyles.azimuthContainer}>
                            {manualEditable ? (
                              <div className={paneStyles.inputFieldContainerAzimuth}>
                                <ValidatedInputField
                                  value={String(displaySunAzimuth)}
                                  editMode={manualEditable}
                                  fieldProps={{
                                    name: "SunDegrees",
                                    ariaLabel: "SunDegrees",
                                    validators: [
                                      validators.mustBeNumber,
                                      validators.maxLength(3),
                                      validators.mustBeInteger,
                                      validators.minValue(0),
                                      validators.maxValue(359),
                                      validators.required,
                                    ],
                                  }}
                                  onSubmit={(value: string) => {
                                    const numValue = Number(value);
                                    setDisplaySunAzimuth(numValue);
                                    updatePresetField(selectedPreset.uuid, "sunAzimuth", numValue);
                                  }}
                                  displayStyle={{ fontSize: "1em", color: "var(--grey4)" }}
                                  displayValue={`${displaySunAzimuth}°`}
                                />
                              </div>
                            ) : null}
                            <div className={paneStyles.sliderWrapper}>
                              <DegreesInputSlider
                                value={shownSunAzimuth}
                                editable={manualEditable}
                                label="Azimuth"
                                onChange={(value: number) => {
                                  handleOnChangeSunAzimuth(selectedPreset, value);
                                }}
                                isDragging={(value: boolean) => {
                                  setIsDragging(value);
                                }}
                                icon={faSun}
                                hideValue={manualEditable}
                              />
                            </div>
                          </div>
                          <div
                            className={`${paneStyles.displayFieldLabel} ${azimuthStyles.enableRow}`}
                          >
                            <div style={{ display: "flex" }}>
                              {editMode ? (
                                <>
                                  <div>
                                    <Checkbox
                                      checked={selectedPreset.sunEnabled}
                                      editable={editMode}
                                      onChange={(e) => {
                                        updatePresetField(
                                          selectedPreset.uuid,
                                          "sunEnabled",
                                          e.target.checked
                                        );
                                      }}
                                      label="Enable:"
                                      labelStyle={{ marginTop: 3, marginRight: 3 }}
                                      labelPlacement="left"
                                      uniqueId="sunCheckbox"
                                    />
                                  </div>
                                </>
                              ) : (
                                <div style={{ marginTop: "3px" }}>
                                  {selectedPreset?.sunEnabled ? "Enabled" : "Disabled"}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={azimuthStyles.directionSection}>
                      <div
                        className={paneStyles.panelSectionTitle}
                        style={{ marginBottom: "8px" }}
                        aria-label={selectedPreset.earthAsMoon ? "moonHeading" : "earthHeading"}
                      >
                        <SubpanelHeading
                          icon={selectedPreset.earthAsMoon ? faMoon : faEarthAmerica}
                        >
                          {selectedPreset.earthAsMoon ? "Moon" : "Earth"} Direction
                        </SubpanelHeading>
                      </div>
                      <div className={paneStyles.panelSectionRow}>
                        <div className={azimuthStyles.directionControls}>
                          <div className={paneStyles.azimuthContainer}>
                            {manualEditable ? (
                              <div className={paneStyles.inputFieldContainerAzimuth}>
                                <ValidatedInputField
                                  value={String(displayEarthAzimuth)}
                                  editMode={manualEditable}
                                  fieldProps={{
                                    name: "EarthDegrees",
                                    ariaLabel: "EarthDegrees",
                                    validators: [
                                      validators.mustBeNumber,
                                      validators.maxLength(3),
                                      validators.mustBeInteger,
                                      validators.minValue(0),
                                      validators.maxValue(359),
                                      validators.required,
                                    ],
                                  }}
                                  onSubmit={(value: string) => {
                                    const numValue = Number(value);
                                    setDisplayEarthAzimuth(numValue);
                                    updatePresetField(
                                      selectedPreset.uuid,
                                      "earthAzimuth",
                                      numValue
                                    );
                                  }}
                                  displayStyle={{ fontSize: "1em", color: "var(--grey4)" }}
                                  displayValue={`${displayEarthAzimuth}°`}
                                />
                              </div>
                            ) : null}
                            <div className={paneStyles.sliderWrapper}>
                              <DegreesInputSlider
                                value={shownEarthAzimuth}
                                editable={manualEditable}
                                label="Azimuth"
                                onChange={(value: number) => {
                                  handleOnChangeEarthAzimuth(selectedPreset, value);
                                }}
                                icon={selectedPreset.earthAsMoon ? faMoon : faEarthAmerica}
                                isDragging={(value: boolean) => {
                                  setIsDragging(value);
                                }}
                                hideValue={manualEditable}
                              />
                            </div>
                          </div>
                          <div className={azimuthStyles.iconRow}>
                            <div style={{ display: "flex" }}>
                              {editMode && (
                                <>
                                  <div
                                    className={`${paneStyles.toggleMenuItemRow} ${paneStyles.menuItemTitle}`}
                                  >
                                    <div
                                      className={`${paneStyles.toggleLeft} ${paneStyles.center} ${
                                        !selectedPreset.earthAsMoon && paneStyles.toggleSelected
                                      }`}
                                      onClick={() => {
                                        if (selectedPreset.earthAsMoon)
                                          updatePresetField(
                                            selectedPreset.uuid,
                                            "earthAsMoon",
                                            false
                                          );
                                      }}
                                      aria-label="earthDirectionButton"
                                    >
                                      Earth
                                    </div>
                                    <div
                                      className={`${paneStyles.toggleRight} ${paneStyles.center} ${
                                        selectedPreset.earthAsMoon && paneStyles.toggleSelected
                                      }`}
                                      onClick={() => {
                                        if (!selectedPreset.earthAsMoon)
                                          updatePresetField(
                                            selectedPreset.uuid,
                                            "earthAsMoon",
                                            true
                                          );
                                      }}
                                      aria-label="moonDirectionButton"
                                    >
                                      Moon
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                          <div
                            className={`${paneStyles.displayFieldLabel} ${azimuthStyles.enableRow}`}
                          >
                            <div style={{ display: "flex" }}>
                              {editMode ? (
                                <>
                                  <div>
                                    <Checkbox
                                      checked={selectedPreset.earthEnabled}
                                      editable={editMode}
                                      onChange={(e) => {
                                        updatePresetField(
                                          selectedPreset.uuid,
                                          "earthEnabled",
                                          e.target.checked
                                        );
                                      }}
                                      label="Enable:"
                                      labelStyle={{ marginTop: 3, marginRight: 3 }}
                                      labelPlacement="left"
                                      uniqueId="earthCheckbox"
                                    />
                                  </div>
                                </>
                              ) : (
                                <div style={{ marginTop: "3px" }}>
                                  {selectedPreset?.earthEnabled ? "Enabled" : "Disabled"}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  );
};
export default Azimuth_Panel;
