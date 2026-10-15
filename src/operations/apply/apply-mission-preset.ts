import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";

import { applyRemoveItemsFromAllFolders } from "./apply-mission-folder";

/** Insert/replace a preset in the doc. */
export function applyUpsertPreset(m: Mission, preset: Preset): void {
  m.presets[preset.uuid] = cloneDeep(preset);
}

/** Update a single preset field. */
export function applyUpdatePresetByField<K extends keyof Preset>(
  m: Mission,
  { presetUuid, fieldName, value }: { presetUuid: string; fieldName: K; value: Preset[K] }
): void {
  const preset = m.presets[presetUuid];
  if (!preset) return;
  preset[fieldName] = cloneDeep(value);
  preset.updatedAt = getAccurateNow().getTime();
}

/** Delete a preset from the doc and from every folder. */
export function applyDeletePreset(m: Mission, presetUuid: string): void {
  delete m.presets[presetUuid];
  applyRemoveItemsFromAllFolders(m, [presetUuid]);
}

/** Make one preset the mission default and clear the flag on every other preset. */
export function applySetMissionDefaultPreset(
  m: Mission,
  { presetUuid, missionDefault }: { presetUuid: string; missionDefault: boolean }
): void {
  const now = getAccurateNow().getTime();
  for (const preset of Object.values(m.presets)) {
    const shouldBeDefault = missionDefault && preset.uuid === presetUuid;
    if (preset.missionDefault !== shouldBeDefault) {
      preset.missionDefault = shouldBeDefault;
      preset.updatedAt = now;
    }
  }
}

/** Toggle visibility of a sublayer in a preset. */
export function applyTogglePresetSublayerVisible(
  m: Mission,
  { presetUuid, sublayerUuid }: { presetUuid: string; sublayerUuid: string }
): void {
  const control = m.presets[presetUuid]?.mapSublayerControls[sublayerUuid];
  if (!control) return;
  control.visible = !control.visible;
  m.presets[presetUuid].updatedAt = getAccurateNow().getTime();
}

/** Set the style of a sublayer in a preset. */
export function applySetPresetSublayerStyle(
  m: Mission,
  {
    presetUuid,
    sublayerUuid,
    style,
  }: { presetUuid: string; sublayerUuid: string; style: MapSublayerStyle }
): void {
  const control = m.presets[presetUuid]?.mapSublayerControls[sublayerUuid];
  if (!control) return;
  control.style = cloneDeep(style);
  m.presets[presetUuid].updatedAt = getAccurateNow().getTime();
}

/** Toggle visibility of a lander circle in a preset. */
export function applyTogglePresetCircleVisible(
  m: Mission,
  { presetUuid, circleUuid }: { presetUuid: string; circleUuid: string }
): void {
  const control = m.presets[presetUuid]?.mapCircleControls[circleUuid];
  if (!control) return;
  control.visible = !control.visible;
  m.presets[presetUuid].updatedAt = getAccurateNow().getTime();
}

/** Set the style of a lander circle in a preset. */
export function applySetPresetCircleStyle(
  m: Mission,
  {
    presetUuid,
    circleDefUuid,
    style,
  }: { presetUuid: string; circleDefUuid: string; style: MapSublayerStyle }
): void {
  const control = m.presets[presetUuid]?.mapCircleControls[circleDefUuid];
  if (!control) return;
  control.style = cloneDeep(style);
  m.presets[presetUuid].updatedAt = getAccurateNow().getTime();
}

/**
 * Bring every preset's lander circle controls in line with the mission's circle definitions:
 * add a hidden control for each new definition and remove controls for deleted ones.
 */
export function applySyncPresetsWithCircleDefinitions(m: Mission): void {
  const circleDefinitions = m.circleDefinitions ?? {};
  const now = getAccurateNow().getTime();
  for (const preset of Object.values(m.presets)) {
    let changed = false;
    for (const circleUuid of Object.keys(circleDefinitions)) {
      if (!preset.mapCircleControls[circleUuid]) {
        preset.mapCircleControls[circleUuid] = {
          uuid: circleUuid,
          visible: false,
          style: { ...defaultSublayerStyle },
        };
        changed = true;
      }
    }
    for (const circleUuid of Object.keys(preset.mapCircleControls)) {
      if (!(circleUuid in circleDefinitions)) {
        delete preset.mapCircleControls[circleUuid];
        changed = true;
      }
    }
    if (changed) preset.updatedAt = now;
  }
}
