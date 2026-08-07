import type { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import gridStyles from "./preset-right-grid.module.css";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faInfo, faPaintBrush } from "@fortawesome/free-solid-svg-icons";
import { useAppDispatch } from "utils/useAppDispatch";
import { upsertPresetByField } from "store/preset";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";
import Settings_subpanel from "components/interface/settings-and-slider";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { Checkbox } from "components/interface/form/globalFields";
import { useResolvedMissionGrid } from "components/interface/map/hooks/useResolvedMissionGrid";

const defaultGridStyle: MapSublayerStyle = {
  ...defaultSublayerStyle,
  color: "rgba(255,255,255,0.4)",
  weight: 1,
};

const Grid_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const resolvedGrid = useResolvedMissionGrid();

  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset: Preset = useAppSelector(
    (state) => state.preset.presets.find((preset) => preset.uuid === selectedPresetUuid),
    deepEqual
  );
  const presetGridControl = selectedPreset?.mapGridControl;
  const gridControl: MapGridControl = {
    visible: !!presetGridControl?.visible,
    labelsVisible: !!presetGridControl?.labelsVisible,
    style: { ...defaultGridStyle, ...presetGridControl?.style },
  };

  const gridDefinition =
    resolvedGrid.kind === "server-file" ? resolvedGrid.grid.gridDefinition : undefined;

  const styleSetterHandler = ({
    uuid,
    layerStyle,
  }: {
    uuid: string;
    layerStyle: MapSublayerStyle;
  }) => {
    const updatedGridControl: MapGridControl = {
      visible: gridControl.visible,
      labelsVisible: gridControl.labelsVisible,
      style: layerStyle,
    };
    dispatch(upsertPresetByField(uuid, "mapGridControl", updatedGridControl));
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
        Grid Preferences
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          {resolvedGrid.kind !== "none" ? (
            <div>
              <div>
                <div className={gridStyles.gridGroup}>
                  <div className={paneStyles.panelSection}>
                    <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
                      <SubpanelHeading icon={faInfo}>Grid Information</SubpanelHeading>
                    </div>
                    <div className={paneStyles.panelSectionRow}>
                      <div className={paneStyles.panelSection2Column}>
                        <div className={paneStyles.panelColumnTable}>
                          <div className={paneStyles.panelColumnTableRow}>
                            <div className={paneStyles.panelColumnTableCell}>
                              <div className={paneStyles.displayFieldLabel}>
                                Number of Grid Columns:
                              </div>
                            </div>
                            <div className={paneStyles.panelColumnTableCell}>
                              <div className={paneStyles.displayFieldValue}>
                                {gridDefinition?.numCols ? gridDefinition.numCols : "N/A"}
                              </div>
                            </div>
                          </div>
                          <div className={paneStyles.panelColumnTableRow}>
                            <div className={paneStyles.panelColumnTableCell}>
                              <div className={paneStyles.displayFieldLabel}>
                                Number of Grid Rows:
                              </div>
                            </div>
                            <div className={paneStyles.panelColumnTableCell}>
                              <div className={paneStyles.displayFieldValue}>
                                {gridDefinition?.numRows ? gridDefinition.numRows : "N/A"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className={paneStyles.panelSection}>
                    <div className={paneStyles.panelSectionTitle}>
                      <SubpanelHeading icon={faPaintBrush}>Visual Preferences</SubpanelHeading>
                    </div>

                    {editMode ? (
                      <div>
                        <div className={gridStyles.gridToggles}>
                          <Checkbox
                            checked={gridControl.visible}
                            onChange={(e) => {
                              dispatch(
                                upsertPresetByField(selectedPresetUuid, "mapGridControl", {
                                  ...gridControl,
                                  visible: e.target.checked,
                                  labelsVisible: e.target.checked
                                    ? gridControl.labelsVisible
                                    : false,
                                })
                              );
                            }}
                            editable={editMode}
                            toolTip={`Show Grid`}
                            label="Show Grid"
                          />
                          <Checkbox
                            checked={gridControl.labelsVisible}
                            onChange={(e) => {
                              dispatch(
                                upsertPresetByField(selectedPresetUuid, "mapGridControl", {
                                  ...gridControl,
                                  labelsVisible: e.target.checked,
                                })
                              );
                            }}
                            editable={editMode && !!presetGridControl?.visible}
                            toolTip={`Show Grid Labels`}
                            label="Show Grid Labels"
                          />
                        </div>
                        <Settings_subpanel
                          type="grid"
                          uuid={selectedPreset.uuid}
                          styleSetter={styleSetterHandler}
                          mapGridControl={gridControl}
                        />
                      </div>
                    ) : (
                      <div>
                        <div className={paneStyles.panelSectionRow}>
                          <div className={paneStyles.panelSection2Column}>
                            <div className={paneStyles.panelColumnTable}>
                              <div className={paneStyles.panelColumnTableRow}>
                                <div className={paneStyles.panelColumnTableCell}>
                                  <div className={paneStyles.displayFieldLabel}>
                                    Grid Visibility:
                                  </div>
                                </div>
                                <div className={paneStyles.panelColumnTableCell}>
                                  <div className={paneStyles.displayFieldValue}>
                                    {presetGridControl?.visible ? "Visible" : "Hidden"}
                                  </div>
                                </div>
                              </div>
                              <div className={paneStyles.panelColumnTableRow}>
                                <div className={paneStyles.panelColumnTableCell}>
                                  <div className={paneStyles.displayFieldLabel}>
                                    Grid Label Visibility:
                                  </div>
                                </div>
                                <div className={paneStyles.panelColumnTableCell}>
                                  <div className={paneStyles.displayFieldValue}>
                                    {presetGridControl?.labelsVisible ? "Visible" : "Hidden"}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={paneStyles.panelSection}>No Grid Available</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Grid_Panel;
