import throttle from "lodash/throttle";
import paneStyles from "../global-pane-styles.module.css";
import type { FunctionComponent } from "react";
import { useCallback, useRef, useState } from "react";
import { faEarthAmerica, faSun, faMoon } from "@fortawesome/free-solid-svg-icons";
import { upsertPresets } from "store/preset";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { Checkbox, DegreesInputSlider } from "components/interface/form/globalFields";
import { SubpanelHeading } from "components/interface/_global-elements";
import azimuthStyles from "./preset-right-azimuth.module.css";

const Azimuth_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useAppSelector(
    (state) => state.preset.presets.find((preset) => preset.uuid === selectedPresetUuid),
    deepEqual
  );

  const [isDragging, setIsDragging] = useState(false);

  const sunThrottledFunc = useRef(
    throttle((preset: Preset, value: number) => {
      dispatch(
        upsertPresets([
          {
            ...preset,
            sunAzimuth: value,
          },
        ])
      );
    }, 50)
  );

  const handleOnChangeSunAzimuth = useCallback(
    (preset: Preset, value: number) => {
      //hook into isDragging to prevent this from triggering when values are reset via "Cancel" button
      if (isDragging) sunThrottledFunc.current(preset, value);
    },
    [sunThrottledFunc, isDragging]
  );

  const earthThrottledFunc = useRef(
    throttle((preset: Preset, value: number) => {
      dispatch(
        upsertPresets([
          {
            ...preset,
            earthAzimuth: value,
          },
        ])
      );
    }, 50)
  );

  const handleOnChangeEarthAzimuth = useCallback(
    (preset: Preset, value: number) => {
      if (isDragging) earthThrottledFunc.current(preset, value);
    },
    [earthThrottledFunc, isDragging]
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
                  <div className={azimuthStyles.azimuth}>
                    <div>Azimuth</div>
                  </div>
                  <div
                    className={`${paneStyles.panelSectionInner2Column} ${azimuthStyles.panelSection}`}
                  >
                    <div className={paneStyles.panelSectionInner2ColumnLeft}>
                      <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                        <SubpanelHeading icon={faSun}>Sun Direction</SubpanelHeading>
                      </div>
                      <div className={paneStyles.panelSectionRow}>
                        <div className={paneStyles.degreesInputContainer}>
                          <div className={paneStyles.descriptionContainer}>
                            <DegreesInputSlider
                              value={selectedPreset.sunAzimuth}
                              editable={editMode}
                              label="Azimuth"
                              onChange={(value: number) => {
                                handleOnChangeSunAzimuth(selectedPreset, value);
                              }}
                              isDragging={(value: boolean) => {
                                setIsDragging(value);
                              }}
                              icon={faSun}
                            />
                          </div>
                          <div
                            className={paneStyles.displayFieldLabel}
                            style={{ margin: "6px 0 0 18px" }}
                          >
                            <div style={{ display: "flex" }}>
                              {editMode ? (
                                <>
                                  <div>
                                    <Checkbox
                                      checked={selectedPreset.sunEnabled}
                                      editable={editMode}
                                      onChange={(e) => {
                                        dispatch(
                                          upsertPresets([
                                            {
                                              ...selectedPreset,
                                              sunEnabled: e.target.checked,
                                            },
                                          ])
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
                    <div
                      className={paneStyles.panelSectionInner2ColumnRight}
                      style={{ marginLeft: "40px" }}
                    >
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
                        <div className={paneStyles.degreesInputContainer}>
                          <div className={paneStyles.descriptionContainer}>
                            <DegreesInputSlider
                              value={selectedPreset.earthAzimuth}
                              editable={editMode}
                              label="Azimuth"
                              onChange={(value: number) => {
                                handleOnChangeEarthAzimuth(selectedPreset, value);
                              }}
                              icon={selectedPreset.earthAsMoon ? faMoon : faEarthAmerica}
                              isDragging={(value: boolean) => {
                                setIsDragging(value);
                              }}
                            />
                          </div>
                          <div
                            className={paneStyles.displayFieldLabel}
                            style={{ margin: "6px 0 0 18px" }}
                          >
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
                                          dispatch(
                                            upsertPresets([
                                              { ...selectedPreset, earthAsMoon: false },
                                            ])
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
                                          dispatch(
                                            upsertPresets([
                                              { ...selectedPreset, earthAsMoon: true },
                                            ])
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
                            className={paneStyles.displayFieldLabel}
                            style={{ marginLeft: "18px" }}
                          >
                            <div style={{ display: "flex" }}>
                              {editMode ? (
                                <>
                                  <div>
                                    <Checkbox
                                      checked={selectedPreset.earthEnabled}
                                      editable={editMode}
                                      onChange={(e) => {
                                        dispatch(
                                          upsertPresets([
                                            {
                                              ...selectedPreset,
                                              earthEnabled: e.target.checked,
                                            },
                                          ])
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
