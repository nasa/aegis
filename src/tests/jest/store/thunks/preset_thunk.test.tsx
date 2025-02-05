import { StoreType } from "store";
import { createFullTestStore } from "tests/jest/factories/makeTestStore";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the jest.mock
jest.mock("http-client/preset");
import * as httpClient_preset from "http-client/preset";
import {
  thunkCreatePreset,
  thunkDeletePreset,
  thunkDuplicatePreset,
  thunkPresetCancel,
  thunkSavePreset,
} from "store/thunk/thunkPreset";
import { setPresetEditMode, upsertPreset, upsertPresetByField } from "store/preset";
import { generateBlankPreset } from "store/storeUtils/preset";

let store: StoreType;

beforeAll(() => {
  store = createFullTestStore();
});

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Thunk Preset Tests", () => {
  it("thunkSavePreset", async () => {
    // put a preset in edit mode
    const presetCopy = store.getState().preset.presets[0];
    store.dispatch(setPresetEditMode({ presetUuid: presetCopy.uuid, editMode: true }));
    const newName = "Jest Test Preset Modified";

    await store.dispatch(thunkSavePreset({ preset: { ...presetCopy, name: newName } }));
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

  it("thunkPresetCancel", async () => {
    // modify a preset in the store and cancel
    const presetCopy = store.getState().preset.presets[0];
    const newName = "Jest Test Preset Modified";
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
    const newUnsavedPreset = generateBlankPreset({ name: "Jest Test Preset" });
    store.dispatch(upsertPreset(newUnsavedPreset));
    store.dispatch(setPresetEditMode({ presetUuid: newUnsavedPreset.uuid, editMode: true }));

    await store.dispatch(thunkPresetCancel({ presetUuid: newUnsavedPreset.uuid }));
    expect(
      store.getState().preset.presets.find((p) => p.uuid === newUnsavedPreset.uuid)
    ).toBeUndefined(); // preset not in store
    expect(
      store.getState().preset.presetsEditing.find((uuid) => uuid === newUnsavedPreset.uuid)
    ).toBeUndefined(); // not in edit mode
  });

  it("thunkDeletePreset", async () => {
    // add a new unsaved preset and delete
    const newUnsavedPreset = generateBlankPreset({ name: "Jest Test Preset" });
    store.dispatch(upsertPreset(newUnsavedPreset));
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
    ).toBeUndefined(); // not in cb store
    expect(
      store.getState().preset.presetsEditing.find((uuid) => uuid === existingPreset.uuid)
    ).toBeUndefined(); // not in edit mode
    expect(httpClient_preset.deletePresets).toHaveBeenCalledTimes(1);
  });

  it("thunkCreatePreset", async () => {
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

  it("thunkDuplicatePreset", async () => {
    await store.dispatch(thunkCreatePreset());
    const presetToDuplicate = store.getState().preset.presets[0];
    const numPresets = store.getState().preset.presets.length;

    await store.dispatch(thunkDuplicatePreset({ preset: presetToDuplicate }));
    expect(store.getState().preset.presets.length).toEqual(numPresets + 1);
    expect(
      store
        .getState()
        .preset.presets.map((p) => p.name)
        .find((name) => name.includes("copy"))
    ).toBeTruthy(); // there's a copy
  });
});
