import { createCustomTestStore } from "tests/vitest/fixtures/store";
import { initialState as connectionInitialState } from "store/connection";
import { initialState as missionInitialState } from "store/mission";
import { initialState as userInitialState } from "store/user";
import type { StoreType } from "store";
import { updateAssetDraftValues } from "store/asset";
import {
  thunkCancelAssetDraft,
  thunkDeleteAsset,
  thunkMoveAssetToFolder,
  thunkOpenAssetDraftForEdit,
  thunkOpenNewAssetDraft,
  thunkRevealAsset,
  thunkSaveAssetDraft,
  thunkSetAssetDraftLocation,
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
const draft = () => store.getState().asset.draft;

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

describe("thunkOpenNewAssetDraft", () => {
  it("prefills name and emoji from the most recently created asset", async () => {
    const older = generateBlankAsset({ name: "Old", icon: "1F4A1", createdAt: 1 });
    const newer = generateBlankAsset({ name: "Tools", icon: "1F9F0", createdAt: 2 });
    getMissionDocHandle().change((m) => {
      m.assets[older.uuid] = older;
      m.assets[newer.uuid] = newer;
    });
    await store.dispatch(thunkOpenNewAssetDraft());
    expect(draft().values).toMatchObject({ name: "Tools", icon: "1F9F0", location: null });
    expect(draft().isNew).toBe(true);
    expect(store.getState().asset.selectedAssetUuid).toBe(draft().uuid);

    // A second Add Asset does not replace the open draft.
    const uuid = draft().uuid;
    await store.dispatch(thunkOpenNewAssetDraft());
    expect(draft().uuid).toBe(uuid);
  });

  it("starts blank with no emoji when the mission has no assets", async () => {
    await store.dispatch(thunkOpenNewAssetDraft());
    expect(draft().values).toMatchObject({ name: "", icon: null });
  });
});

describe("thunkSetAssetDraftLocation", () => {
  it("captures the running REX, not the selected one, and fetches elevation into the draft", async () => {
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
    await store.dispatch(thunkOpenNewAssetDraft());
    const uuid = draft().uuid;
    const pending = store.dispatch(
      thunkSetAssetDraftLocation({ uuid, location: { lat: 1, lng: 2 } })
    );
    await flush();
    expect(draft().elevationPending).toBe(true);
    expect(draft().values.placement).toMatchObject({
      runningRexUuid: running.uuid,
      petClock: { petValueAtStartStop: "+00:20:00", petRunning: false },
    });
    elevationCalls[0].resolve({ meta: { requestStatus: "fulfilled" }, payload: 42 });
    await pending;
    expect(draft().values.elevation).toBe(42);
    expect(draft().elevationPending).toBe(false);
    // Nothing is written before Save.
    expect(doc().assets[uuid]).toBeUndefined();
  });

  it("discards an elevation result superseded by a later location", async () => {
    await store.dispatch(thunkOpenNewAssetDraft());
    const uuid = draft().uuid;
    const first = store.dispatch(
      thunkSetAssetDraftLocation({ uuid, location: { lat: 1, lng: 1 } })
    );
    const second = store.dispatch(
      thunkSetAssetDraftLocation({ uuid, location: { lat: 5, lng: 5 } })
    );
    await flush();
    elevationCalls[0].resolve({ meta: { requestStatus: "fulfilled" }, payload: 1 });
    await first;
    expect(draft().values.elevation).toBeNull();
    expect(draft().elevationPending).toBe(true);
    elevationCalls[1].resolve({ meta: { requestStatus: "fulfilled" }, payload: 5 });
    await second;
    expect(draft().values).toMatchObject({ location: { lat: 5, lng: 5 }, elevation: 5 });
  });

  it("stores null elevation without fetching when the mission has no DEM", async () => {
    getMissionDocHandle().change((m) => {
      m.demFilePath = "";
    });
    await store.dispatch(thunkOpenNewAssetDraft());
    await store.dispatch(
      thunkSetAssetDraftLocation({ uuid: draft().uuid, location: { lat: 1, lng: 1 } })
    );
    expect(elevationCalls).toHaveLength(0);
    expect(draft()).toMatchObject({ elevationPending: false, values: { elevation: null } });
  });

  it("records no REX context when more than one REX is running", async () => {
    const a = generateBlankRex({ evaUuid: "a", isRunning: true });
    const b = generateBlankRex({ evaUuid: "b", isRunning: true });
    getMissionDocHandle().change((m) => {
      m.rexes[a.uuid] = a;
      m.rexes[b.uuid] = b;
      m.demFilePath = "";
    });
    await store.dispatch(thunkOpenNewAssetDraft());
    await store.dispatch(
      thunkSetAssetDraftLocation({ uuid: draft().uuid, location: { lat: 1, lng: 1 } })
    );
    expect(draft().values.placement.runningRexUuid).toBeNull();
  });
});

describe("thunkSaveAssetDraft", () => {
  it("saves an unplaced asset at the root in one change and keeps it selected", async () => {
    const folder = generateBlankFolder({ type: "asset" });
    getMissionDocHandle().change((m) => {
      m.folders[folder.uuid] = folder;
    });
    await store.dispatch(thunkOpenNewAssetDraft());
    store.dispatch(updateAssetDraftValues({ name: "  Drill  " }));
    const uuid = draft().uuid;
    const changeCalls = vi.mocked(getMissionDocHandle().change).mock.calls.length;

    expect(await store.dispatch(thunkSaveAssetDraft()).unwrap()).toBe(true);
    expect(vi.mocked(getMissionDocHandle().change).mock.calls.length).toBe(changeCalls + 1);
    expect(doc().assets[uuid]).toMatchObject({
      name: "Drill",
      icon: null,
      location: null,
      placement: null,
      visible: true,
    });
    expect(doc().folders[folder.uuid].items).toEqual([]);
    expect(draft()).toBeNull();
    expect(store.getState().asset.selectedAssetUuid).toBe(uuid);
  });

  it("throws on a blank name and keeps the draft", async () => {
    await store.dispatch(thunkOpenNewAssetDraft());
    await expect(store.dispatch(thunkSaveAssetDraft()).unwrap()).rejects.toThrow(/Name/);
    expect(draft()).not.toBeNull();
  });

  it("waits for a pending elevation and keeps the captured placement on a delayed Save", async () => {
    await store.dispatch(thunkOpenNewAssetDraft());
    store.dispatch(updateAssetDraftValues({ name: "Drill" }));
    const uuid = draft().uuid;
    store.dispatch(thunkSetAssetDraftLocation({ uuid, location: { lat: 1, lng: 1 } }));
    await flush();
    const capturedAt = draft().values.placement.locationSetAt;
    const saving = store.dispatch(thunkSaveAssetDraft());
    await flush();
    expect(doc().assets[uuid]).toBeUndefined();
    elevationCalls[0].resolve({ meta: { requestStatus: "rejected" } });
    expect(await saving.unwrap()).toBe(true);
    expect(doc().assets[uuid]).toMatchObject({
      elevation: null,
      location: { lat: 1, lng: 1 },
      placement: { locationSetAt: capturedAt },
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
    await store.dispatch(thunkOpenAssetDraftForEdit({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetDraftValues({ notes: "by the boulder" }));
    expect(await store.dispatch(thunkSaveAssetDraft()).unwrap()).toBe(true);
    expect(store.getState().asset.expandedAssetUuid).toBeNull();
    expect(doc().assets[asset.uuid]).toMatchObject({
      notes: "by the boulder",
      elevation: 3,
      placement: { locationSetAt: 7 },
    });
  });

  it("writes only fields changed since the draft opened, keeping other fields as-is", async () => {
    const asset = generateBlankAsset({ name: "Drill" });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
    });
    await store.dispatch(thunkOpenAssetDraftForEdit({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetDraftValues({ notes: "mine" }));
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid].color = "#00ff00";
    });
    expect(await store.dispatch(thunkSaveAssetDraft()).unwrap()).toBe(true);
    expect(doc().assets[asset.uuid]).toMatchObject({ notes: "mine", color: "#00ff00" });
  });

  it("keeps the draft's value for a field also changed underneath it", async () => {
    const asset = generateBlankAsset({ name: "Drill" });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
    });
    await store.dispatch(thunkOpenAssetDraftForEdit({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetDraftValues({ name: "Mine" }));
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid].name = "Theirs";
    });
    expect(await store.dispatch(thunkSaveAssetDraft()).unwrap()).toBe(true);
    expect(doc().assets[asset.uuid].name).toBe("Mine");
    expect(draft()).toBeNull();
  });

  it("never recreates an asset deleted underneath the draft", async () => {
    const asset = generateBlankAsset({ name: "Drill" });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
    });
    await store.dispatch(thunkOpenAssetDraftForEdit({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetDraftValues({ name: "Renamed" }));
    getMissionDocHandle().change((m) => {
      delete m.assets[asset.uuid];
    });
    expect(await store.dispatch(thunkSaveAssetDraft()).unwrap()).toBe(false);
    expect(doc().assets[asset.uuid]).toBeUndefined();
    expect(draft()).toBeNull();
  });
});

describe("asset gestures and row actions", () => {
  it("a cancelled asset gesture never starts after the delayed directive start", async () => {
    vi.useFakeTimers();
    await store.dispatch(thunkOpenNewAssetDraft());
    await store.dispatch(
      thunkUpdateMapDirective({
        mapItemType: "asset",
        uuid: draft().uuid,
        mapAction: "createMarker",
      })
    );
    await store.dispatch(thunkCancelAssetDraft());
    vi.advanceTimersByTime(500);
    expect(store.getState().map.mapDirective).toBeNull();
    vi.useRealTimers();
  });

  it("delete clears selection, draft, and membership", async () => {
    const asset = generateBlankAsset({ name: "Drill" });
    const folder = generateBlankFolder({ type: "asset" });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
      m.folders[folder.uuid] = folder;
    });
    await store.dispatch(
      thunkMoveAssetToFolder({ assetUuid: asset.uuid, folderUuid: folder.uuid })
    );
    await store.dispatch(thunkOpenAssetDraftForEdit({ assetUuid: asset.uuid }));
    await store.dispatch(thunkDeleteAsset({ assetUuid: asset.uuid }));
    expect(doc().assets[asset.uuid]).toBeUndefined();
    expect(doc().folders[folder.uuid].items).toEqual([]);
    expect(store.getState().asset).toMatchObject({ draft: null, selectedAssetUuid: null });
  });

  it("reveal restores the widget, requests the Assets tab, and expands the folder", async () => {
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
    await store.dispatch(thunkOpenAssetDraftForEdit({ assetUuid: other.uuid }));
    expect(store.getState().asset.expandedAssetUuid).toBe(other.uuid);
    await store.dispatch(thunkRevealAsset({ assetUuid: asset.uuid }));
    const state = store.getState();
    expect(state.asset.draft).toBeNull();
    expect(state.asset.expandedAssetUuid).toBeNull();
    expect(state.interface.rexMenuIsMinimized).toBe(false);
    expect(state.asset.assetsTabRequestId).toBe(1);
    expect(state.interface.foldersInterface[folder.uuid].isOpen).toBe(true);
    expect(state.asset.selectedAssetUuid).toBe(asset.uuid);
    expect(state.interface.sectionSelectedLabel).toBe("preset");
  });
});
