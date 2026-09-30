import { createCustomTestStore } from "../../fixtures/store";
import { initialState as rexInitialState } from "store/rex";
import { initialState as mapInitialState } from "store/map";
import {
  thunkUICancelPosEntryInEdit,
  thunkDocCreatePosType,
  thunkDocDeletePosEntryByUuid,
  thunkDocDeletePosType,
  thunkDocSavePosEntryNoLocation,
  thunkDocUpdatePosEntryWithLocation,
} from "store/thunk/thunkRexPosEntry";
import { generateBlankPosEntry, generateBlankRex } from "store/storeUtils/rex";
import { generateBlankEVA } from "store/storeUtils/eva";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => true);

const getMission = (): Mission => getMissionDocHandle().doc();

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  // wipe automerge for a clean slate per test
  getMissionDocHandle().change((m) => {
    m.evas = {};
    m.rexes = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
  alertSpy.mockRestore();
});

describe("Thunk Position Entry Tests", () => {
  describe("thunkDocUpdatePosEntryWithLocation", () => {
    test("adds a new pos entry to the rex on automerge", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
      const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
      rex.posEntries = [posEntry];
      const posEntryInEdit = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });

      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({
        rex: {
          ...rexInitialState,
          selectedRexUuid: rex.uuid,
          posEntryInEdit: posEntryInEdit,
        },
      });

      const newLoc: AEGISPoint = { lat: 1, lng: 2 };
      await store.dispatch(
        thunkDocUpdatePosEntryWithLocation({ location: newLoc, posEntryUuid: posEntryInEdit.uuid })
      );

      const updatedRex = getMission().rexes[rex.uuid];
      expect(updatedRex.posEntries.length).toEqual(2);
      expect(updatedRex.posEntries.find((p) => p.uuid === posEntryInEdit.uuid).location).toEqual(
        newLoc
      );
      expect(updatedRex.updatedAt).not.toBeNull();
      // posEntryInEdit cleared in redux
      expect(store.getState().rex.posEntryInEdit.uuid).toBeNull();
      // newly created pos entry is auto-selected
      expect(store.getState().rex.selectedPosEntryUuid).toEqual(posEntryInEdit.uuid);
    });

    test("updates an existing pos entry's location on automerge", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
      const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
      rex.posEntries = [posEntry];

      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({
        rex: {
          ...rexInitialState,
          selectedRexUuid: rex.uuid,
          posEntryInEdit: posEntry,
        },
      });

      const newLoc: AEGISPoint = { lat: 1, lng: 2 };
      await store.dispatch(
        thunkDocUpdatePosEntryWithLocation({ location: newLoc, posEntryUuid: posEntry.uuid })
      );

      const updatedRex = getMission().rexes[rex.uuid];
      expect(updatedRex.posEntries[0].location).toEqual(newLoc);
      expect(updatedRex.updatedAt).not.toBeNull();
      expect(store.getState().rex.posEntryInEdit.uuid).toBeNull();
      // editing an existing entry does not change the selected pos entry
      expect(store.getState().rex.selectedPosEntryUuid).toBeNull();
    });

    test("rejects when posEntryUuid does not match posEntryInEdit", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
      const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
      const otherPosEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
      rex.posEntries = [posEntry];

      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({
        rex: {
          ...rexInitialState,
          selectedRexUuid: rex.uuid,
          // posEntryInEdit is posEntry but we dispatch with otherPosEntry's uuid
          posEntryInEdit: posEntry,
        },
      });

      const newLoc: AEGISPoint = { lat: 5, lng: 10 };
      const result = await store.dispatch(
        thunkDocUpdatePosEntryWithLocation({ location: newLoc, posEntryUuid: otherPosEntry.uuid })
      );

      expect(result.meta.requestStatus).toBe("rejected");
      // automerge should be unchanged
      expect(getMission().rexes[rex.uuid].posEntries.length).toBe(1);
      expect(getMission().rexes[rex.uuid].posEntries[0].uuid).toBe(posEntry.uuid);
      expect(getMission().rexes[rex.uuid].posEntries[0].location).not.toEqual(newLoc);
    });
  });

  describe("thunkDocSavePosEntryNoLocation", () => {
    test("rejects when there is no posEntryInEdit", async () => {
      const store = createCustomTestStore({
        rex: {
          ...rexInitialState,
          posEntryInEdit: null,
        },
      });

      const result = await store.dispatch(thunkDocSavePosEntryNoLocation());
      expect(result.meta.requestStatus).toBe("rejected");
    });

    test("saves the posEntryInEdit to automerge and clears redux state", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
      const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
      rex.posEntries = [posEntry];

      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      // Modify the posEntry in redux (simulating user editing fields)
      const editedPosEntry = { ...posEntry, posSourceUuid: rex.posSources[0].uuid };

      const store = createCustomTestStore({
        rex: {
          ...rexInitialState,
          selectedRexUuid: rex.uuid,
          posEntryInEdit: editedPosEntry,
        },
      });

      const result = await store.dispatch(thunkDocSavePosEntryNoLocation());
      expect(result.meta.requestStatus).toBe("fulfilled");

      const updatedRex = getMission().rexes[rex.uuid];
      expect(updatedRex.posEntries[0].posSourceUuid).toBe(editedPosEntry.posSourceUuid);
      expect(updatedRex.updatedAt).not.toBeNull();
      // posEntryInEdit cleared in redux
      expect(store.getState().rex.posEntryInEdit.uuid).toBeNull();
    });

    test("rejects when posEntryInEdit is not found in automerge", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
      // No posEntries on rex in automerge
      rex.posEntries = [];

      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      // posEntryInEdit refers to a posEntry that doesn't exist in automerge
      const missingPosEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });

      const store = createCustomTestStore({
        rex: {
          ...rexInitialState,
          selectedRexUuid: rex.uuid,
          posEntryInEdit: missingPosEntry,
        },
      });

      const result = await store.dispatch(thunkDocSavePosEntryNoLocation());
      expect(result.meta.requestStatus).toBe("rejected");
    });
  });

  describe("thunkUICancelPosEntryInEdit", () => {
    test("clears edit state and cancels any active map edit", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
      const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
      const posEntryModified = { ...posEntry, location: { lat: 1, lng: 2 } };
      rex.posEntries = [posEntry];

      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({
        rex: {
          ...rexInitialState,
          selectedRexUuid: rex.uuid,
          posEntryInEdit: posEntryModified,
        },
        map: {
          ...mapInitialState,
          mapDirective: {
            mapItemType: "posEntry",
            uuid: posEntryModified.uuid,
            mapAction: "editMarker",
          },
        },
      });

      await store.dispatch(thunkUICancelPosEntryInEdit());
      expect(store.getState().rex.posEntryInEdit.uuid).toBeNull();
      expect(store.getState().map.mapDirective).toEqual({
        mapItemType: "posEntry",
        uuid: posEntryModified.uuid,
        mapAction: "cancelEditMarker",
      });
      expect(getMission().rexes[rex.uuid].posEntries[0].location).toEqual(posEntry.location);
    });

    test("clears edit state without dispatching cancelEditMarker when mapDirective uuid does not match", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
      const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
      const otherPosEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
      rex.posEntries = [posEntry];

      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({
        rex: {
          ...rexInitialState,
          selectedRexUuid: rex.uuid,
          posEntryInEdit: posEntry,
        },
        map: {
          ...mapInitialState,
          // mapDirective uuid refers to a DIFFERENT pos entry — should not trigger cancelEditMarker
          mapDirective: {
            mapItemType: "posEntry",
            uuid: otherPosEntry.uuid,
            mapAction: "editMarker",
          },
        },
      });

      await store.dispatch(thunkUICancelPosEntryInEdit());

      // posEntryInEdit should be cleared
      expect(store.getState().rex.posEntryInEdit.uuid).toBeNull();
      // mapDirective should remain unchanged (uuid still points to otherPosEntry)
      expect(store.getState().map.mapDirective?.uuid).toBe(otherPosEntry.uuid);
      expect(store.getState().map.mapDirective?.mapAction).toBe("editMarker");
    });

    test("clears edit state when mapDirective is null", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
      const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
      rex.posEntries = [posEntry];

      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({
        rex: {
          ...rexInitialState,
          selectedRexUuid: rex.uuid,
          posEntryInEdit: posEntry,
        },
        map: {
          ...mapInitialState,
          mapDirective: null,
        },
      });

      await store.dispatch(thunkUICancelPosEntryInEdit());
      expect(store.getState().rex.posEntryInEdit.uuid).toBeNull();
      expect(store.getState().map.mapDirective).toBeNull();
    });
  });

  describe("thunkDocDeletePosEntryByUuid", () => {
    test("removes the pos entry from the rex on automerge", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
      const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
      rex.posEntries = [posEntry];

      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({
        rex: {
          ...rexInitialState,
          selectedRexUuid: rex.uuid,
        },
      });

      await store.dispatch(thunkDocDeletePosEntryByUuid({ posEntryUuid: posEntry.uuid }));

      expect(getMission().rexes[rex.uuid].posEntries).toEqual([]);
    });
  });

  describe("thunkDocCreatePosType", () => {
    test("adds a new posType to the rex on automerge", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });

      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({
        rex: {
          ...rexInitialState,
          selectedRexUuid: rex.uuid,
        },
      });

      const initialPosTypeCount = getMission().rexes[rex.uuid].posTypes.length;

      const result = await store.dispatch(thunkDocCreatePosType());
      expect(result.meta.requestStatus).toBe("fulfilled");

      const updatedRex = getMission().rexes[rex.uuid];
      expect(updatedRex.posTypes.length).toBe(initialPosTypeCount + 1);

      // Verify the newly added posType has the expected default shape
      const newPosType = updatedRex.posTypes[updatedRex.posTypes.length - 1];
      expect(newPosType.abbr).toBe("1");
      expect(newPosType.name).toBe("EV1");
      expect(newPosType.icon).toBe("1f468-200d-1f680");
      expect(newPosType.pathColor).toBe("#ff0000");
      expect(newPosType.uuid).toBeTruthy();
      expect(updatedRex.updatedAt).not.toBeNull();
    });

    test("initializes posTypes array if rex has none and adds the new posType", async () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
      // Force posTypes to null to exercise the initialization branch
      (rex as Rex).posTypes = null;

      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({
        rex: {
          ...rexInitialState,
          selectedRexUuid: rex.uuid,
        },
      });

      const result = await store.dispatch(thunkDocCreatePosType());
      expect(result.meta.requestStatus).toBe("fulfilled");

      const updatedRex = getMission().rexes[rex.uuid];
      expect(Array.isArray(updatedRex.posTypes)).toBe(true);
      expect(updatedRex.posTypes.length).toBe(1);
      expect(updatedRex.posTypes[0].name).toBe("EV1");
    });
  });

  describe("thunkDocDeletePosType", () => {
    const makeRexWithPosType = () => {
      const eva = generateBlankEVA({ name: "Vitest EVA" });
      const rex = generateBlankRex({ name: "Vitest Rex", evaUuid: eva.uuid });
      const posTypeUuid = rex.posTypes[0].uuid;
      rex.posEntries = [];
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });
      return { rexUuid: rex.uuid, posTypeUuid };
    };

    it("deletes a posType when it is not in use", async () => {
      const { rexUuid, posTypeUuid } = makeRexWithPosType();
      const store = createCustomTestStore({});
      const result = await store.dispatch(thunkDocDeletePosType({ rexUuid, posTypeUuid }));
      expect(thunkDocDeletePosType.rejected.match(result)).toBe(false);
      const rex = getMission().rexes[rexUuid];
      expect(rex.posTypes.find((pt) => pt.uuid === posTypeUuid)).toBeUndefined();
    });

    it("rejects when posType is used by a posEntry", async () => {
      const { rexUuid, posTypeUuid } = makeRexWithPosType();
      getMissionDocHandle().change((m) => {
        const rex = m.rexes[rexUuid];
        rex.posEntries = [generateBlankPosEntry({ posTypeUuids: [posTypeUuid] }) as PosEntry];
      });
      const store = createCustomTestStore({});
      const result = await store.dispatch(thunkDocDeletePosType({ rexUuid, posTypeUuid }));
      expect(thunkDocDeletePosType.rejected.match(result)).toBe(true);
      expect(result.payload).toContain("Position Item Type");
      expect(getMission().rexes[rexUuid].posTypes).toHaveLength(3); // generateBlankRex starts with 3
    });
  });
});
