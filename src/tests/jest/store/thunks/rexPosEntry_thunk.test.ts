import { createCustomTestStore, createFullTestStore } from "../../factories/makeTestStore";
import { initialState as rexInitialState } from "store/rex";
import { initialState as mapInitialState } from "store/map";
import {
  thunkCancelPosEntryInEdit,
  thunkDeletePosEntryByUuid,
  thunkDeletePosType,
  thunkPersistPosEntries,
  thunkUpdatePosEntryLocation,
  thunkUpdatePosTypeField,
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
  test("thunkUpdatePosEntryLocation - Add new position entry", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({ name: "Jest Rex-1", evaUuid: eva.uuid });
    const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
    rex.posEntries = [posEntry];
    const posEntryInEdit = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        selectedRexUuid: rex.uuid,
        posEntryInEdit: posEntryInEdit,
      },
    });

    const newLoc: AEGISPoint = { lat: 1, lng: 2 };
    await store.dispatch(
      thunkUpdatePosEntryLocation({ location: newLoc, posEntryUuid: posEntryInEdit.uuid })
    );
    expect(store.getState().rex.rexes[0].posEntries.length).toEqual(2);
    expect(
      store.getState().rex.rexes[0].posEntries.find((p) => p.uuid === posEntryInEdit.uuid).location
    ).toEqual(newLoc);
    expect(store.getState().rex.rexes[0].updatedAt).not.toBeNull();
    expect(store.getState().rex.posEntryInEdit.uuid).toBeNull();
    expect(httpClient_rex.upsertRexes).toHaveBeenCalledTimes(1);
  });

  test("thunkUpdatePosEntryLocation - Edit existing position entry", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({ name: "Jest Rex-1", evaUuid: eva.uuid });
    const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
    rex.posEntries = [posEntry];
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        selectedRexUuid: rex.uuid,
        posEntryInEdit: posEntry,
      },
    });

    const newLoc: AEGISPoint = { lat: 1, lng: 2 };
    await store.dispatch(
      thunkUpdatePosEntryLocation({ location: newLoc, posEntryUuid: posEntry.uuid })
    );
    expect(store.getState().rex.rexes[0].posEntries[0].location).toEqual(newLoc);
    expect(store.getState().rex.rexes[0].updatedAt).not.toBeNull();
    expect(store.getState().rex.posEntryInEdit.uuid).toBeNull();
    expect(httpClient_rex.upsertRexes).toHaveBeenCalledTimes(1);
  });

  test("thunkCancelPosEntry", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({ name: "Jest Rex-1", evaUuid: eva.uuid });
    const posEntry = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
    const posEntryModified = { ...posEntry, location: { lat: 1, lng: 2 } };
    rex.posEntries = [posEntry];
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        rexesFromDb: [rex],
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

    await store.dispatch(thunkCancelPosEntryInEdit());
    expect(store.getState().rex.posEntryInEdit.uuid).toBeNull();
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
    rex.posEntries = [posEntry1];
    const posEntryInEdit = { ...posEntry1, posTypeUuids: [rex.posTypes[0].uuid] };
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        selectedRexUuid: rex.uuid,
        posEntryInEdit: posEntryInEdit,
      },
      map: mapInitialState,
    });

    await store.dispatch(thunkPersistPosEntries({ rexUuid: rex.uuid }));
    expect(store.getState().rex.rexes[0].posEntries[0]).toEqual(posEntryInEdit);
    expect(store.getState().rex.posEntryInEdit.uuid).toBeNull();
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
