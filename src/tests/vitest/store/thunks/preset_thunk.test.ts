import type { StoreType } from "store";
import {
  createTestStoreWithAutomergeMission,
  createCustomTestStore,
} from "tests/vitest/fixtures/store";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the vi.mock
vi.mock("http-client/preset");
import * as httpClient_preset from "http-client/preset";
import {
  thunkCreatePreset,
  thunkDeletePreset,
  thunkDuplicatePreset,
  thunkPresetCancel,
  thunkSavePreset,
  thunkSyncPresetsWithMission,
} from "store/thunk/thunkPreset";
import {
  setPresetEditMode,
  upsertPresets,
  upsertPresetByField,
  upsertPresetsFromDb,
} from "store/preset";
import { generateBlankPreset } from "store/storeUtils/preset";
import { generateBlankLayer } from "store/storeUtils/layer";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import { setMissionAutomergeDocHandle, getMissionDocHandle } from "client/automergeDocHandles";
import { initialState as missionInitialState } from "store/mission";
import { initialState as presetInitialState } from "store/preset";

let store: StoreType;

beforeAll(() => {
  store = createTestStoreWithAutomergeMission();

  // Init the mission automerge doc.
  setMissionAutomergeDocHandle(null);
});

beforeEach(async () => {
  vi.clearAllMocks(); // clear call count
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Thunk Preset Tests", () => {
  describe("thunkSavePreset", () => {
    it("saves changes and exits edit mode", async () => {
      // put a preset in edit mode
      const presetCopy = store.getState().preset.presets[0];
      store.dispatch(setPresetEditMode({ presetUuid: presetCopy.uuid, editMode: true }));
      const newName = "Vitest Test Preset Modified";
      store.dispatch(upsertPresetByField(presetCopy.uuid, "name", newName));

      await store.dispatch(thunkSavePreset({ presetUuid: presetCopy.uuid }));
      expect(store.getState().preset.presets.find((p) => p.uuid === presetCopy.uuid).name).toEqual(
        newName
      );
      expect(
        store.getState().preset.presetsFromDb.find((p) => p.uuid === presetCopy.uuid).name
      ).toEqual(newName); // db copy matches
      expect(httpClient_preset.upsertPresets).toHaveBeenCalledTimes(1); // upserted to db
      expect(
        store.getState().preset.presetsEditing.find((uuid) => uuid === presetCopy.uuid)
      ).toBeUndefined(); // not in edit mode
    });

    it("is a no-op when presetUuid is missing", async () => {
      const before = vi.mocked(httpClient_preset.upsertPresets).mock.calls.length;
      await store.dispatch(thunkSavePreset({ presetUuid: null }));
      expect(vi.mocked(httpClient_preset.upsertPresets).mock.calls.length).toBe(before);
    });

    it("throws when upsertPresets returns a non-success status", async () => {
      vi.mocked(httpClient_preset.upsertPresets).mockResolvedValueOnce({
        status: "error",
        message: "vitest error message",
        data: null,
      });
      const presetCopy = store.getState().preset.presets[0];
      const result = await store.dispatch(thunkSavePreset({ presetUuid: presetCopy.uuid }));
      expect(result.meta.requestStatus).toBe("rejected");
      expect((result as { error?: { message?: string } }).error?.message).toMatch(
        /Error upserting Presets/
      );
    });
  });

  describe("thunkPresetCancel", () => {
    it("reverts unsaved changes and exits edit mode", async () => {
      // modify a preset in the store and cancel
      const presetCopy = store.getState().preset.presets[0];
      const newName = "Vitest Test Preset Modified";
      store.dispatch(upsertPresetByField(presetCopy.uuid, "name", newName));
      store.dispatch(setPresetEditMode({ presetUuid: presetCopy.uuid, editMode: true }));

      await store.dispatch(thunkPresetCancel({ presetUuid: presetCopy.uuid }));
      expect(store.getState().preset.presets.find((p) => p.uuid === presetCopy.uuid).name).toEqual(
        presetCopy.name
      ); // name did not save
      expect(
        store.getState().preset.presetsEditing.find((uuid) => uuid === presetCopy.uuid)
      ).toBeUndefined(); // not in edit mode

      // add a new unsaved preset and cancel
      const newUnsavedPreset = generateBlankPreset({ name: "Vitest Test Preset" });
      store.dispatch(upsertPresets([newUnsavedPreset]));
      store.dispatch(setPresetEditMode({ presetUuid: newUnsavedPreset.uuid, editMode: true }));

      await store.dispatch(thunkPresetCancel({ presetUuid: newUnsavedPreset.uuid }));
      expect(
        store.getState().preset.presets.find((p) => p.uuid === newUnsavedPreset.uuid)
      ).toBeUndefined(); // preset not in store
      expect(
        store.getState().preset.presetsEditing.find((uuid) => uuid === newUnsavedPreset.uuid)
      ).toBeUndefined(); // not in edit mode
    });
  });

  describe("thunkDeletePreset", () => {
    it("removes the preset from the store and exits edit mode", async () => {
      // add a new unsaved preset and delete
      const newUnsavedPreset = generateBlankPreset({ name: "Vitest Test Preset" });
      store.dispatch(upsertPresets([newUnsavedPreset]));
      store.dispatch(setPresetEditMode({ presetUuid: newUnsavedPreset.uuid, editMode: true }));

      await store.dispatch(thunkDeletePreset({ presetUuid: newUnsavedPreset.uuid }));
      expect(
        store.getState().preset.presets.find((p) => p.uuid === newUnsavedPreset.uuid)
      ).toBeUndefined(); // not in store
      expect(
        store.getState().preset.presetsEditing.find((uuid) => uuid === newUnsavedPreset.uuid)
      ).toBeUndefined(); // not in edit mode

      // delete existing preset
      const existingPreset = store.getState().preset.presets[0];
      store.dispatch(setPresetEditMode({ presetUuid: existingPreset.uuid, editMode: true }));

      await store.dispatch(thunkDeletePreset({ presetUuid: existingPreset.uuid }));
      expect(
        store.getState().preset.presets.find((p) => p.uuid === existingPreset.uuid)
      ).toBeUndefined(); // not in store
      expect(
        store.getState().preset.presetsFromDb.find((p) => p.uuid === existingPreset.uuid)
      ).toBeUndefined(); // not in db store
      expect(
        store.getState().preset.presetsEditing.find((uuid) => uuid === existingPreset.uuid)
      ).toBeUndefined(); // not in edit mode
      expect(httpClient_preset.deletePresets).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when presetUuid is missing", async () => {
      const before = vi.mocked(httpClient_preset.deletePresets).mock.calls.length;
      await store.dispatch(thunkDeletePreset({ presetUuid: null }));
      expect(vi.mocked(httpClient_preset.deletePresets).mock.calls.length).toBe(before);
    });

    it("logs and does NOT remove from store when delete API fails", async () => {
      vi.mocked(httpClient_preset.deletePresets).mockResolvedValueOnce({
        status: "error",
        message: "vitest db error",
        data: null,
      });
      // Ensure a saved preset exists in both presets and presetsFromDb so the
      // DB-delete branch is taken (previous tests may have consumed them all).
      const savedPreset = generateBlankPreset({ name: "Vitest Saved Preset For Delete Fail" });
      store.dispatch(upsertPresets([savedPreset]));
      store.dispatch(upsertPresetsFromDb([savedPreset]));

      const beforeCount = store.getState().preset.presets.length;
      await store.dispatch(thunkDeletePreset({ presetUuid: savedPreset.uuid }));
      // since the delete API failed, the preset should still be in the store
      expect(
        store.getState().preset.presets.find((p) => p.uuid === savedPreset.uuid)
      ).toBeDefined();
      expect(
        store.getState().preset.presetsFromDb.find((p) => p.uuid === savedPreset.uuid)
      ).toBeDefined();
      expect(store.getState().preset.presets.length).toBe(beforeCount);
    });
  });

  describe("thunkCreatePreset", () => {
    it("adds a new preset and a new layer UI state entry", async () => {
      const numPresets = store.getState().preset.presets.length;
      const numPresetLayersUIStates = Object.keys(
        store.getState().preset.presetLayersUIStates
      ).length;
      await store.dispatch(thunkCreatePreset());

      expect(store.getState().preset.presets.length).toEqual(numPresets + 1);
      expect(Object.keys(store.getState().preset.presetLayersUIStates).length).toEqual(
        numPresetLayersUIStates + 1
      );
    });

    it("populates layerOrder, circle controls, and UI states when layers and circleDefinitions exist", async () => {
      const layer = generateBlankLayer({ name: "Vitest Test Layer" });
      const sublayer = generateBlankSublayer({
        name: "Vitest Test Sublayer",
        layerUuid: layer.uuid,
      });

      const preset = generateBlankPreset({
        name: "Vitest Base Preset",
        missionDefault: true,
        mapSublayerControls: {
          [sublayer.uuid]: {
            name: sublayer.name,
            sublayerUuid: sublayer.uuid,
            visible: true,
            style: null,
          },
        },
      });

      const presetLayersUIStates = { [preset.uuid]: {} };
      const presetCirclesUIStates = { [preset.uuid]: {} };

      const storeWithLayers = createCustomTestStore({
        mission: {
          ...missionInitialState,
          layers: [layer],
          sublayers: [sublayer],
        },
        preset: {
          ...presetInitialState,
          presets: [preset],
          presetsFromDb: [preset],
          presetLayersUIStates,
          presetCirclesUIStates,
        },
      });

      // Also add a circleDefinition to the Automerge mission doc so the
      // circle-control branches are exercised.
      const circleUuid = "circle-create-test";
      getMissionDocHandle().change((m) => {
        // generateBlankMission always initialises circleDefinitions to {}, so
        // the ?? {} branch is dead. The self-assignment of an existing proxy
        // throws "cannot create a reference to an existing document object".
        m.circleDefinitions[circleUuid] = {
          uuid: circleUuid,
          name: "Vitest Create Test Circle",
          radius: 75,
          color: "#0000ff",
          weight: 2,
        } as unknown as CircleDefinition;
      });

      const numPresets = storeWithLayers.getState().preset.presets.length;
      await storeWithLayers.dispatch(thunkCreatePreset());

      // A new preset should have been added.
      expect(storeWithLayers.getState().preset.presets.length).toBe(numPresets + 1);

      // Find the newly created preset.
      const newPreset = storeWithLayers
        .getState()
        .preset.presets.find((p) => p.uuid !== preset.uuid);
      expect(newPreset).toBeDefined();

      // The layer-order loop should have produced an entry for our layer.
      expect(newPreset.layerOrder?.some((o) => o.layerUuid === layer.uuid)).toBe(true);
      const layerOrder = newPreset.layerOrder?.find((o) => o.layerUuid === layer.uuid);
      expect(layerOrder?.sublayerUuids).toContain(sublayer.uuid);

      // The circle-controls branch should have produced an entry for the circle.
      expect(newPreset.mapCircleControls?.[circleUuid]).toBeDefined();
      expect(newPreset.mapCircleControls?.[circleUuid].uuid).toBe(circleUuid);

      // The presetLayersUIStates for the new preset should include entries for
      // both the layer and the sublayer.
      const newPresetLayerUIStates =
        storeWithLayers.getState().preset.presetLayersUIStates[newPreset.uuid];
      expect(newPresetLayerUIStates).toBeDefined();
      expect(newPresetLayerUIStates[layer.uuid]).toBeDefined();
      expect(newPresetLayerUIStates[layer.uuid].type).toBe("layer");
      expect(newPresetLayerUIStates[sublayer.uuid]).toBeDefined();
      expect(newPresetLayerUIStates[sublayer.uuid].type).toBe("sublayer");

      // The presetCirclesUIStates for the new preset should include
      // the circle that was defined in the Automerge doc.
      const newPresetCircleUIStates =
        storeWithLayers.getState().preset.presetCirclesUIStates[newPreset.uuid];
      expect(newPresetCircleUIStates).toBeDefined();
      expect(newPresetCircleUIStates[circleUuid]).toBeDefined();
      expect(newPresetCircleUIStates[circleUuid].slidersSelected).toBe(false);

      // Clean up the circle added to the shared Automerge doc so later tests
      // are not affected.
      getMissionDocHandle().change((m) => {
        delete m.circleDefinitions[circleUuid];
      });
    });
  });

  describe("thunkDuplicatePreset", () => {
    it("adds a copy of the preset with 'copy' in the name", async () => {
      await store.dispatch(thunkCreatePreset());
      const presetToDuplicate = store.getState().preset.presets[0];
      const numPresets = store.getState().preset.presets.length;

      await store.dispatch(thunkDuplicatePreset({ presetUuid: presetToDuplicate.uuid }));
      expect(store.getState().preset.presets.length).toEqual(numPresets + 1);
      expect(
        store
          .getState()
          .preset.presets.map((p) => p.name)
          .find((name) => name.includes("copy"))
      ).toBeTruthy(); // there's a copy
    });

    it("is a no-op when presetUuid is missing", async () => {
      const before = store.getState().preset.presets.length;
      await store.dispatch(thunkDuplicatePreset({ presetUuid: null }));
      expect(store.getState().preset.presets.length).toBe(before);
    });

    it("throws when the upsert API returns a non-success status", async () => {
      vi.mocked(httpClient_preset.upsertPresets).mockResolvedValueOnce({
        status: "error",
        message: "vitest duplicate db error",
        data: null,
      });
      const preset = store.getState().preset.presets[0];
      const result = await store.dispatch(thunkDuplicatePreset({ presetUuid: preset.uuid }));
      expect(result.meta.requestStatus).toBe("rejected");
      expect((result as { error?: { message?: string } }).error?.message).toMatch(
        /Error upserting Presets/
      );
    });
  });

  describe("thunkSyncPresetsWithMission", () => {
    it("adds new circle UI states / map circle controls for newly-defined circles", async () => {
      // Ensure at least one preset exists in the store (with a presetsFromDb counterpart)
      const presetsBefore = store.getState().preset.presets;
      if (presetsBefore.length === 0) {
        const seedPreset = generateBlankPreset({ name: "Vitest Sync Seed Preset" });
        store.dispatch(upsertPresets([seedPreset]));
        store.dispatch(upsertPresetsFromDb([seedPreset]));
      }
      expect(store.getState().preset.presets.length).toBeGreaterThan(0);

      // Inject a circle definition into the mission doc.
      const circleUuid = "circle-1";
      const { getMissionDocHandle } = await import("client/automergeDocHandles");
      getMissionDocHandle().change((m) => {
        // generateBlankMission always initialises circleDefinitions to {}, so
        // the ?? {} branch is dead. The self-assignment of an existing proxy
        // throws "cannot create a reference to an existing document object".
        m.circleDefinitions[circleUuid] = {
          uuid: circleUuid,
          name: "Vitest New Circle",
          radius: 100,
          color: "#ff0000",
          weight: 1,
        } as unknown as CircleDefinition;
      });

      await store.dispatch(thunkSyncPresetsWithMission());

      // After sync, every preset's circleUIStates should have an entry for the new circle.
      for (const presetUuid of Object.keys(store.getState().preset.presetCirclesUIStates)) {
        expect(
          store.getState().preset.presetCirclesUIStates[presetUuid]?.[circleUuid]
        ).toBeDefined();
      }
      // And every preset should have a mapCircleControls entry for the new circle.
      for (const preset of store.getState().preset.presets) {
        expect(preset.mapCircleControls?.[circleUuid]).toBeDefined();
      }
      for (const dbPreset of store.getState().preset.presetsFromDb) {
        expect(dbPreset.mapCircleControls?.[circleUuid]).toBeDefined();
      }
    });

    it("removes circle UI states / map circle controls for deleted circles", async () => {
      // Ensure at least one preset exists in the store (with a presetsFromDb counterpart)
      if (store.getState().preset.presets.length === 0) {
        const seedPreset = generateBlankPreset({ name: "Vitest Sync Seed Preset" });
        store.dispatch(upsertPresets([seedPreset]));
        store.dispatch(upsertPresetsFromDb([seedPreset]));
      }
      expect(store.getState().preset.presets.length).toBeGreaterThan(0);

      // First, add a circle definition and sync.
      const circleUuid = "circle-stale";
      const { getMissionDocHandle } = await import("client/automergeDocHandles");
      getMissionDocHandle().change((m) => {
        // generateBlankMission always initialises circleDefinitions to {}, so
        // the ?? {} branch is dead. The self-assignment of an existing proxy
        // throws "cannot create a reference to an existing document object".
        m.circleDefinitions[circleUuid] = {
          uuid: circleUuid,
          name: "Vitest Stale Circle",
          radius: 50,
          color: "#00ff00",
          weight: 1,
        } as unknown as CircleDefinition;
      });
      await store.dispatch(thunkSyncPresetsWithMission());

      // Then delete it from the mission and sync again
      getMissionDocHandle().change((m) => {
        delete m.circleDefinitions[circleUuid];
      });
      await store.dispatch(thunkSyncPresetsWithMission());

      // The circle should be gone from every preset's controls and UI states.
      for (const presetUuid of Object.keys(store.getState().preset.presetCirclesUIStates)) {
        expect(
          store.getState().preset.presetCirclesUIStates[presetUuid]?.[circleUuid]
        ).toBeUndefined();
      }
      for (const preset of store.getState().preset.presets) {
        expect(preset.mapCircleControls?.[circleUuid]).toBeUndefined();
      }
      for (const dbPreset of store.getState().preset.presetsFromDb) {
        expect(dbPreset.mapCircleControls?.[circleUuid]).toBeUndefined();
      }
    });

    it("throws when the upsert API fails", async () => {
      vi.mocked(httpClient_preset.upsertPresets).mockResolvedValueOnce({
        status: "error",
        message: "vitest sync failed",
        data: null,
      });
      const result = await store.dispatch(thunkSyncPresetsWithMission());
      expect(result.meta.requestStatus).toBe("rejected");
      expect((result as { error?: { message?: string } }).error?.message).toMatch(
        /Error syncing presets/
      );
    });

    it("handles presets with undefined presetCirclesUIStates and mapCircleControls", async () => {
      // Create a preset that has NO mapCircleControls and whose circlesUIStates
      // entry is absent.  This exercises the `|| {}` fallback branches on the
      // cloneDeep calls inside the sync loop.
      const barePreset = generateBlankPreset({
        name: "Vitest Bare Preset No Circles",
        missionDefault: false,
        mapCircleControls: undefined,
      });

      const bareStore = createCustomTestStore({
        mission: { ...missionInitialState },
        preset: {
          ...presetInitialState,
          presets: [barePreset],
          presetsFromDb: [barePreset],
          // intentionally omit the circlesUIStates entry for barePreset
          presetLayersUIStates: {},
          presetCirclesUIStates: {},
        },
      });

      // Add a circle so the forEach branches inside the sync are reached.
      const syncCircleUuid = "circle-sync-fallback";
      getMissionDocHandle().change((m) => {
        // generateBlankMission always initialises circleDefinitions to {}, so
        // the ?? {} branch is dead. The self-assignment of an existing proxy
        // throws "cannot create a reference to an existing document object".
        m.circleDefinitions[syncCircleUuid] = {
          uuid: syncCircleUuid,
          name: "Vitest Sync Fallback Circle",
          radius: 30,
          color: "#aabbcc",
          weight: 1,
        } as unknown as CircleDefinition;
      });

      const result = await bareStore.dispatch(thunkSyncPresetsWithMission());
      expect(result.meta.requestStatus).toBe("fulfilled");

      // The new circle should now be present in the preset's mapCircleControls.
      const syncedPreset = bareStore
        .getState()
        .preset.presets.find((p) => p.uuid === barePreset.uuid);
      expect(syncedPreset?.mapCircleControls?.[syncCircleUuid]).toBeDefined();

      // Clean up.
      getMissionDocHandle().change((m) => {
        delete m.circleDefinitions[syncCircleUuid];
      });
    });
  });
});
