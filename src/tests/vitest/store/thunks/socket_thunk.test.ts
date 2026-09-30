import type { StoreType } from "store";
import { createTestStoreWithAutomergeMission } from "tests/vitest/fixtures/store";
import { thunkSocketsHandleDelete, thunkSocketsHandleUpsert } from "store/thunk/thunkSockets";
import cloneDeep from "lodash/cloneDeep";
import { setPresetEditMode, upsertPresets } from "store/preset";
import { setRuleEditingUuid, upsertSTMRules } from "store/stm";
import { setFolderInterfaceEditing, setFolders } from "store/interface";
import { generateBlankPreset } from "store/storeUtils/preset";
import { generateBlankStmRule } from "store/storeUtils/stm";
import { generateBlankFolder } from "store/storeUtils/folder";
import { v4 as uuidv4 } from "uuid";

let store: StoreType;

beforeAll(() => {
  store = createTestStoreWithAutomergeMission();
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});

/**
 * `thunkSocketsHandleUpsert` / `thunkSocketsHandleDelete` only handle the
 * DB entity types.
 */
describe("Thunk Socket Tests", () => {
  describe("thunkSocketsHandleUpsert", () => {
    it("preset — upserts new, updates existing, conflicts when in edit mode", async () => {
      const data = generateBlankPreset({ name: "Vitest Test Preset" });
      const storeUpsert: StoreUpsert = {
        socketId: null,
        missionId: null,
        type: "preset",
        data: [cloneDeep(data)],
        lastEditEvent: null,
      };

      //test new data
      let messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().preset.presets.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(store.getState().preset.presetsFromDb.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing data
      data.name = "Vitest Test Modified Name";
      storeUpsert.data = [cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().preset.presets.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().preset.presetsFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode -> conflict message + edit-mode cleared
      data.name = "Vitest Test In Edit Mode";
      storeUpsert.data = [cloneDeep(data)];
      store.dispatch(setPresetEditMode({ presetUuid: data.uuid, editMode: true }));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().preset.presets.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().preset.presetsFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().preset.presetsEditing.includes(data.uuid)).toBeFalsy();
      expect((messages as string[]).length).toEqual(1);
    });

    it("stmRule — upserts and clears editing if the rule being edited changes", async () => {
      const data = generateBlankStmRule({ stmUuid: uuidv4() });
      const storeUpsert: StoreUpsert = {
        socketId: null,
        missionId: null,
        type: "stmRule",
        data: [cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().stm.rules.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(store.getState().stm.rulesFromDb.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      // simulate user editing this rule, then another upsert arrives
      store.dispatch(setRuleEditingUuid(data.uuid));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().stm.ruleEditingUuid).toBeNull();
      expect((messages as string[]).length).toEqual(1);
    });

    it("folder — upserts new + merges existing, conflicts when editing", async () => {
      const folder1 = generateBlankFolder({ name: "Vitest Folder One", type: "station" });
      const folder2 = generateBlankFolder({ name: "Vitest Folder Two", type: "station" });
      const storeUpsert: StoreUpsert = {
        socketId: null,
        missionId: null,
        type: "folder",
        data: [cloneDeep(folder1)],
        lastEditEvent: null,
      };

      // initial folder upsert
      let messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().interface.folders.some((f) => f.uuid === folder1.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      // add a second folder
      storeUpsert.data = [cloneDeep(folder2)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().interface.folders.some((f) => f.uuid === folder2.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      // mark folder1 as being edited, then upsert arrives -> conflict
      store.dispatch(setFolderInterfaceEditing({ folderUuid: folder1.uuid, editing: true }));
      const folder1Renamed = { ...folder1, name: "Vitest Folder One Renamed" };
      storeUpsert.data = [folder1Renamed];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect((messages as string[]).length).toEqual(1);
      expect(
        store.getState().interface.foldersInterface.find((f) => f.uuid === folder1.uuid)?.editing
      ).toBeFalsy();
    });
  });

  describe("thunkSocketsHandleDelete", () => {
    it("preset — deletes, switches to default when selected, conflict on edit", async () => {
      const data = generateBlankPreset({ name: "Vitest Delete Preset" });
      const dataInEditMode = generateBlankPreset({ name: "Vitest Delete Preset Edit" });
      store.dispatch(upsertPresets([data, dataInEditMode]));
      store.dispatch(setPresetEditMode({ presetUuid: dataInEditMode.uuid, editMode: true }));
      const storeDelete: StoreDelete = {
        socketId: null,
        missionId: null,
        type: "preset",
        uuids: [data.uuid],
        lastEditEvent: null,
      };

      let messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete }))).payload;
      expect(store.getState().preset.presets.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(store.getState().preset.presetsFromDb.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(messages).toEqual([]);

      // delete the one in edit mode -> conflict message + edit-mode cleared
      storeDelete.uuids = [dataInEditMode.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete }))).payload;
      expect(
        store.getState().preset.presets.some((x) => x.uuid === dataInEditMode.uuid)
      ).toBeFalsy();
      expect(store.getState().preset.presetsEditing.includes(dataInEditMode.uuid)).toBeFalsy();
      expect((messages as string[]).length).toEqual(1);
    });

    it("stmRule — deletes and clears editing if the deleted rule was being edited", async () => {
      const rule = generateBlankStmRule({ stmUuid: uuidv4() });
      store.dispatch(upsertSTMRules([rule]));
      store.dispatch(setRuleEditingUuid(rule.uuid));

      const storeDelete: StoreDelete = {
        socketId: null,
        missionId: null,
        type: "stmRule",
        uuids: [rule.uuid],
        lastEditEvent: null,
      };

      const messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete }))).payload;
      expect(store.getState().stm.rules.some((r) => r.uuid === rule.uuid)).toBeFalsy();
      expect(store.getState().stm.ruleEditingUuid).toBeNull();
      expect((messages as string[]).length).toEqual(1);
    });

    it("folder — removes folder; emits conflict when deleted folder was being edited", async () => {
      const folderA = generateBlankFolder({ name: "Vitest Folder A", type: "station" });
      const folderB = generateBlankFolder({ name: "Vitest Folder B", type: "station" });
      store.dispatch(setFolders([folderA, folderB]));
      store.dispatch(setFolderInterfaceEditing({ folderUuid: folderB.uuid, editing: true }));

      const storeDelete: StoreDelete = {
        socketId: null,
        missionId: null,
        type: "folder",
        uuids: [folderA.uuid],
        lastEditEvent: null,
      };

      // delete a folder that was NOT being edited -> no message
      let messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete }))).payload;
      expect(store.getState().interface.folders.some((f) => f.uuid === folderA.uuid)).toBeFalsy();
      expect(messages).toEqual([]);

      // delete the one being edited -> conflict message + edit-mode cleared
      storeDelete.uuids = [folderB.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete }))).payload;
      expect(store.getState().interface.folders.some((f) => f.uuid === folderB.uuid)).toBeFalsy();
      expect(
        store.getState().interface.foldersInterface.find((f) => f.uuid === folderB.uuid)?.editing
      ).toBeFalsy();
      expect((messages as string[]).length).toEqual(1);
    });
  });
});
