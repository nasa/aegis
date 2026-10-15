import type { StoreType } from "store";
import { createTestStoreWithAutomergeMission } from "tests/vitest/fixtures/store";
import {
  thunkCreatePreset,
  thunkDeletePreset,
  thunkDuplicatePreset,
  thunkSyncPresetsWithMission,
} from "store/thunk/thunkPreset";
import { generateBlankLayer } from "store/storeUtils/layer";
import { defaultSublayerStyle, generateBlankSublayer } from "store/storeUtils/sublayer";
import { getMissionDocHandle, withMissionChange } from "client/automergeDocHandles";
import { applyUpsertFolder } from "operations/apply/apply-mission-folder";
import { generateBlankFolder } from "store/storeUtils/folder";

let store: StoreType;

const getMission = (): Mission => getMissionDocHandle().doc();
const getDefaultPreset = (): Preset =>
  Object.values(getMission().presets).find((preset) => preset.missionDefault);

beforeEach(() => {
  store = createTestStoreWithAutomergeMission();
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Thunk Preset Tests", () => {
  describe("thunkCreatePreset", () => {
    it("adds a preset to the mission doc and selects it", async () => {
      const numPresets = Object.keys(getMission().presets).length;
      await store.dispatch(thunkCreatePreset());

      const presets = Object.values(getMission().presets);
      expect(presets.length).toEqual(numPresets + 1);
      const selectedUuid = store.getState().preset.selectedPresetUuid;
      expect(getMission().presets[selectedUuid]).toBeDefined();
      expect(store.getState().preset.presetLayersUIStates[selectedUuid]).toBeDefined();
      expect(store.getState().preset.presetCirclesUIStates[selectedUuid]).toBeDefined();
    });

    it("builds layer order and controls from the mission layers, sublayers, and circles", async () => {
      const layerB = generateBlankLayer({ name: "Vitest B Layer" });
      const layerA = generateBlankLayer({ name: "Vitest A Layer" });
      const sublayer2 = generateBlankSublayer({ name: "z sublayer", layerUuid: layerA.uuid });
      const sublayer1 = generateBlankSublayer({ name: "a sublayer", layerUuid: layerA.uuid });
      withMissionChange((m) => {
        m.layers = { [layerB.uuid]: layerB, [layerA.uuid]: layerA };
        m.sublayers = { [sublayer2.uuid]: sublayer2, [sublayer1.uuid]: sublayer1 };
        m.circleDefinitions = { "circle-1": { name: "Circle", radius: 10 } };
      });

      await store.dispatch(thunkCreatePreset());
      const newPreset = getMission().presets[store.getState().preset.selectedPresetUuid];

      expect(newPreset.layerOrder).toEqual([
        { layerUuid: layerA.uuid, sublayerUuids: [sublayer1.uuid, sublayer2.uuid] },
        { layerUuid: layerB.uuid, sublayerUuids: [] },
      ]);
      expect(Object.keys(newPreset.mapSublayerControls).sort()).toEqual(
        [sublayer1.uuid, sublayer2.uuid].sort()
      );
      expect(newPreset.mapCircleControls["circle-1"]).toMatchObject({ visible: false });
      expect(newPreset.missionDefault).toBe(false);
    });
  });

  describe("thunkDuplicatePreset", () => {
    it("adds a non-default copy of the preset with real timestamps", async () => {
      const original = getDefaultPreset();
      await store.dispatch(thunkDuplicatePreset({ presetUuid: original.uuid }));

      const copy = getMission().presets[store.getState().preset.selectedPresetUuid];
      expect(copy.uuid).not.toEqual(original.uuid);
      expect(copy.name).toContain("copy");
      expect(copy.missionDefault).toBe(false);
      expect(typeof copy.updatedAt).toBe("number");
      expect(copy.mapSublayerControls).toEqual(original.mapSublayerControls);
    });

    it("is a no-op when presetUuid is missing", async () => {
      const numPresets = Object.keys(getMission().presets).length;
      await store.dispatch(thunkDuplicatePreset({ presetUuid: null }));
      expect(Object.keys(getMission().presets).length).toEqual(numPresets);
    });
  });

  describe("thunkDeletePreset", () => {
    it("removes the preset from the doc and its folder, and reselects the default", async () => {
      await store.dispatch(thunkCreatePreset());
      const createdUuid = store.getState().preset.selectedPresetUuid;
      const folder = generateBlankFolder({ type: "preset", items: [createdUuid] });
      withMissionChange((m) => applyUpsertFolder(m, folder));

      await store.dispatch(thunkDeletePreset({ presetUuid: createdUuid }));

      expect(getMission().presets[createdUuid]).toBeUndefined();
      expect(getMission().folders[folder.uuid].items).toEqual([]);
      expect(store.getState().preset.presetLayersUIStates[createdUuid]).toBeUndefined();
      expect(store.getState().preset.selectedPresetUuid).toEqual(getDefaultPreset().uuid);
    });

    it("selects nothing when the deleted preset was the only default", async () => {
      await store.dispatch(thunkDeletePreset({ presetUuid: getDefaultPreset().uuid }));
      expect(store.getState().preset.selectedPresetUuid).toBeNull();
    });
  });

  describe("thunkSyncPresetsWithMission", () => {
    it("adds and removes circle controls and UI states to match the circle definitions", async () => {
      const preset = getDefaultPreset();
      withMissionChange((m) => {
        m.circleDefinitions = { "circle-new": { name: "New", radius: 5 } };
        m.presets[preset.uuid].mapCircleControls = {
          "circle-old": {
            uuid: "circle-old",
            visible: true,
            style: { ...defaultSublayerStyle },
          },
        };
      });

      await store.dispatch(thunkSyncPresetsWithMission());

      const controls = getMission().presets[preset.uuid].mapCircleControls;
      expect(Object.keys(controls)).toEqual(["circle-new"]);
      expect(store.getState().preset.presetCirclesUIStates[preset.uuid]).toEqual({
        "circle-new": { slidersSelected: false },
      });
    });
  });
});
