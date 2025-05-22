import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import gridStyles from "./preset-right-grid.module.css";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faInfo, faPaintBrush } from "@fortawesome/free-solid-svg-icons";
import { globalGrid } from "utils/grid";
import { useAppDispatch } from "utils/useAppDispatch";
import { upsertPresetByField } from "store/preset";
import Settings_subpanel from "components/interface/settings-and-slider";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { Checkbox } from "components/interface/form/globalFields";

const Grid_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();

  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset: Preset = useAppSelector(
    (state) => state.preset.presets.find((preset) => preset.uuid === selectedPresetUuid),
    deepEqual
  );
  const presetGridControl = selectedPreset?.mapGridControl;

  const gridInformation: MissionGridInformation = globalGrid?.gridInformation;

  const styleSetterHandler = ({
    uuid,
    layerStyle,
  }: {
    uuid: string;
    layerStyle: MapSublayerStyle;
  }) => {
    const gridControl: MapGridControl = {
      visible: !!presetGridControl?.visible,
      labelsVisible: !!presetGridControl?.labelsVisible,
      style: layerStyle,
    };
    dispatch(upsertPresetByField(uuid, "mapGridControl", gridControl));
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
        Grid Prefereneces
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          {globalGrid ? (
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
                            <div className={paneStyles.panelColumnTableCellLeft}>
                              <div className={paneStyles.displayFieldLabel}>
                                Number of Grid Columns:
                              </div>
                            </div>
                            <div className={paneStyles.panelColumnTableCell}>
                              <div className={paneStyles.displayFieldValue}>
                                {gridInformation?.numCols ? gridInformation.numCols : "N/A"}
                              </div>
                            </div>
                          </div>
                          <div className={paneStyles.panelColumnTableRow}>
                            <div className={paneStyles.panelColumnTableCellLeft}>
                              <div className={paneStyles.displayFieldLabel}>
                                Number of Grid Rows:
                              </div>
                            </div>
                            <div className={paneStyles.panelColumnTableCell}>
                              <div className={paneStyles.displayFieldValue}>
                                {gridInformation?.numRows ? gridInformation.numRows : "N/A"}
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
                            checked={!!presetGridControl?.visible}
                            onChange={(e) => {
                              dispatch(
                                upsertPresetByField(selectedPresetUuid, "mapGridControl", {
                                  ...presetGridControl,
                                  visible: e.target.checked,
                                  labelsVisible: e.target.checked
                                    ? presetGridControl?.labelsVisible
                                    : false,
                                })
                              );
                            }}
                            editable={editMode}
                            toolTip={`Show Grid`}
                            label="Show Grid"
                          />
                          <Checkbox
                            checked={!!presetGridControl?.labelsVisible}
                            onChange={(e) => {
                              dispatch(
                                upsertPresetByField(selectedPresetUuid, "mapGridControl", {
                                  ...presetGridControl,
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
                          mapGridControl={presetGridControl}
                        />
                      </div>
                    ) : (
                      <div>
                        <div className={paneStyles.panelSectionRow}>
                          <div className={paneStyles.panelSection2Column}>
                            <div className={paneStyles.panelColumnTable}>
                              <div className={paneStyles.panelColumnTableRow}>
                                <div className={paneStyles.panelColumnTableCellLeft}>
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
                                <div className={paneStyles.panelColumnTableCellLeft}>
                                  <div className={paneStyles.displayFieldLabel}>
                                    Grid Label Visibility:
                                  </div>
                                </div>
                                <div className={paneStyles.panelColumnTableCell}>
                                  <div className={paneStyles.displayFieldValue}>
                                    {presetGridControl?.labelVisible ? "Visible" : "Hidden"}
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
