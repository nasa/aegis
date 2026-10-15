import type { FunctionComponent } from "react";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import {
  faBullseye,
  faCircleInfo,
  faLayerGroup,
  faTrashAlt,
  faSun,
} from "@fortawesome/free-solid-svg-icons";

import Info_panel from "./preset-right-info";
import Layers_Panel from "./preset-right-layers";
import Preset_Circles_Panel from "./preset-right-circles";
import Azimuth_Panel from "./preset-right-azimuth";
import paneStyles from "../global-pane-styles.module.css";
import { setSelectedPresetRightNavItem } from "store/preset";
import { Button } from "components/interface/form/globalFields";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDeletePreset } from "store/thunk/thunkPreset";
import { validators } from "components/interface/form/formValidators";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import { applyUpdatePresetByField } from "operations/apply/apply-mission-preset";
import { RightTabs } from "components/interface/side-controls";
import Grid_Panel from "./preset-right-grid";
import GridSquareIcon from "assets/draw-square-regular-full.svg?react";

const PresetEditorRight: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const selectedRightNavItem = useAppSelector(
    (state) => state.preset.selectedRightNavItem,
    refEqual
  );
  const isInEditMode = useAppSelector(
    (state) => state.user.missionPerms.permissions.edit && state.mission.isInEditMode,
    refEqual
  );
  const selectedPresetUuid = useAppSelector((state) => state.preset.selectedPresetUuid, refEqual);
  const selectedPreset = useMissionDocSelector(
    (mission) => mission.presets?.[selectedPresetUuid],
    deepEqual
  );
  const otherPresetNames =
    useMissionDocSelector(
      (mission) =>
        Object.values(mission.presets ?? {})
          .filter((preset) => preset.uuid !== selectedPresetUuid)
          .map((preset) => preset.name),
      deepEqual
    ) ?? [];

  const panelTypes: PanelTypes = {
    info_panel: {
      title: "Preset Information",
      panel: Info_panel,
      selectedColor: "white",
      icon: faCircleInfo,
    },
    layers_panel: {
      title: "Preset Layer Configuration",
      panel: Layers_Panel,
      selectedColor: "white",
      icon: faLayerGroup,
    },
    circle_panel: {
      title: "Proximity Circles Display",
      panel: Preset_Circles_Panel,
      selectedColor: "white",
      icon: faBullseye,
    },
    azimuth_panel: {
      title: "Celestial Body Direction",
      panel: Azimuth_Panel,
      selectedColor: "white",
      icon: faSun,
    },
    grid_panel: {
      title: "Grid Configuration",
      panel: Grid_Panel,
      selectedColor: "white",
      svgComponent: GridSquareIcon,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ActiveComponent: FunctionComponent<any> = panelTypes[selectedRightNavItem]?.panel;

  return (
    selectedPreset && (
      <>
        <div className={paneStyles.rightTopTitle}>
          <div className={paneStyles.rightTopTitleText}>
            <ValidatedInputField
              value={selectedPreset.name}
              editMode={isInEditMode}
              fieldProps={{
                name: "name",
                ariaLabel: "Preset Title",
                validators: [
                  validators.required,
                  validators.maxLength(255),
                  validators.mustBeUnique(otherPresetNames),
                ],
              }}
              styleContainer={{ paddingRight: "10px" }}
              displayStyle={{ fontSize: "1.1em", color: "var(--preset)" }}
              onSubmit={(val: string) => {
                withMissionChange((m) =>
                  applyUpdatePresetByField(m, {
                    presetUuid: selectedPreset.uuid,
                    fieldName: "name",
                    value: val || "",
                  })
                );
              }}
              key={`${selectedPreset.uuid}-name`}
            />
          </div>
        </div>
        <div className={paneStyles.rightSubTray}>
          <RightTabs
            selectedRightNavItem={selectedRightNavItem}
            panelTypes={panelTypes}
            dispatchFunction={setSelectedPresetRightNavItem}
          />
          <div className={paneStyles.saveCancelContainer}>
            {isInEditMode && (
              <Button
                icon={faTrashAlt}
                onClick={() => {
                  if (window.confirm("Are you sure you want to delete this Preset?")) {
                    dispatch(thunkDeletePreset({ presetUuid: selectedPreset.uuid }));
                  }
                }}
                toolTip="Delete Preset"
                style={{ width: "30px", fontSize: "0.9em", paddingLeft: "9px" }}
                ariaLabel="deleteButton"
              />
            )}
          </div>
        </div>

        <ActiveComponent className={paneStyles.rightActiveWindow} editMode={isInEditMode} />
      </>
    )
  );
};

export default PresetEditorRight;
