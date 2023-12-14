import createTestStore from "../factories/makeTestStore";
import { initialState as missionInitialState } from "store/mission";
import { initialState as rexInitialState } from "store/rex";
import { initialState as interfaceInitialState } from "store/interface";
import { initialState as mapInitialState } from "store/map";
import { createTestMission } from "../factories/MissionFactory";
import { createTestPosEntry, createTestRex } from "../factories/RexFactory";
import {
  thunkCancelPosEntry,
  thunkCancelPosEntryLocation,
  thunkCancelRex,
  thunkCreatePosEntry,
  thunkCreateRex,
  thunkDeletePosEntryByUuid,
  thunkDeleteRex,
  thunkDuplicateRex,
  thunkPersistRexPosEntries,
  thunkRexPetStartStop,
  thunkSaveRex,
  thunkUpdatePosEntryLocation,
} from "store/thunk/thunkRex";
import * as httpClient_rex from "http-client/rex";
jest.mock("http-client/rex", () => {
  return {
    __esModule: true,
    ...jest.requireActual("http-client/rex"),
  };
});

//I don't understand what is even calling this that is causing me to mock it
jest.mock("string-strip-html", () => ({
  stripHtml: () => jest.fn(),
}));

const mockThunkLogRexFull = jest.fn();
jest.mock("store/thunk/thunkLog", () => ({
  thunkLogRexFull: () => mockThunkLogRexFull,
}));

describe("Thunk Rex Tests", () => {
  test("thunkCreateRex", async () => {
    const mission = createTestMission();
    const store = createTestStore({
      mission: { ...missionInitialState, mission: mission },
      rex: { ...rexInitialState },
      interface: { ...interfaceInitialState },
    });
    await store.dispatch(thunkCreateRex());
    expect(store.getState().rex.rexes.length).toEqual(1);
    expect(store.getState().rex.rexesEditing).not.toBeNull();
    expect(store.getState().rex.selectedRexUuid).not.toBeNull();
    expect(store.getState().rex.expandedRexUuids.length).toEqual(1);
    expect(store.getState().interface.rightPanelOpen).toEqual(true);
  });

  test("thunkDuplicateRex", async () => {
    const rex = createTestRex();
    const store = createTestStore({
      rex: { ...rexInitialState, rexes: [rex] },
    });
    await store.dispatch(thunkDuplicateRex({ rexUuid: rex.uuid }));
    expect(store.getState().rex.rexes.length).toEqual(2);
    const duplicatedRex = store.getState().rex.rexes.find((r) => r.uuid !== rex.uuid);
    expect(duplicatedRex).toBeTruthy();
    expect(duplicatedRex.name).toEqual("Jest Rex-1 (copy 1)");
  });

  test("thunkSaveRex", async () => {
    //mock the call to upsert to the DB (we don't actually want to upsert)
    const mockDbUpsertRex = jest
      .spyOn(httpClient_rex, "upsertRexes")
      .mockImplementation(async (rexes) => {
        const res: WrappedResponse<Rex[]> = {
          status: "success",
          message: "Rex upserted",
          data: rexes,
        };
        return res;
      });

    const rex = createTestRex();
    const runningRex = createTestRex();
    runningRex.rexRunning = true;
    const rexModified = { ...rex, name: "Jest Rex-1 Modified" };
    const store = createTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rexModified],
        rexesFromDb: [rex, runningRex],
        rexesEditing: [rex.uuid],
      },
    });
    await store.dispatch(thunkSaveRex({ rexUuid: rexModified.uuid }));
    const storeState = store.getState();
    expect(mockThunkLogRexFull).toBeCalledTimes(1);
    expect(mockDbUpsertRex).toBeCalledTimes(2);
    expect(storeState.rex.rexesFromDb.find((r) => r.uuid === rex.uuid).name).toEqual(
      "Jest Rex-1 Modified"
    );
    expect(storeState.rex.rexesEditing.length).toEqual(0);
    expect(storeState.rex.rexesFromDb.find((r) => r.uuid === runningRex.uuid).petRunning).toEqual(
      false
    );

    mockDbUpsertRex.mockRestore();
  });

  test("thunkCancelRex", async () => {
    const rex = createTestRex();
    const rexModified = { ...rex, name: "Jest Rex-1 Modified" };
    const rexUnsaved = createTestRex();
    const store = createTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rexModified, rexUnsaved],
        rexesFromDb: [rex],
        rexesEditing: [rex.uuid, rexUnsaved.uuid],
      },
    });
    await store.dispatch(thunkCancelRex({ rexUuid: rexModified.uuid }));
    expect(store.getState().rex.rexesFromDb.find((r) => r.uuid === rex.uuid).name).toEqual(
      "Jest Rex-1"
    );
    expect(store.getState().rex.rexesEditing.includes(rex.uuid)).toBeFalsy();
    await store.dispatch(thunkCancelRex({ rexUuid: rexUnsaved.uuid }));
    expect(store.getState().rex.rexesFromDb.length).toEqual(1);
    expect(store.getState().rex.rexesEditing.includes(rexUnsaved.uuid)).toBeFalsy();
  });

  test("thunkDeleteRex", async () => {
    //mock the call to upsert to the DB (we don't actually want to upsert)
    const mockDbDeleteRex = jest
      .spyOn(httpClient_rex, "deleteRexes")
      .mockImplementation(async () => {
        const res: WrappedResponse<null> = {
          status: "success",
          message: "Rex deleted",
          data: null,
        };
        return res;
      });

    const rex = createTestRex();
    const rexModified = { ...rex, name: "Jest Rex-1 Modified" };
    const rexUnsaved = createTestRex();
    const store = createTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rexModified, rexUnsaved],
        rexesFromDb: [rex],
        rexesEditing: [rex.uuid, rexUnsaved.uuid],
        selectedRexUuid: rex.uuid,
      },
    });
    await store.dispatch(thunkDeleteRex({ rexUuid: rexModified.uuid }));
    await store.dispatch(thunkDeleteRex({ rexUuid: rexUnsaved.uuid }));
    expect(store.getState().rex.rexesEditing.includes(rex.uuid)).toBeFalsy();
    expect(store.getState().rex.rexesEditing.includes(rexUnsaved.uuid)).toBeFalsy();
    expect(store.getState().rex.rexesFromDb.length).toEqual(0);
    expect(store.getState().rex.selectedRexUuid).toBeNull();
    expect(mockDbDeleteRex).toBeCalledTimes(2);
  });

  test("thunkRexPetStartStop", async () => {
    const rex = createTestRex();
    const store = createTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        rexesFromDb: [rex],
      },
    });
    await store.dispatch(
      thunkRexPetStartStop({ rexUuid: rex.uuid, directive: "start", petValue: "+00:10:00" })
    );
    expect(store.getState().rex.rexes[0].petValueAtStartStop).toEqual("+00:10:00");
    expect(store.getState().rex.rexes[0].petRunning).toBeTruthy();
    expect(store.getState().rex.rexes[0].petStartStopTimestamp).toBeTruthy();
    await store.dispatch(
      thunkRexPetStartStop({ rexUuid: rex.uuid, directive: "stop", petValue: "+00:15:00" })
    );
    expect(store.getState().rex.rexes[0].petValueAtStartStop).toEqual("+00:15:00");
    expect(store.getState().rex.rexes[0].petRunning).toBeFalsy();
    expect(store.getState().rex.rexes[0].petStartStopTimestamp).toBeTruthy();

    expect(store.getState().rex.rexesFromDb[0].petValueAtStartStop).toEqual("+00:00:00");
    expect(store.getState().rex.rexesFromDb[0].petRunning).toBeFalsy();
    expect(store.getState().rex.rexesFromDb[0].petStartStopTimestamp).toBeNull();
  });
});

describe("Thunk Pos Tests", () => {
  test("thunkCreatePosItem", async () => {
    const rex = createTestRex();
    rex.rexRunning = true;
    rex.petRunning = false;
    rex.petValueAtStartStop = "+00:07:00";
    const store = createTestStore({
      rex: { ...rexInitialState, rexes: [rex], selectedRexUuid: rex.uuid },
    });

    await store.dispatch(thunkCreatePosEntry({ posTypeUuids: ["uuid1", "uuid2"] }));
    const posEntry = store.getState().rex.rexes[0].posEntries[0];
    expect(posEntry.seconds).toEqual(420);
    expect(posEntry.posTypeUuids).toEqual(["uuid1", "uuid2"]);
    expect(posEntry.updatedAt).toEqual(posEntry.createdAt);
    expect(store.getState().rex.posEntryEditingUuid).toEqual(posEntry.uuid);
    expect(store.getState().rex.rexesPosEntriesEditing[0]).toEqual(rex.uuid);
  });

  test("thunkUpdatePosEntryLocation", async () => {
    //mock the call to upsert to the DB (we don't actually want to upsert)
    const mockDbUpsertRex = jest
      .spyOn(httpClient_rex, "upsertRexes")
      .mockImplementation(async (rexes) => {
        const res: WrappedResponse<Rex[]> = {
          status: "success",
          message: "Rex upserted",
          data: rexes,
        };
        return res;
      });

    const rex = createTestRex();
    const posEntry = createTestPosEntry();
    rex.posEntries = [posEntry];
    const store = createTestStore({
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
    expect(mockDbUpsertRex).toBeCalledTimes(1);

    mockDbUpsertRex.mockRestore();
  });

  test("thunkCancelPosEntriesLocation", async () => {
    const rex = createTestRex();
    const posEntry = createTestPosEntry();
    const posEntryWithLoc = createTestPosEntry();
    posEntryWithLoc.location = { lat: 1, lng: 2 };
    rex.posEntries = [posEntry, posEntryWithLoc];
    const store = createTestStore({
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
    const rex = createTestRex();
    const posEntry = createTestPosEntry();
    const posEntryModified = { ...posEntry, location: { lat: 1, lng: 2 } };
    const store = createTestStore({
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

  test("thunkPersistRexPosEntries", async () => {
    //mock the call to upsert to the DB (we don't actually want to upsert)
    const mockDbUpsertRex = jest
      .spyOn(httpClient_rex, "upsertRexes")
      .mockImplementation(async (rexes) => {
        const res: WrappedResponse<Rex[]> = {
          status: "success",
          message: "Rex upserted",
          data: rexes,
        };
        return res;
      });

    const rex = createTestRex();
    const posEntry1 = createTestPosEntry();
    const posEntry2 = createTestPosEntry();
    rex.posEntries = [posEntry1, posEntry2];
    const store = createTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        selectedRexUuid: rex.uuid,
        posEntryEditingUuid: posEntry1.uuid,
        rexesPosEntriesEditing: [rex.uuid],
      },
      map: mapInitialState,
    });

    await store.dispatch(thunkPersistRexPosEntries({ rexUuid: rex.uuid }));
    expect(store.getState().rex.rexesPosEntriesEditing.length).toEqual(0);
    expect(store.getState().rex.posEntryEditingUuid).toBeNull();
    expect(store.getState().rex.rexes[0].posEntries.length).toEqual(2);
    expect(mockDbUpsertRex).toBeCalledTimes(1);

    mockDbUpsertRex.mockRestore();
  });

  test("thunkDeletePosEntryByUuid", async () => {
    //mock the call to upsert to the DB (we don't actually want to upsert)
    const mockDbUpsertRex = jest
      .spyOn(httpClient_rex, "upsertRexes")
      .mockImplementation(async (rexes) => {
        const res: WrappedResponse<Rex[]> = {
          status: "success",
          message: "Rex upserted",
          data: rexes,
        };
        return res;
      });

    const rex = createTestRex();
    const posEntry = createTestPosEntry();
    rex.posEntries = [posEntry];
    const store = createTestStore({
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
    expect(mockDbUpsertRex).toBeCalledTimes(1);

    mockDbUpsertRex.mockRestore();
  });
});
