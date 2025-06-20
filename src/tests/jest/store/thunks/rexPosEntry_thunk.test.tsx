import { createCustomTestStore, createFullTestStore } from "../../factories/makeTestStore";
import { initialState as rexInitialState } from "store/rex";
import { initialState as mapInitialState } from "store/map";
import {
  thunkCancelPosEntry,
  thunkCancelPosEntryLocation,
  thunkCreatePosEntry,
  thunkDeletePosEntryByUuid,
  thunkDeletePosType,
  thunkPersistPosEntries,
  thunkUpdatePosEntryLocation,
  thunkUpdatePosTypeField,
  thunkUpdatePosTypesOnPosEntry,
} from "store/thunk/thunkRexPosEntry";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the jest.mock
jest.mock("http-client/rex");
import * as httpClient_rex from "http-client/rex";
import { generateBlankPosEntry, generateBlankRex } from "store/storeUtils/rex";
import { generateBlankEVA } from "store/storeUtils/eva";

//I don't understand what is even calling this that is causing me to mock it
jest.mock("string-strip-html", () => ({
  stripHtml: () => jest.fn(),
}));

const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {
  return true;
});

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  jest.restoreAllMocks();
  alertSpy.mockRestore();
});

describe("Thunk Position Entry Tests", () => {
  test("thunkCreatePosEntry", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({
      name: "Jest Rex-1",
      isRunning: true,
      petRunning: false,
      petValueAtStartStop: "+00:07:00",
      evaUuid: eva.uuid,
    });
    const store = createCustomTestStore({
      rex: { ...rexInitialState, rexes: [rex], selectedRexUuid: rex.uuid },
    });

    await store.dispatch(thunkCreatePosEntry({ posTypeUuids: ["uuid1", "uuid2"] }));
    const posEntry = store.getState().rex.rexes[0].posEntries[0];
    expect(posEntry.petSeconds).toEqual(420);
    expect(posEntry.posTypeUuids).toEqual(["uuid1", "uuid2"]);
    expect(store.getState().rex.posEntryEditingUuid).toEqual(posEntry.uuid);
    expect(store.getState().rex.rexesPosEntriesEditing[0]).toEqual(rex.uuid);
  });

  test("thunkUpdatePosEntryLocation", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({ name: "Jest Rex-1", evaUuid: eva.uuid });
    const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
    rex.posEntries = [posEntry];
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        selectedRexUuid: rex.uuid,
        posEntryEditingUuid: posEntry.uuid,
        rexesPosEntriesEditing: [rex.uuid],
      },
    });

    const newLoc: AEGISPoint = { lat: 1, lng: 2 };
    await store.dispatch(
      thunkUpdatePosEntryLocation({ location: newLoc, posEntryUuid: posEntry.uuid })
    );
    const updatedPosEntries = store.getState().rex.rexes[0].posEntries[0];
    expect(updatedPosEntries.location).toEqual(newLoc);
    expect(store.getState().rex.rexes[0].updatedAt).not.toBeNull();
    expect(store.getState().rex.posEntryEditingUuid).toBeNull();
    expect(store.getState().rex.rexesPosEntriesEditing.length).toEqual(0);
    expect(httpClient_rex.upsertRexes).toHaveBeenCalledTimes(1);
  });

  test("thunkUpdatePosTypesOnPosEntry", async () => {
    const store = createFullTestStore();
    const rex = store.getState().rex.rexes[0];
    await store.dispatch(
      thunkUpdatePosTypesOnPosEntry({
        rexUuid: rex.uuid,
        posEntryUuid: rex.posEntries[0].uuid,
        posTypeUuids: [rex.posTypes[1].uuid],
      })
    );

    const updatedRex = store.getState().rex.rexes.find((r) => r.uuid === rex.uuid);
    expect(
      updatedRex.posEntries.find((e) => e.uuid === rex.posEntries[0].uuid).posTypeUuids[0]
    ).toEqual(rex.posTypes[1].uuid);
  });

  test("thunkCancelPosEntriesLocation", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({ name: "Jest Rex-1", evaUuid: eva.uuid });
    const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
    const posEntryWithLoc = generateBlankPosEntry({
      posTypeUuids: [rex.posTypes[0].uuid],
      location: { lat: 1, lng: 2 },
    });
    rex.posEntries = [posEntry, posEntryWithLoc];
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        selectedRexUuid: rex.uuid,
        posEntryEditingUuid: posEntry.uuid,
        rexesPosEntriesEditing: [rex.uuid],
      },
      map: mapInitialState,
    });

    await store.dispatch(thunkCancelPosEntryLocation({ posEntryEditingUuid: posEntry.uuid }));
    const updatedPosEntries = store
      .getState()
      .rex.rexes[0].posEntries.find((c) => c.uuid === posEntry.uuid);
    expect(updatedPosEntries).toBeUndefined();
    expect(store.getState().rex.rexesPosEntriesEditing.length).toEqual(0);
    expect(store.getState().rex.posEntryEditingUuid).toBeNull();
    expect(store.getState().map.mapDirective).toEqual({
      mapItemType: "posEntry",
      uuid: posEntry.uuid,
      mapAction: "cancelCreateMarker",
    });
    await store.dispatch(
      thunkCancelPosEntryLocation({ posEntryEditingUuid: posEntryWithLoc.uuid })
    );
    const updatedPosEntryWithLoc = store
      .getState()
      .rex.rexes[0].posEntries.find((c) => c.uuid === posEntryWithLoc.uuid);
    expect(updatedPosEntryWithLoc.location).toEqual(posEntryWithLoc.location);
    expect(store.getState().map.mapDirective).toEqual({
      mapItemType: "posEntry",
      uuid: posEntryWithLoc.uuid,
      mapAction: "cancelEditMarker",
    });
  });

  test("thunkCancelPosEntry", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({ name: "Jest Rex-1", evaUuid: eva.uuid });
    const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
    const posEntryModified = { ...posEntry, location: { lat: 1, lng: 2 } };
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [{ ...rex, posEntries: [posEntryModified] }],
        rexesFromDb: [{ ...rex, posEntries: [posEntry] }],
        selectedRexUuid: rex.uuid,
        posEntryEditingUuid: posEntry.uuid,
        rexesPosEntriesEditing: [rex.uuid],
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

    await store.dispatch(thunkCancelPosEntry({ posEntryUuid: posEntry.uuid }));
    expect(store.getState().rex.rexes[0].posEntries[0]).toEqual(posEntry);
    expect(store.getState().rex.posEntryEditingUuid).toBeNull();
    expect(store.getState().rex.rexesPosEntriesEditing.length).toEqual(0);
    expect(store.getState().map.mapDirective).toEqual({
      mapItemType: "posEntry",
      uuid: posEntryModified.uuid,
      mapAction: "cancelEditMarker",
    });
  });

  test("thunkPersistPosEntries", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({ name: "Jest Rex-1", evaUuid: eva.uuid });
    const posEntry1 = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
    const posEntry2 = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
    rex.posEntries = [posEntry1, posEntry2];
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        selectedRexUuid: rex.uuid,
        posEntryEditingUuid: posEntry1.uuid,
        rexesPosEntriesEditing: [rex.uuid],
      },
      map: mapInitialState,
    });

    await store.dispatch(thunkPersistPosEntries({ rexUuid: rex.uuid }));
    expect(store.getState().rex.rexesPosEntriesEditing.length).toEqual(0);
    expect(store.getState().rex.posEntryEditingUuid).toBeNull();
    expect(store.getState().rex.rexes[0].posEntries.length).toEqual(2);
    expect(httpClient_rex.upsertRexes).toHaveBeenCalledTimes(1);
  });

  test("thunkDeletePosEntryByUuid", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({ name: "Jest Rex-1", evaUuid: eva.uuid });
    const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
    rex.posEntries = [posEntry];
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        rexesFromDb: [rex],
        selectedRexUuid: rex.uuid,
      },
    });

    await store.dispatch(thunkDeletePosEntryByUuid({ posEntryUuid: posEntry.uuid }));
    expect(store.getState().rex.rexes[0].posEntries).toEqual([]);
    expect(store.getState().rex.rexesFromDb[0].posEntries).toEqual([]);
    expect(httpClient_rex.upsertRexes).toHaveBeenCalledTimes(1);
  });

  test("thunkUpdatePosTypeField", async () => {
    const store = createFullTestStore();
    const rex = store.getState().rex.rexes[0];
    await store.dispatch(
      thunkUpdatePosTypeField({
        rexUuid: rex.uuid,
        uuid: rex.posTypes[0].uuid,
        fieldName: "name",
        value: "Jest Test Pos Type Name",
      })
    );

    const updatedRex = store.getState().rex.rexes.find((r) => r.uuid === rex.uuid);
    expect(updatedRex.posTypes.find((p) => p.uuid === rex.posTypes[0].uuid).name).toEqual(
      "Jest Test Pos Type Name"
    );
  });

  test("thunkDeletePosType", async () => {
    const store = createFullTestStore();
    const rex = store.getState().rex.rexes[0];

    //delete used pos type
    await store.dispatch(
      thunkDeletePosType({
        rexUuid: rex.uuid,
        posTypeUuid: rex.posTypes[0].uuid,
      })
    );
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(store.getState().rex.rexes.find((r) => r.uuid === rex.uuid).posTypes.length).toEqual(
      rex.posTypes.length
    );

    //delete unused pos type
    await store.dispatch(
      thunkDeletePosType({
        rexUuid: rex.uuid,
        posTypeUuid: rex.posTypes[1].uuid,
      })
    );
    expect(store.getState().rex.rexes.find((r) => r.uuid === rex.uuid).posTypes.length).toEqual(
      rex.posTypes.length - 1
    );
  });
});
