import * as Automerge from "@automerge/automerge";
import Cookies from "js-cookie";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { createCustomTestStore } from "tests/vitest/fixtures/store";
import { generateBlankFolder } from "store/storeUtils/folder";
import { generateBlankAsset } from "store/storeUtils/asset";
import { thunkEditAsset } from "store/thunk/thunkAsset";
import { updateMapDirective } from "store/map";
import { initialState as userInitialState } from "store/user";
import { initialState as missionInitialState } from "store/mission";
import { getFolderInterface } from "store/interface";
import { thunkToggleFolderOpen, thunkToggleFolderVisible } from "store/thunk/thunkFolder";
import { applyRenameFolder } from "operations/apply/apply-mission-folder";

const cookieKey = "AEGIS_Folders_Interface";
const makeStore = (edit = true, isInEditMode = true) =>
  createCustomTestStore({
    user: {
      ...userInitialState,
      missionPerms: { permissions: { edit } } as Permission,
    },
    mission: { ...missionInitialState, isInEditMode },
  });

beforeEach(() => {
  setMissionAutomergeDocHandle(null);
  Cookies.remove(cookieKey);
});

afterEach(() => {
  Cookies.remove(cookieKey);
  vi.restoreAllMocks();
});

describe("shared folder visibility", () => {
  it.each([false, true])(
    "cancels asset positioning only when the folder contains the edited asset (%s)",
    async (containsAsset) => {
      const asset = generateBlankAsset();
      const folder = generateBlankFolder({
        type: "asset",
        items: containsAsset ? [asset.uuid] : [],
      });
      getMissionDocHandle().change((m) => {
        m.assets[asset.uuid] = asset;
        m.folders[folder.uuid] = folder;
      });
      const store = makeStore(true, false);
      await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
      const draft = store.getState().asset.inEdit;
      const directive: MapDirective = {
        mapItemType: "asset",
        uuid: asset.uuid,
        mapAction: "editMarker",
      };
      store.dispatch(updateMapDirective(directive));

      await store.dispatch(thunkToggleFolderVisible({ folderUuid: folder.uuid }));
      expect(store.getState().map.mapDirective).toEqual(containsAsset ? null : directive);
      expect(store.getState().asset.inEdit).toEqual(draft);
    }
  );

  it.each([false, true])(
    "gates asset folder visibility by edit permission (%s) with global Edit off",
    async (edit) => {
      const folder = generateBlankFolder({ type: "asset" });
      const handle = getMissionDocHandle();
      handle.change((m) => {
        m.folders[folder.uuid] = folder;
      });
      await makeStore(edit, false).dispatch(thunkToggleFolderVisible({ folderUuid: folder.uuid }));
      expect(handle.doc().folders[folder.uuid].visible).toBe(!edit);
    }
  );

  it.each(["poi", "station"] as const)(
    "toggles %s visibility in the doc, ignoring cookies",
    async (type) => {
      const folder = generateBlankFolder({ type });
      const handle = getMissionDocHandle();
      handle.change((m) => {
        m.folders[folder.uuid] = folder;
      });
      Cookies.set(cookieKey, JSON.stringify({ [folder.uuid]: { visible: false, isOpen: false } }));
      const cookieWrite = vi.spyOn(Cookies, "set");
      const store = makeStore();
      const localState = store.getState().interface;
      const before = Automerge.clone(handle.doc());

      await store.dispatch(thunkToggleFolderVisible({ folderUuid: folder.uuid })).unwrap();
      expect(handle.doc().folders[folder.uuid].visible).toBe(false);
      expect(Automerge.getChanges(before, handle.doc())).toHaveLength(1);
      expect(store.getState().interface).toBe(localState);
      expect(cookieWrite).not.toHaveBeenCalled();

      // A second user's concurrent rename must survive the visibility change.
      const peer = Automerge.change(Automerge.clone(before), (m) => {
        applyRenameFolder(m, { folderUuid: folder.uuid, name: "Renamed remotely" });
      });
      const merged = Automerge.merge(peer, handle.doc());
      expect(merged.folders[folder.uuid]).toMatchObject({
        visible: false,
        name: "Renamed remotely",
      });

      await store.dispatch(thunkToggleFolderVisible({ folderUuid: folder.uuid })).unwrap();
      expect(handle.doc().folders[folder.uuid].visible).toBe(true);
    }
  );

  it("does not change shared visibility without edit permission or Edit Mode", async () => {
    const folder = generateBlankFolder();
    const handle = getMissionDocHandle();
    handle.change((m) => {
      m.folders[folder.uuid] = folder;
    });
    const heads = Automerge.getHeads(handle.doc());
    await makeStore(false)
      .dispatch(thunkToggleFolderVisible({ folderUuid: folder.uuid }))
      .unwrap();
    expect(Automerge.getHeads(handle.doc())).toEqual(heads);
    await makeStore(true, false)
      .dispatch(thunkToggleFolderVisible({ folderUuid: folder.uuid }))
      .unwrap();
    expect(Automerge.getHeads(handle.doc())).toEqual(heads);
  });

  it("ignores deleted folders and folder types without map visibility controls", async () => {
    const handle = getMissionDocHandle();
    handle.change((m) => {
      for (const type of ["eva", "layer", "preset"] as const) {
        m.folders[type] = generateBlankFolder({ uuid: type, type });
      }
    });
    const heads = Automerge.getHeads(handle.doc());
    const store = makeStore();
    for (const folderUuid of ["deleted", "eva", "layer", "preset"]) {
      await store.dispatch(thunkToggleFolderVisible({ folderUuid })).unwrap();
    }
    expect(Automerge.getHeads(handle.doc())).toEqual(heads);
  });

  it("keeps expand/collapse local and drops legacy visibility when saving the folder cookie", async () => {
    const store = makeStore(false);
    const handle = getMissionDocHandle();
    const heads = Automerge.getHeads(handle.doc());
    Cookies.set(cookieKey, JSON.stringify({ folder: { visible: false, isOpen: true } }));
    await store.dispatch(thunkToggleFolderOpen({ folderUuid: "folder" })).unwrap();
    expect(JSON.parse(Cookies.get(cookieKey)).folder).toEqual({ isOpen: false });
    expect(getFolderInterface(store.getState().interface.foldersInterface, "folder").isOpen).toBe(
      false
    );
    expect(Automerge.getHeads(handle.doc())).toEqual(heads);
  });
});
