import { createCustomTestStore } from "tests/vitest/fixtures/store";
import { initialState as connectionInitialState } from "store/connection";
import { initialState as userInitialState } from "store/user";
import type { StoreType } from "store";
import { setAssetInEditPet, updateAssetInEditValues } from "store/asset";
import { updateMapDirective } from "store/map";
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
  thunkToggleAssetVisible,
} from "store/thunk/thunkAsset";
import { thunkUpdateMapDirective } from "store/thunk/thunkMap";
import { generateBlankAsset } from "store/storeUtils/asset";
import { generateBlankFolder } from "store/storeUtils/folder";
import { generateBlankRex } from "store/storeUtils/rex";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import {
  ASSET_NAME_MAX_LENGTH,
  ASSET_NOTES_MAX_LENGTH,
  ASSET_RADIUS_MAX_METERS,
} from "utils/assets";

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
  store = createCustomTestStore({ connection: connected, user: editor });
});

describe("asset save boundaries", () => {
  const atLimits = {
    name: "名".repeat(ASSET_NAME_MAX_LENGTH),
    notes: `First line\n${"x".repeat(ASSET_NOTES_MAX_LENGTH - 11)}`,
    uncertaintyMeters: ASSET_RADIUS_MAX_METERS,
  };
  const invalidChanges: Partial<AssetEditValues>[] = [
    { name: "x".repeat(ASSET_NAME_MAX_LENGTH + 1) },
    { name: " \t\n " },
    { notes: "x".repeat(ASSET_NOTES_MAX_LENGTH + 1) },
    { uncertaintyMeters: ASSET_RADIUS_MAX_METERS + 0.01 },
    { uncertaintyMeters: -0.01 },
    { uncertaintyMeters: Infinity },
    { uncertaintyMeters: NaN },
  ];

  it("persists exact limits on creation and editing without losing multiline notes", async () => {
    await store.dispatch(thunkAddAsset());
    const uuid = inEdit().uuid;
    store.dispatch(updateAssetInEditValues({ ...atLimits, name: `  ${atLimits.name}  ` }));
    expect(await store.dispatch(thunkSaveAssetEdit()).unwrap()).toBe(true);
    expect(doc().assets[uuid]).toMatchObject(atLimits);
    await store.dispatch(thunkEditAsset({ assetUuid: uuid }));
    store.dispatch(updateAssetInEditValues({ name: "Short", notes: null, uncertaintyMeters: 0 }));
    await store.dispatch(thunkSaveAssetEdit()).unwrap();
    await store.dispatch(thunkEditAsset({ assetUuid: uuid }));
    store.dispatch(updateAssetInEditValues(atLimits));
    expect(await store.dispatch(thunkSaveAssetEdit()).unwrap()).toBe(true);
    expect(doc().assets[uuid]).toMatchObject(atLimits);
  });

  it.each(invalidChanges)(
    "rejects invalid creation values without writing (case %#)",
    async (changes) => {
      await store.dispatch(thunkAddAsset());
      store.dispatch(updateAssetInEditValues({ name: "Drill", ...changes }));
      await expect(store.dispatch(thunkSaveAssetEdit()).unwrap()).rejects.toThrow();
      expect(doc().assets).toEqual({});
      expect(inEdit()).not.toBeNull();
    }
  );

  it.each(invalidChanges)(
    "rejects invalid updates without changing the saved asset (case %#)",
    async (changes) => {
      const asset = generateBlankAsset({ name: "Drill", notes: "Keep me", uncertaintyMeters: 10 });
      getMissionDocHandle().change((m) => {
        m.assets[asset.uuid] = asset;
      });
      await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
      store.dispatch(updateAssetInEditValues(changes));
      await expect(store.dispatch(thunkSaveAssetEdit()).unwrap()).rejects.toThrow();
      expect(doc().assets[asset.uuid]).toEqual(asset);
    }
  );
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
  it("cancels an existing asset edit and its map directive before starting a new draft", async () => {
    const asset = generateBlankAsset({ name: "Drill", uncertaintyMeters: 7 });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
    });
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetInEditValues({ name: "Unsaved", uncertaintyMeters: 99 }));
    store.dispatch(
      updateMapDirective({ mapItemType: "asset", uuid: asset.uuid, mapAction: "createMarker" })
    );

    await store.dispatch(thunkAddAsset());

    expect(inEdit().isNew).toBe(true);
    expect(inEdit().uuid).not.toBe(asset.uuid);
    expect(inEdit().values).toMatchObject({ name: "", uncertaintyMeters: 7, location: null });
    expect(store.getState().asset.selectedAssetUuid).toBe(inEdit().uuid);
    expect(store.getState().asset.expandedAssetUuid).toBeNull();
    expect(store.getState().map.mapDirective).toBeNull();
    expect(doc().assets).toEqual({ [asset.uuid]: asset });
  });

  it("prefills radius and color from the most recently created asset", async () => {
    const older = generateBlankAsset({
      name: "Old",
      color: "#ff0000",
      uncertaintyMeters: 3,
      createdAt: 1,
    });
    const newer = generateBlankAsset({
      name: "Tools",
      icon: "1F9F0",
      color: "#00ff00",
      uncertaintyMeters: 7,
      createdAt: 2,
    });
    getMissionDocHandle().change((m) => {
      m.assets[older.uuid] = older;
      m.assets[newer.uuid] = newer;
    });
    await store.dispatch(thunkAddAsset());
    expect(inEdit().values).toMatchObject({
      name: "",
      icon: null,
      color: "#00ff00",
      uncertaintyMeters: 7,
      location: null,
    });
    expect(inEdit().isNew).toBe(true);
    expect(store.getState().asset.selectedAssetUuid).toBe(inEdit().uuid);

    // A second Add Asset does not replace the open inEdit.
    const uuid = inEdit().uuid;
    await store.dispatch(thunkAddAsset());
    expect(inEdit().uuid).toBe(uuid);
  });

  it("starts blank when the mission has no assets", async () => {
    await store.dispatch(thunkAddAsset());
    expect(inEdit().values).toMatchObject({
      name: "",
      icon: null,
      color: null,
      uncertaintyMeters: 0,
      petSeconds: null,
    });
  });

  it("captures PET when adding and preserves a manual value through placement and Save", async () => {
    const running = generateBlankRex({
      evaUuid: "eva",
      isRunning: true,
      petRunning: false,
      petValueAtStartStop: "+00:20:00",
    });
    getMissionDocHandle().change((m) => {
      m.rexes[running.uuid] = running;
      m.demFilePath = "";
    });
    await store.dispatch(thunkAddAsset());
    expect(inEdit().values.petSeconds).toBe(1200);
    expect(inEdit().values.rexUuid).toBe(running.uuid);
    const uuid = inEdit().uuid;
    store.dispatch(updateAssetInEditValues({ name: "Drill", petSeconds: -30 }));
    getMissionDocHandle().change((m) => {
      m.rexes[running.uuid].petValueAtStartStop = "+05:00:00";
    });
    await store.dispatch(thunkSetAssetEditLocation({ uuid, location: { lat: 1, lng: 2 } }));
    expect(inEdit().values.petSeconds).toBe(-30);
    expect(inEdit().values.rexUuid).toBeNull();
    expect(await store.dispatch(thunkSaveAssetEdit()).unwrap()).toBe(true);
    expect(doc().assets[uuid].petSeconds).toBe(-30);
    expect(doc().assets[uuid].rexUuid).toBeNull();
    expect(doc().rexes[running.uuid].petValueAtStartStop).toBe("+05:00:00");
  });

  it("discards a cancelled PET edit and saves a cleared value", async () => {
    const asset = generateBlankAsset({
      name: "Drill",
      petSeconds: 1200,
      rexUuid: "rex",
    });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
    });
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetInEditValues({ petSeconds: 0 }));
    await store.dispatch(thunkCancelAssetEdit());
    expect(inEdit()).toBeNull();
    expect(store.getState().asset.expandedAssetUuid).toBe(asset.uuid);
    expect(doc().assets[asset.uuid].petSeconds).toBe(1200);
    expect(doc().assets[asset.uuid].rexUuid).toEqual(asset.rexUuid);
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetInEditValues({ petSeconds: null }));
    expect(await store.dispatch(thunkSaveAssetEdit()).unwrap()).toBe(true);
    expect(doc().assets[asset.uuid].petSeconds).toBeNull();
    expect(doc().assets[asset.uuid].rexUuid).toBeNull();
  });
});

describe("thunkSetAssetEditLocation", () => {
  it("clears a draft position without waiting for an obsolete elevation fetch", async () => {
    await store.dispatch(thunkAddAsset());
    store.dispatch(updateAssetInEditValues({ name: "Drill" }));
    const uuid = inEdit().uuid;
    const pending = store.dispatch(
      thunkSetAssetEditLocation({ uuid, location: { lat: 1, lng: 2 } })
    );
    await flush();
    await store.dispatch(thunkSetAssetEditLocation({ uuid, location: null })).unwrap();
    expect(inEdit()).toMatchObject({
      elevationPending: false,
      values: { location: null, elevation: null },
    });
    expect(await store.dispatch(thunkSaveAssetEdit()).unwrap()).toBe(true);
    elevationCalls[0].resolve({ meta: { requestStatus: "fulfilled" }, payload: 25 });
    await pending.unwrap();
    expect(doc().assets[uuid]).toMatchObject({
      location: null,
      elevation: null,
    });
  });

  it("captures PET from the running REX, not the selected one, and fetches elevation", async () => {
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
    expect(inEdit().values.rexUuid).toBe(running.uuid);
    expect(inEdit().values.petSeconds).toBe(20 * 60);
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
    expect(inEdit().values.rexUuid).toBeNull();
  });
});

describe("existing asset draft", () => {
  const asset = generateBlankAsset({
    name: "Original",
    notes: "Original notes",
    petSeconds: 600,
    rexUuid: "original",
    location: { lat: 1, lng: 1 },
    elevation: 3,
  });
  beforeEach(async () => {
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
    });
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
  });

  it.each([false, true])(
    "stages all fields until Save and discards them on Cancel (save: %s)",
    async (save) => {
      store.dispatch(
        updateAssetInEditValues({
          name: "  Renamed  ",
          notes: "New notes",
          icon: "1f600",
          color: "#ff0000",
          uncertaintyMeters: 50,
          petSeconds: -30,
        })
      );
      const placing = store.dispatch(
        thunkSetAssetEditLocation({ uuid: asset.uuid, location: { lat: 2, lng: 3 } })
      );
      await flush();
      expect(doc().assets[asset.uuid]).toEqual(asset);
      const saving = save ? store.dispatch(thunkSaveAssetEdit()) : null;
      if (!save) await store.dispatch(thunkCancelAssetEdit());
      expect(doc().assets[asset.uuid]).toEqual(asset);
      const changesBefore = vi.mocked(getMissionDocHandle().change).mock.calls.length;
      elevationCalls[0].resolve({ meta: { requestStatus: "fulfilled" }, payload: 25 });
      await placing.unwrap();
      if (saving) {
        expect(await saving.unwrap()).toBe(true);
        expect(vi.mocked(getMissionDocHandle().change).mock.calls.length).toBe(changesBefore + 1);
        expect(doc().assets[asset.uuid]).toMatchObject({
          name: "Renamed",
          notes: "New notes",
          icon: "1f600",
          color: "#ff0000",
          uncertaintyMeters: 50,
          petSeconds: -30,
          rexUuid: null,
          location: { lat: 2, lng: 3 },
          elevation: 25,
        });
      } else {
        expect(doc().assets[asset.uuid]).toEqual(asset);
        expect(store.getState().asset.expandedAssetUuid).toBe(asset.uuid);
      }
      expect(inEdit()).toBeNull();
    }
  );

  it.each([false, true])(
    "stages clearing position, ignoring stale elevation (pending: %s)",
    async (fetching) => {
      const pending = fetching
        ? store.dispatch(
            thunkSetAssetEditLocation({ uuid: asset.uuid, location: { lat: 2, lng: 3 } })
          )
        : null;
      await flush();
      await store
        .dispatch(thunkSetAssetEditLocation({ uuid: asset.uuid, location: null }))
        .unwrap();
      if (pending) {
        elevationCalls[0].resolve({ meta: { requestStatus: "fulfilled" }, payload: 25 });
        await pending.unwrap();
      }
      expect(doc().assets[asset.uuid]).toEqual(asset);
      expect(inEdit()).toMatchObject({
        elevationPending: false,
        values: { location: null, elevation: null },
      });
      await store.dispatch(thunkSaveAssetEdit()).unwrap();
      expect(doc().assets[asset.uuid]).toMatchObject({
        location: null,
        elevation: null,
        notes: "Original notes",
      });
    }
  );
});

describe("thunkSaveAssetEdit", () => {
  it.each([false, true])(
    "saves captured PET with its REX and keeps details expanded (creating: %s)",
    async (creating) => {
      const asset = generateBlankAsset({
        name: "Drill",
        petSeconds: 600,
        rexUuid: "previous",
      });
      if (creating) {
        await store.dispatch(thunkAddAsset());
        store.dispatch(updateAssetInEditValues({ name: "Drill" }));
      } else {
        getMissionDocHandle().change((m) => {
          m.assets[asset.uuid] = asset;
        });
        await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
      }
      const uuid = inEdit().uuid;
      const pet = { petSeconds: 2700, rexUuid: "current" };
      store.dispatch(setAssetInEditPet(pet));
      expect(inEdit().values).toMatchObject(pet);
      expect(doc().assets[uuid]).toEqual(creating ? undefined : asset);
      expect(await store.dispatch(thunkSaveAssetEdit()).unwrap()).toBe(true);
      expect(doc().assets[uuid]).toMatchObject(pet);
      expect(inEdit()).toBeNull();
      expect(store.getState().asset.expandedAssetUuid).toBe(uuid);
    }
  );

  it.each([false, true])("uses the current PET on Save (next REX: %s)", async (nextRex) => {
    const asset = generateBlankAsset({
      name: "Drill",
      petSeconds: 600,
      rexUuid: "original",
    });
    const original = generateBlankRex({
      uuid: "original",
      name: "Original REX",
      evaUuid: "eva",
      isRunning: true,
      petRunning: false,
      petValueAtStartStop: "+00:10:00",
    });
    const next = generateBlankRex({
      evaUuid: "eva-next",
      name: "Next REX",
      petValueAtStartStop: "+00:45:00",
    });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
      m.rexes[original.uuid] = original;
      m.rexes[next.uuid] = next;
    });
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
    getMissionDocHandle().change((m) => {
      if (nextRex) {
        m.rexes[original.uuid].isRunning = false;
        m.rexes[next.uuid].isRunning = true;
      } else {
        m.rexes[original.uuid].petValueAtStartStop = "+00:45:00";
      }
    });
    expect(inEdit().values.petSeconds).toBe(600);
    expect(await store.dispatch(thunkSaveAssetEdit({ petUpdate: "current" })).unwrap()).toBe(true);
    expect(doc().assets[asset.uuid].petSeconds).toBe(2700);
    const source = nextRex ? next : original;
    expect(doc().assets[asset.uuid].rexUuid).toBe(source.uuid);
  });

  it("clears PET on Save during replanning without a running REX", async () => {
    const asset = generateBlankAsset({
      name: "Drill",
      petSeconds: 600,
      rexUuid: "rex",
    });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
    });
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
    expect(inEdit().values.petSeconds).toBe(600);
    expect(await store.dispatch(thunkSaveAssetEdit({ petUpdate: "clear" })).unwrap()).toBe(true);
    expect(doc().assets[asset.uuid].petSeconds).toBeNull();
    expect(doc().assets[asset.uuid].rexUuid).toBeNull();
  });

  it.each([0, 2])(
    "keeps the edit open when current PET is unavailable (%s running REXes)",
    async (count) => {
      const asset = generateBlankAsset({ name: "Drill", petSeconds: 600 });
      const rexes = Array.from({ length: count }, () =>
        generateBlankRex({ evaUuid: "eva", isRunning: true })
      );
      getMissionDocHandle().change((m) => {
        m.assets[asset.uuid] = asset;
        for (const rex of rexes) m.rexes[rex.uuid] = rex;
      });
      await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
      await expect(
        store.dispatch(thunkSaveAssetEdit({ petUpdate: "current" })).unwrap()
      ).rejects.toThrow("No running REX with a valid PET");
      expect(doc().assets[asset.uuid].petSeconds).toBe(600);
      expect(inEdit()).not.toBeNull();
    }
  );

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
      visible: true,
    });
    expect(doc().folders[folder.uuid].items).toEqual([]);
    expect(inEdit()).toBeNull();
    expect(store.getState().asset.selectedAssetUuid).toBe(uuid);
    expect(store.getState().asset.expandedAssetUuid).toBe(uuid);
  });

  it("throws on a blank name and keeps the inEdit", async () => {
    await store.dispatch(thunkAddAsset());
    await expect(store.dispatch(thunkSaveAssetEdit()).unwrap()).rejects.toThrow(/Name/);
    expect(inEdit()).not.toBeNull();
  });

  it("waits for a pending elevation on a delayed Save", async () => {
    await store.dispatch(thunkAddAsset());
    store.dispatch(updateAssetInEditValues({ name: "Drill" }));
    const uuid = inEdit().uuid;
    store.dispatch(thunkSetAssetEditLocation({ uuid, location: { lat: 1, lng: 1 } }));
    await flush();
    const saving = store.dispatch(thunkSaveAssetEdit());
    await flush();
    expect(doc().assets[uuid]).toBeUndefined();
    elevationCalls[0].resolve({ meta: { requestStatus: "rejected" } });
    expect(await saving.unwrap()).toBe(true);
    expect(doc().assets[uuid]).toMatchObject({
      elevation: null,
      location: { lat: 1, lng: 1 },
    });
  });

  it("writes only metadata on a metadata-only edit, keeping the position and elevation", async () => {
    const asset = generateBlankAsset({
      name: "Drill",
      location: { lat: 1, lng: 1 },
      elevation: 3,
    });
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
    });
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetInEditValues({ notes: "by the boulder" }));
    expect(await store.dispatch(thunkSaveAssetEdit()).unwrap()).toBe(true);
    expect(store.getState().asset.expandedAssetUuid).toBe(asset.uuid);
    expect(inEdit()).toBeNull();
    expect(doc().assets[asset.uuid]).toMatchObject({
      notes: "by the boulder",
      location: { lat: 1, lng: 1 },
      elevation: 3,
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

describe("asset map directives and row actions", () => {
  it("visibility changes cancel positioning for the edited asset and keep its draft", async () => {
    const asset = generateBlankAsset();
    const other = generateBlankAsset();
    getMissionDocHandle().change((m) => {
      m.assets[asset.uuid] = asset;
      m.assets[other.uuid] = other;
    });
    await store.dispatch(thunkEditAsset({ assetUuid: asset.uuid }));
    store.dispatch(updateAssetInEditValues({ name: "Unsaved" }));
    const directive: MapDirective = {
      mapItemType: "asset",
      uuid: asset.uuid,
      mapAction: "editMarker",
    };
    store.dispatch(updateMapDirective(directive));

    await store.dispatch(thunkToggleAssetVisible({ assetUuid: other.uuid }));
    expect(store.getState().map.mapDirective).toEqual(directive);

    await store.dispatch(thunkToggleAssetVisible({ assetUuid: asset.uuid }));
    expect(store.getState().map.mapDirective).toBeNull();
    expect(inEdit()?.values.name).toBe("Unsaved");
    expect(doc().assets[asset.uuid].name).toBe(asset.name);
  });

  it.each([false, true])(
    "gates visibility by edit permission (%s) with global Edit off",
    async (edit) => {
      const asset = generateBlankAsset();
      getMissionDocHandle().change((m) => {
        m.assets[asset.uuid] = asset;
      });
      store = createCustomTestStore({
        connection: connected,
        user: { ...editor, missionPerms: { permissions: { edit } } as Permission },
      });
      await store.dispatch(thunkToggleAssetVisible({ assetUuid: asset.uuid }));
      expect(doc().assets[asset.uuid].visible).toBe(!edit);
    }
  );

  it("a cancelled asset map directive never starts after the delayed directive start", async () => {
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
