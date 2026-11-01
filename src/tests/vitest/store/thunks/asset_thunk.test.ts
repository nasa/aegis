import { createCustomTestStore } from "tests/vitest/fixtures/store";
import { initialState as connectionInitialState } from "store/connection";
import { initialState as missionInitialState } from "store/mission";
import { initialState as userInitialState } from "store/user";
import type { StoreType } from "store";
import { updateAssetInEditValues } from "store/asset";
import {
  getMostRecentAsset,
  thunkCancelAssetEdit,
  thunkDeleteAsset,
  thunkMoveAssetToFolder,
  thunkEditAsset,
  thunkAddAsset,
  thunkJumpToAsset,
  thunkSaveAssetEdit,
  thunkSetAssetEditLocation,
} from "store/thunk/thunkAsset";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { generateBlankAsset } from "store/storeUtils/asset";
import { generateBlankFolder } from "store/storeUtils/folder";
import { generateBlankRex } from "store/storeUtils/rex";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

type ElevationResult = { meta: { requestStatus: string }; payload?: number };
const elevationCalls: { point: AEGISPoint; resolve: (r: ElevationResult) => void }[] = [];
vi.mock("store/thunk/thunkTerrainProfile", () => ({
  thunkFetchPointElevation:
    ({ point }: { point: AEGISPoint }) =>
    () =>
      new Promise<ElevationResult>((resolve) => elevationCalls.push({ point, resolve })),
}));

const connected: ConnectionState = {
  ...connectionInitialState,
  socketStatus: { ...connectionInitialState.socketStatus, connectionStatus: "connected" },
  automergeConnectionStatus: "connected",
};
const editor: UserState = {
  ...userInitialState,
  missionPerms: { permissions: { edit: true } } as Permission,
};
// Asset mutations require the global Edit toggle on.
const editMode = { ...missionInitialState, isInEditMode: true };

let store: StoreType;
const doc = (): Mission => getMissionDocHandle().doc();
const inEdit = () => store.getState().asset.inEdit;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => setMissionAutomergeDocHandle(null));

beforeEach(() => {
  elevationCalls.length = 0;
  getMissionDocHandle().change((m) => {
    m.assets = {};
    m.folders = {};
    m.rexes = {};
    m.evas = {};
    m.demFilePath = "dem.tif";
  });
  store = createCustomTestStore({ connection: connected, user: editor, mission: editMode });
});

describe("getMostRecentAsset", () => {
  it("picks the highest createdAt, with uuid as tie-breaker", () => {
    const a = generateBlankAsset({ uuid: "a", createdAt: 5 });
    const b = generateBlankAsset({ uuid: "b", createdAt: 5 });
    const c = generateBlankAsset({ uuid: "c", createdAt: 1 });
    expect(getMostRecentAsset([a, c, b])?.uuid).toBe("b");
    expect(getMostRecentAsset([])).toBeNull();
  });
});

describe("thunkAddAsset", () => {
  it("prefills name and emoji from the most recently created asset", async () => {
    const older = generateBlankAsset({ name: "Old", icon: "1F4A1", createdAt: 1 });
    const newer = generateBlankAsset({ name: "Tools", icon: "1F9F0", createdAt: 2 });
    getMissionDocHandle().change((m) => {
      m.assets[older.uuid] = older;
      m.assets[newer.uuid] = newer;
    });
    await store.dispatch(thunkAddAsset());
    expect(inEdit().values).toMatchObject({ name: "Tools", icon: "1F9F0", location: null });
    expect(inEdit().isNew).toBe(true);
    expect(store.getState().asset.selectedAssetUuid).toBe(inEdit().uuid);

    // A second Add Asset does not replace the open inEdit.
    const uuid = inEdit().uuid;
    await store.dispatch(thunkAddAsset());
    expect(inEdit().uuid).toBe(uuid);
  });

  it("starts blank with no emoji when the mission has no assets", async () => {
    await store.dispatch(thunkAddAsset());
    expect(inEdit().values).toMatchObject({ name: "", icon: null });
  });
});

describe("thunkSetAssetEditLocation", () => {
  it("resolves the running REX, not the selected one, and fetches elevation into the inEdit", async () => {
    const running = generateBlankRex({
      evaUuid: "eva-running",
      name: "Running",
      isRunning: true,
      petRunning: false,
      petValueAtStartStop: "+00:20:00",
    });
    const selected = generateBlankRex({ evaUuid: "eva-selected", name: "Selected" });
    getMissionDocHandle().change((m) => {
      m.rexes[running.uuid] = running;
      m.rexes[selected.uuid] = selected;
    });
    await store.dispatch(thunkAddAsset());
    const uuid = inEdit().uuid;
    const pending = store.dispatch(
      thunkSetAssetEditLocation({ uuid, location: { lat: 1, lng: 2 } })
    );
    await flush();
    expect(inEdit().elevationPending).toBe(true);
    expect(inEdit().values.placement).toMatchObject({
      runningRexUuid: running.uuid,
      petClock: { petValueAtStartStop: "+00:20:00", petRunning: false },
    });
    elevationCalls[0].resolve({ meta: { requestStatus: "fulfilled" }, payload: 42 });
    await pending;
    expect(inEdit().values.elevation).toBe(42);
    expect(inEdit().elevationPending).toBe(false);
    // Nothing is written before Save.
    expect(doc().assets[uuid]).toBeUndefined();
  });

  it("discards an elevation result superseded by a later location", async () => {
    await store.dispatch(thunkAddAsset());
    const uuid = inEdit().uuid;
    const first = store.dispatch(thunkSetAssetEditLocation({ uuid, location: { lat: 1, lng: 1 } }));
    const second = store.dispatch(
      thunkSetAssetEditLocation({ uuid, location: { lat: 5, lng: 5 } })
    );
    await flush();
    elevationCalls[0].resolve({ meta: { requestStatus: "fulfilled" }, payload: 1 });
    await first;
    expect(inEdit().values.elevation).toBeNull();
    expect(inEdit().elevationPending).toBe(true);
    elevationCalls[1].resolve({ meta: { requestStatus: "fulfilled" }, payload: 5 });
    await second;
    expect(inEdit().values).toMatchObject({ location: { lat: 5, lng: 5 }, elevation: 5 });
  });

  it("stores null elevation without fetching when the mission has no DEM", async () => {
    getMissionDocHandle().change((m) => {
      m.demFilePath = "";
    });
    await store.dispatch(thunkAddAsset());
    await store.dispatch(
      thunkSetAssetEditLocation({ uuid: inEdit().uuid, location: { lat: 1, lng: 1 } })
    );
    expect(elevationCalls).toHaveLength(0);
    expect(inEdit()).toMatchObject({ elevationPending: false, values: { elevation: null } });
  });

  it("records no REX context when more than one REX is running", async () => {
    const a = generateBlankRex({ evaUuid: "a", isRunning: true });
    const b = generateBlankRex({ evaUuid: "b", isRunning: true });
    getMissionDocHandle().change((m) => {
      m.rexes[a.uuid] = a;
      m.rexes[b.uuid] = b;
      m.demFilePath = "";
    });
    await store.dispatch(thunkAddAsset());
    await store.dispatch(
      thunkSetAssetEditLocation({ uuid: inEdit().uuid, location: { lat: 1, lng: 1 } })
    );
    expect(inEdit().values.placement.runningRexUuid).toBeNull();
  });
});

describe("thunkSaveAssetEdit", () => {
  it("saves an unplaced asset at the root in one change and keeps it selected", async () => {
    const folder = generateBlankFolder({ type: "asset" });
    getMissionDocHandle().change((m) => {
      m.folders[folder.uuid] = folder;
    });
    await store.dispatch(thunkAddAsset());
    store.dispatch(updateAssetInEditValues({ name: "  Drill  " }));
    const uuid = inEdit().uuid;
    const changeCalls = vi.mocked(getMissionDocHandle().change).mock.calls.length;

    expect(await store.dispatch(thunkSaveAssetEdit()).unwrap()).toBe(true);
    expect(vi.mocked(getMissionDocHandle().change).mock.calls.length).toBe(changeCalls + 1);
    expect(doc().assets[uuid]).toMatchObject({
      name: "Drill",
      icon: null,
      location: null,
      placement: null,
      visible: true,
    });
    expect(doc().folders[folder.uuid].items).toEqual([]);
    expect(inEdit()).toBeNull();
    expect(store.getState().asset.selectedAssetUuid).toBe(uuid);
  });

  it("throws on a blank name and keeps the inEdit", async () => {
    await store.dispatch(thunkAddAsset());
    await expect(store.dispatch(thunkSaveAssetEdit()).unwrap()).rejects.toThrow(/Name/);
    expect(inEdit()).not.toBeNull();
  });

  it("waits for a pending elevation and keeps the resolved placement on a delayed Save", async () => {
    await store.dispatch(thunkAddAsset());
    store.dispatch(updateAssetInEditValues({ name: "Drill" }));
    const uuid = inEdit().uuid;
    store.dispatch(thunkSetAssetEditLocation({ uuid, location: { lat: 1, lng: 1 } }));
    await flush();
    const placedAt = inEdit().values.placement.locationSetAt;
    const saving = store.dispatch(thunkSaveAssetEdit());
    await flush();
    expect(doc().assets[uuid]).toBeUndefined();
    elevationCalls[0].resolve({ meta: { requestStatus: "rejected" } });
    expect(await saving.unwrap()).toBe(true);
    expect(doc().assets[uuid]).toMatchObject({
      elevation: null,
      location: { lat: 1, lng: 1 },
      placement: { locationSetAt: placedAt },
    });
  });

  it("writes only metadata on a metadata-only edit, keeping placement", async () => {
    const asset = generateBlankAsset({
      name: "Drill",
      location: { lat: 1, lng: 1 },
      elevation: 3,
      placement: {
        locationSetAt: 7,
        runningRexUuid: "r",
        runningRexName: "R",
        runningEvaUuid: "e",
        runningEvaName: "E",
        petClock: null,
      },
    });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
    });
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetInEditValues({ notes: "by the boulder" }));
    expect(await store.dispatch(thunkSaveAssetEdit()).unwrap()).toBe(true);
    expect(store.getState().asset.expandedAssetUuid).toBeNull();
    expect(doc().assets[asset.uuid]).toMatchObject({
      notes: "by the boulder",
      elevation: 3,
      placement: { locationSetAt: 7 },
    });
  });

  it("writes only fields changed since the inEdit opened, keeping other fields as-is", async () => {
    const asset = generateBlankAsset({ name: "Drill" });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
    });
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetInEditValues({ notes: "mine" }));
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid].color = "#00ff00";
    });
    expect(await store.dispatch(thunkSaveAssetEdit()).unwrap()).toBe(true);
    expect(doc().assets[asset.uuid]).toMatchObject({ notes: "mine", color: "#00ff00" });
  });

  it("keeps the inEdit's value for a field also changed underneath it", async () => {
    const asset = generateBlankAsset({ name: "Drill" });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
    });
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetInEditValues({ name: "Mine" }));
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid].name = "Theirs";
    });
    expect(await store.dispatch(thunkSaveAssetEdit()).unwrap()).toBe(true);
    expect(doc().assets[asset.uuid].name).toBe("Mine");
    expect(inEdit()).toBeNull();
  });

  it("never recreates an asset deleted underneath the inEdit", async () => {
    const asset = generateBlankAsset({ name: "Drill" });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
    });
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetInEditValues({ name: "Renamed" }));
    getMissionDocHandle().change((m) => {
      delete m.assets[asset.uuid];
    });
    expect(await store.dispatch(thunkSaveAssetEdit()).unwrap()).toBe(false);
    expect(doc().assets[asset.uuid]).toBeUndefined();
    expect(inEdit()).toBeNull();
  });
});

describe("asset gestures and row actions", () => {
  it("a cancelled asset gesture never starts after the delayed directive start", async () => {
    vi.useFakeTimers();
    await store.dispatch(thunkAddAsset());
    await store.dispatch(
      thunkUpdateMapDirective({
        mapItemType: "asset",
        uuid: inEdit().uuid,
        mapAction: "createMarker",
      })
    );
    await store.dispatch(thunkCancelAssetEdit());
    vi.advanceTimersByTime(500);
    expect(store.getState().map.mapDirective).toBeNull();
    vi.useRealTimers();
  });

  it("delete clears selection, inEdit, and membership", async () => {
    const asset = generateBlankAsset({ name: "Drill" });
    const folder = generateBlankFolder({ type: "asset" });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
      m.folders[folder.uuid] = folder;
    });
    await store.dispatch(
      thunkMoveAssetToFolder({ assetUuid: asset.uuid, folderUuid: folder.uuid })
    );
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
    await store.dispatch(thunkDeleteAsset({ assetUuid: asset.uuid }));
    expect(doc().assets[asset.uuid]).toBeUndefined();
    expect(doc().folders[folder.uuid].items).toEqual([]);
    expect(store.getState().asset).toMatchObject({ inEdit: null, selectedAssetUuid: null });
  });

  it("jumpTo restores the widget, requests the Assets tab, and expands the folder", async () => {
    const other = generateBlankAsset({ name: "Other" });
    const asset = generateBlankAsset({ name: "Drill" });
    const folder = generateBlankFolder({ type: "asset", items: [asset.uuid] });
    getMissionDocHandle().change((m) => {
      m.assets[other.uuid] = other;
      m.assets[asset.uuid] = asset;
      m.folders[folder.uuid] = folder;
    });
    store = createCustomTestStore({
      connection: connected,
      user: editor,
      mission: editMode,
      interface: {
        ...store.getState().interface,
        rexMenuIsMinimized: true,
        foldersInterface: {
          [folder.uuid]: {
            uuid: folder.uuid,
            isOpen: false,
            editing: false,
            editingNameValue: null,
          },
        },
      },
    });
    await store.dispatch(thunkEditAsset({ assetUuid: other.uuid }));
    expect(store.getState().asset.expandedAssetUuid).toBe(other.uuid);
    await store.dispatch(thunkJumpToAsset({ assetUuid: asset.uuid }));
    const state = store.getState();
    expect(state.asset.inEdit).toBeNull();
    expect(state.asset.expandedAssetUuid).toBeNull();
    expect(state.interface.rexMenuIsMinimized).toBe(false);
    expect(state.asset.assetsTabRequestId).toBe(1);
    expect(state.interface.foldersInterface[folder.uuid].isOpen).toBe(true);
    expect(state.asset.selectedAssetUuid).toBe(asset.uuid);
    expect(state.interface.sectionSelectedLabel).toBe("preset");
  });
});
