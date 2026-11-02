import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyDeletePreset,
  applySetMissionDefaultPreset,
  applySetPresetSublayerStyle,
  applySyncPresetsWithCircleDefinitions,
  applyTogglePresetCircleVisible,
  applyTogglePresetSublayerVisible,
  applyUpdatePresetByField,
  applyUpsertPreset,
} from "operations/apply/apply-mission-preset";
import { generateBlankPreset } from "store/storeUtils/preset";
import { generateBlankFolder } from "store/storeUtils/folder";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";

const getMission = (): Mission => getMissionDocHandle().doc();

let presetA: Preset;
let presetB: Preset;

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  presetA = generateBlankPreset({
    name: "Vitest A",
    missionDefault: true,
    mapSublayerControls: {
      "sub-1": {
        name: "sub",
        sublayerUuid: "sub-1",
        visible: false,
        style: { ...defaultSublayerStyle },
      },
    },
    mapCircleControls: {
      "circle-1": { uuid: "circle-1", visible: false, style: { ...defaultSublayerStyle } },
    },
  });
  presetB = generateBlankPreset({ name: "Vitest B" });
  getMissionDocHandle().change((m) => {
    m.folders = {};
    m.presets = {};
    m.circleDefinitions = { "circle-1": { name: "Circle", radius: 5 } };
  });
  withMissionChange((m) => {
    applyUpsertPreset(m, presetA);
    applyUpsertPreset(m, presetB);
  });
});

describe("apply-mission-preset", () => {
  it("applyUpdatePresetByField() updates a field and the updatedAt time", () => {
    withMissionChange((m) =>
      applyUpdatePresetByField(m, {
        presetUuid: presetB.uuid,
        fieldName: "name",
        value: "Updated preset",
      })
    );
    expect(getMission().presets[presetB.uuid].name).toBe("Updated preset");
  });

  it("applySetMissionDefaultPreset() keeps exactly one default", () => {
    withMissionChange((m) =>
      applySetMissionDefaultPreset(m, { presetUuid: presetB.uuid, missionDefault: true })
    );
    expect(getMission().presets[presetA.uuid].missionDefault).toBe(false);
    expect(getMission().presets[presetB.uuid].missionDefault).toBe(true);
  });

  it("toggles and styles sublayer and circle controls", () => {
    withMissionChange((m) => {
      applyTogglePresetSublayerVisible(m, { presetUuid: presetA.uuid, sublayerUuid: "sub-1" });
      applyTogglePresetCircleVisible(m, { presetUuid: presetA.uuid, circleUuid: "circle-1" });
      applySetPresetSublayerStyle(m, {
        presetUuid: presetA.uuid,
        sublayerUuid: "sub-1",
        style: { ...defaultSublayerStyle, opacity: 0.3 },
      });
    });
    const preset = getMission().presets[presetA.uuid];
    expect(preset.mapSublayerControls["sub-1"].visible).toBe(true);
    expect(preset.mapSublayerControls["sub-1"].style.opacity).toBe(0.3);
    expect(preset.mapCircleControls["circle-1"].visible).toBe(true);
  });

  it("applySyncPresetsWithCircleDefinitions() adds new and removes deleted circle controls", () => {
    getMissionDocHandle().change((m) => {
      m.circleDefinitions = { "circle-2": { name: "New", radius: 10 } };
    });
    withMissionChange((m) => applySyncPresetsWithCircleDefinitions(m));

    for (const preset of Object.values(getMission().presets)) {
      expect(Object.keys(preset.mapCircleControls)).toEqual(["circle-2"]);
      expect(preset.mapCircleControls["circle-2"].visible).toBe(false);
    }
  });

  it("applyDeletePreset() removes the preset and its folder entry", () => {
    const folder = generateBlankFolder({ type: "preset", items: [presetA.uuid] });
    getMissionDocHandle().change((m) => {
      m.folders[folder.uuid] = folder;
    });

    withMissionChange((m) => applyDeletePreset(m, presetA.uuid));
    expect(getMission().presets[presetA.uuid]).toBeUndefined();
    expect(getMission().folders[folder.uuid].items).toEqual([]);
  });
});
