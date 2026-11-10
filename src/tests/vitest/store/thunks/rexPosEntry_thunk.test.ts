import { createCustomTestStore } from "../../fixtures/store";
import { initialState as rexInitialState, updatePosEntryInEditValues } from "store/rex";
import { initialState as userInitialState } from "store/user";
import { updateMapDirective } from "store/map";
import type { StoreType } from "store";
import {
  thunkAddPosEntry,
  thunkCancelPosEntryEdit,
  thunkDeletePosEntry,
  thunkDocCreatePosType,
  thunkDocDeletePosType,
  thunkEditPosEntry,
  thunkSavePosEntryEdit,
  thunkSetPosEntryEditLocation,
  thunkStartPosEntryMapDirective,
} from "store/thunk/thunkRexPosEntry";
import { generateBlankPosEntry, generateBlankRex } from "store/storeUtils/rex";
import { generateBlankEVA } from "store/storeUtils/eva";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

type ElevationResult = { meta: { requestStatus: string }; payload?: number };
const elevationCalls: { point: AEGISPoint; resolve: (r: ElevationResult) => void }[] = [];
vi.mock("store/thunk/thunkTerrainProfile", () => ({
  thunkFetchPointElevation:
    ({ point }: { point: AEGISPoint }) =>
    () =>
      new Promise<ElevationResult>((resolve) => elevationCalls.push({ point, resolve })),
}));

const editor: UserState = {
  ...userInitialState,
  missionPerms: { permissions: { edit: true } } as Permission,
};
const getMission = (): Mission => getMissionDocHandle().doc();
let store: StoreType;
let rex: Rex;
const inEdit = () => store.getState().rex.posEntryInEdit;
const entries = () => getMission().rexes[rex.uuid].posEntries ?? [];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => setMissionAutomergeDocHandle(null));

beforeEach(() => {
  vi.clearAllMocks();
  elevationCalls.length = 0;
  const eva = generateBlankEVA({ name: "Vitest EVA" });
  rex = generateBlankRex({
    name: "Vitest Rex-1",
    evaUuid: eva.uuid,
    isRunning: true,
    petValueAtStartStop: "+00:20:00",
  });
  getMissionDocHandle().change((m) => {
    m.evas = { [eva.uuid]: eva };
    m.rexes = { [rex.uuid]: rex };
    m.demFilePath = "";
  });
  store = createCustomTestStore({
    user: editor,
    rex: { ...rexInitialState, selectedRexUuid: rex.uuid },
  });
});

function seedEntry(partial: Partial<PosEntry> = {}): PosEntry {
  const entry = generateBlankPosEntry({
    location: { lat: 1, lng: 1 },
    petSeconds: 60,
    posTypeUuids: [rex.posTypes[0].uuid],
    posSourceUuid: rex.posSources[0].uuid,
    ...partial,
  });
  getMissionDocHandle().change((m) => {
    const existing: PosEntry[] = JSON.parse(JSON.stringify(m.rexes[rex.uuid].posEntries ?? []));
    m.rexes[rex.uuid].posEntries = [...existing, entry];
  });
  return entry;
}

describe("Thunk Position Entry Tests", () => {
  describe("thunkAddPosEntry", () => {
    test("opens a draft at the REX's PET with Task as the default source", async () => {
      await store.dispatch(thunkAddPosEntry());

      const draft = inEdit();
      expect(draft.isNew).toBe(true);
      expect(draft.rexUuid).toBe(rex.uuid);
      expect(draft.values).toEqual({
        location: null,
        elevation: null,
        petSeconds: 1200,
        posTypeUuids: [],
        posSourceUuid: rex.posSources.find((s) => s.name === "Task").uuid,
        uncertaintyMeters: 0,
        color: null,
      });
      expect(store.getState().rex.selectedPosEntryUuid).toBe(draft.uuid);
      // Nothing is written until Save.
      expect(entries()).toEqual([]);
    });

    test("prefills types, source, radius, and color from the most recently created entry", async () => {
      seedEntry({ createdAt: 1, uncertaintyMeters: 3, color: "#00ff00" });
      const latest = seedEntry({
        createdAt: 2,
        posTypeUuids: [rex.posTypes[1].uuid, "deleted-type"],
        posSourceUuid: rex.posSources[2].uuid,
        uncertaintyMeters: 25,
        color: "#ff0000",
      });

      await store.dispatch(thunkAddPosEntry());

      expect(inEdit().values).toMatchObject({
        posTypeUuids: [rex.posTypes[1].uuid],
        posSourceUuid: latest.posSourceUuid,
        uncertaintyMeters: 25,
        color: "#ff0000",
      });
    });

    test("waits for Place on Map before starting draft placement", async () => {
      vi.useFakeTimers();
      try {
        await store.dispatch(thunkAddPosEntry());
        vi.advanceTimersByTime(250);
        expect(store.getState().map.mapDirective).toBeNull();

        await store.dispatch(thunkStartPosEntryMapDirective());
        vi.advanceTimersByTime(250);
        expect(store.getState().map.mapDirective).toEqual({
          mapItemType: "posEntry",
          uuid: inEdit().uuid,
          mapAction: "createMarker",
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("thunkSavePosEntryEdit", () => {
    test("creates the new entry in one change and keeps it selected", async () => {
      await store.dispatch(thunkAddPosEntry());
      const uuid = inEdit().uuid;
      store.dispatch(
        updatePosEntryInEditValues({
          posTypeUuids: [rex.posTypes[0].uuid],
          uncertaintyMeters: 12,
          color: "#123456",
        })
      );
      await store.dispatch(thunkSetPosEntryEditLocation({ uuid, location: { lat: 2, lng: 3 } }));
      const changeSpy = vi.spyOn(getMissionDocHandle(), "change");

      const saved = await store.dispatch(thunkSavePosEntryEdit()).unwrap();

      expect(saved).toBe(true);
      expect(changeSpy).toHaveBeenCalledTimes(1);
      changeSpy.mockRestore();
      expect(entries()).toHaveLength(1);
      expect(entries()[0]).toMatchObject({
        uuid,
        location: { lat: 2, lng: 3 },
        petSeconds: 1200,
        posTypeUuids: [rex.posTypes[0].uuid],
        uncertaintyMeters: 12,
        color: "#123456",
      });
      expect(inEdit()).toBeNull();
      expect(store.getState().rex.selectedPosEntryUuid).toBe(uuid);
    });

    test("rejects an unplaced draft or one without a pos type", async () => {
      await store.dispatch(thunkAddPosEntry());
      const uuid = inEdit().uuid;

      await expect(store.dispatch(thunkSavePosEntryEdit()).unwrap()).rejects.toThrow(
        "Select at least one position type"
      );
      store.dispatch(updatePosEntryInEditValues({ posTypeUuids: [rex.posTypes[0].uuid] }));
      await expect(store.dispatch(thunkSavePosEntryEdit()).unwrap()).rejects.toThrow(
        "Place the position"
      );
      await store.dispatch(thunkSetPosEntryEditLocation({ uuid, location: { lat: 1, lng: 1 } }));
      store.dispatch(updatePosEntryInEditValues({ petSeconds: null }));
      await expect(store.dispatch(thunkSavePosEntryEdit()).unwrap()).rejects.toThrow(
        "PET is required"
      );
      expect(entries()).toEqual([]);
      expect(inEdit()).not.toBeNull();
    });

    test("writes only the changed fields of an existing entry", async () => {
      const entry = seedEntry({ elevation: 7 });
      await store.dispatch(thunkEditPosEntry({ posEntryUuid: entry.uuid }));
      expect(store.getState().rex.expandedPosEntryUuid).toBe(entry.uuid);
      store.dispatch(updatePosEntryInEditValues({ uncertaintyMeters: 40, petSeconds: 90 }));

      await store.dispatch(thunkSavePosEntryEdit()).unwrap();

      expect(entries()[0]).toMatchObject({
        uuid: entry.uuid,
        location: entry.location,
        elevation: 7,
        petSeconds: 90,
        uncertaintyMeters: 40,
        posSourceUuid: entry.posSourceUuid,
      });
      expect(entries()[0].updatedAt).toBeGreaterThanOrEqual(entry.updatedAt);
      // The row stays expanded after saving.
      expect(store.getState().rex.expandedPosEntryUuid).toBe(entry.uuid);
    });

    test("moving an existing entry waits for its elevation", async () => {
      getMissionDocHandle().change((m) => {
        m.demFilePath = "dem.tif";
      });
      const entry = seedEntry({ elevation: 7 });
      await store.dispatch(thunkEditPosEntry({ posEntryUuid: entry.uuid }));
      const placing = store.dispatch(
        thunkSetPosEntryEditLocation({ uuid: entry.uuid, location: { lat: 5, lng: 6 } })
      );
      expect(inEdit().elevationPending).toBe(true);
      const saving = store.dispatch(thunkSavePosEntryEdit());
      await flush();
      expect(entries()[0].location).toEqual(entry.location);

      elevationCalls[0].resolve({ meta: { requestStatus: "fulfilled" }, payload: 25 });
      await placing;
      await saving;

      expect(entries()[0]).toMatchObject({ location: { lat: 5, lng: 6 }, elevation: 25 });
    });

    test("discards the session when the edited entry was deleted", async () => {
      const entry = seedEntry();
      await store.dispatch(thunkEditPosEntry({ posEntryUuid: entry.uuid }));
      getMissionDocHandle().change((m) => {
        m.rexes[rex.uuid].posEntries = [];
      });

      const saved = await store.dispatch(thunkSavePosEntryEdit()).unwrap();

      expect(saved).toBe(false);
      expect(inEdit()).toBeNull();
      expect(entries()).toEqual([]);
    });
  });

  describe("thunkCancelPosEntryEdit", () => {
    test("discards the draft and ends its map directive without touching the doc", async () => {
      const entry = seedEntry();
      await store.dispatch(thunkEditPosEntry({ posEntryUuid: entry.uuid }));
      store.dispatch(updatePosEntryInEditValues({ uncertaintyMeters: 99 }));
      store.dispatch(
        updateMapDirective({ mapItemType: "posEntry", uuid: entry.uuid, mapAction: "editMarker" })
      );

      await store.dispatch(thunkCancelPosEntryEdit());

      expect(inEdit()).toBeNull();
      expect(store.getState().map.mapDirective).toBeNull();
      expect(entries()[0].uncertaintyMeters).toBe(0);
    });
  });

  describe("thunkDeletePosEntry", () => {
    test("removes the entry and clears its selection, expansion, and edit session", async () => {
      const kept = seedEntry();
      const entry = seedEntry();
      await store.dispatch(thunkEditPosEntry({ posEntryUuid: entry.uuid }));

      await store.dispatch(thunkDeletePosEntry({ posEntryUuid: entry.uuid }));

      expect(entries().map((e) => e.uuid)).toEqual([kept.uuid]);
      expect(inEdit()).toBeNull();
      expect(store.getState().rex.selectedPosEntryUuid).toBeNull();
      expect(store.getState().rex.expandedPosEntryUuid).toBeNull();
    });

    test("does nothing without edit permission", async () => {
      const entry = seedEntry();
      store = createCustomTestStore({ rex: { ...rexInitialState, selectedRexUuid: rex.uuid } });

      await store.dispatch(thunkDeletePosEntry({ posEntryUuid: entry.uuid }));

      expect(entries()).toHaveLength(1);
    });
  });

  describe("thunkDocCreatePosType", () => {
    test("adds a new posType to the rex on automerge", async () => {
      const initialPosTypeCount = getMission().rexes[rex.uuid].posTypes.length;

      const result = await store.dispatch(thunkDocCreatePosType());
      expect(result.meta.requestStatus).toBe("fulfilled");

      const updatedRex = getMission().rexes[rex.uuid];
      expect(updatedRex.posTypes.length).toBe(initialPosTypeCount + 1);
      const newPosType = updatedRex.posTypes[updatedRex.posTypes.length - 1];
      expect(newPosType.abbr).toBe("1");
      expect(newPosType.name).toBe("EV1");
      expect(newPosType.icon).toBe("1f468-200d-1f680");
      expect(newPosType.pathColor).toBe("#ff0000");
      expect(newPosType.uuid).toBeTruthy();
    });

    test("initializes posTypes array if rex has none and adds the new posType", async () => {
      getMissionDocHandle().change((m) => {
        (m.rexes[rex.uuid] as Rex).posTypes = null;
      });

      const result = await store.dispatch(thunkDocCreatePosType());
      expect(result.meta.requestStatus).toBe("fulfilled");

      const updatedRex = getMission().rexes[rex.uuid];
      expect(updatedRex.posTypes).toHaveLength(1);
      expect(updatedRex.posTypes[0].name).toBe("EV1");
    });
  });

  describe("thunkDocDeletePosType", () => {
    it("deletes a posType when it is not in use", async () => {
      const posTypeUuid = rex.posTypes[0].uuid;
      const result = await store.dispatch(
        thunkDocDeletePosType({ rexUuid: rex.uuid, posTypeUuid })
      );
      expect(thunkDocDeletePosType.rejected.match(result)).toBe(false);
      expect(
        getMission().rexes[rex.uuid].posTypes.find((pt) => pt.uuid === posTypeUuid)
      ).toBeUndefined();
    });

    it("rejects when posType is used by a posEntry", async () => {
      const posTypeUuid = rex.posTypes[0].uuid;
      seedEntry({ posTypeUuids: [posTypeUuid] });
      const result = await store.dispatch(
        thunkDocDeletePosType({ rexUuid: rex.uuid, posTypeUuid })
      );
      expect(thunkDocDeletePosType.rejected.match(result)).toBe(true);
      expect(result.payload).toContain("Position Item Type");
      expect(getMission().rexes[rex.uuid].posTypes).toHaveLength(3); // generateBlankRex starts with 3
    });
  });
});
