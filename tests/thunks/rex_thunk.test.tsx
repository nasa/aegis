import createTestStore from "../factories/makeTestStore";
import { initialState as missionInitialState } from "store/mission";
import { initialState as rexInitialState } from "store/rex";
import { initialState as interfaceInitialState } from "store/interface";
import { initialState as mapInitialState } from "store/map";
import { createTestMission } from "../factories/MissionFactory";
import { createTestCrewPos, createTestRex } from "../factories/RexFactory";
import {
  thunkCancelCrewPos,
  thunkCancelCrewPosLocation,
  thunkCancelRex,
  thunkCreateCrewPos,
  thunkCreateRex,
  thunkDeleteCrewPosByUuid,
  thunkDeleteRex,
  thunkDuplicateRex,
  thunkRexPetStartStop,
  thunkSaveCrewPosition,
  thunkSaveRex,
  thunkUpdateCrewPosLocation,
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
      .spyOn(httpClient_rex, "upsertRex")
      .mockImplementation(async (rex) => {
        const res: WrappedResponse<Rex> = {
          status: "success",
          message: "Rex upserted",
          data: rex,
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
      .spyOn(httpClient_rex, "deleteRex")
      .mockImplementation(async (rexUuid) => {
        const res: WrappedResponse<string> = {
          status: "success",
          message: "Rex deleted",
          data: rexUuid,
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

describe("Thunk Crew Pos Tests", () => {
  test("thunkCreateCrewPos", async () => {
    const rex = createTestRex();
    rex.rexRunning = true;
    rex.petRunning = false;
    rex.petValueAtStartStop = "+00:07:00";
    const store = createTestStore({
      rex: { ...rexInitialState, rexes: [rex], selectedRexUuid: rex.uuid },
    });

    await store.dispatch(thunkCreateCrewPos({ crew: ["EV1", "Cart"] }));
    const crewPos = store.getState().rex.rexes[0].crewPos[0];
    expect(crewPos.seconds).toEqual(420);
    expect(crewPos.crew).toEqual(["EV1", "Cart"]);
    expect(crewPos.updatedAt).toEqual(crewPos.createdAt);
    expect(store.getState().rex.crewPosEditingUuid).toEqual(crewPos.uuid);
    expect(store.getState().rex.rexesCrewPosEditing[0]).toEqual(rex.uuid);
  });

  test("thunkUpdateCrewPosLocation", async () => {
    //mock the call to upsert to the DB (we don't actually want to upsert)
    const mockDbUpsertRex = jest
      .spyOn(httpClient_rex, "upsertRex")
      .mockImplementation(async (rex) => {
        const res: WrappedResponse<Rex> = {
          status: "success",
          message: "Rex upserted",
          data: rex,
        };
        return res;
      });

    const rex = createTestRex();
    const crewPos = createTestCrewPos();
    rex.crewPos = [crewPos];
    const store = createTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        selectedRexUuid: rex.uuid,
        crewPosEditingUuid: crewPos.uuid,
        rexesCrewPosEditing: [rex.uuid],
      },
    });

    const newLoc: AEGISPoint = { lat: 1, lng: 2 };
    await store.dispatch(
      thunkUpdateCrewPosLocation({ location: newLoc, crewPosUuid: crewPos.uuid })
    );
    const updatedCrewPos = store.getState().rex.rexes[0].crewPos[0];
    expect(updatedCrewPos.location).toEqual(newLoc);
    expect(store.getState().rex.rexes[0].updatedAt).not.toBeNull();
    expect(store.getState().rex.crewPosEditingUuid).toBeNull();
    expect(store.getState().rex.rexesCrewPosEditing.length).toEqual(0);
    expect(mockDbUpsertRex).toBeCalledTimes(1);

    mockDbUpsertRex.mockRestore();
  });

  test("thunkCancelCrewPosLocation", async () => {
    const rex = createTestRex();
    const crewPos = createTestCrewPos();
    const crewPosWithLoc = createTestCrewPos();
    crewPosWithLoc.location = { lat: 1, lng: 2 };
    rex.crewPos = [crewPos, crewPosWithLoc];
    const store = createTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        selectedRexUuid: rex.uuid,
        crewPosEditingUuid: crewPos.uuid,
        rexesCrewPosEditing: [rex.uuid],
      },
      map: mapInitialState,
    });

    await store.dispatch(thunkCancelCrewPosLocation({ crewPosEditingUuid: crewPos.uuid }));
    const updatedCrewPos = store
      .getState()
      .rex.rexes[0].crewPos.find((c) => c.uuid === crewPos.uuid);
    expect(updatedCrewPos).toBeUndefined();
    expect(store.getState().rex.rexesCrewPosEditing.length).toEqual(0);
    expect(store.getState().rex.crewPosEditingUuid).toBeNull();
    expect(store.getState().map.mapDirective).toEqual({
      mapItemType: "crewPos",
      uuid: crewPos.uuid,
      mapAction: "cancelCreateMarker",
    });
    await store.dispatch(thunkCancelCrewPosLocation({ crewPosEditingUuid: crewPosWithLoc.uuid }));
    const updatedCrewPosWithLoc = store
      .getState()
      .rex.rexes[0].crewPos.find((c) => c.uuid === crewPosWithLoc.uuid);
    expect(updatedCrewPosWithLoc.location).toEqual(crewPosWithLoc.location);
    expect(store.getState().map.mapDirective).toEqual({
      mapItemType: "crewPos",
      uuid: crewPosWithLoc.uuid,
      mapAction: "cancelEditMarker",
    });
  });

  test("thunkCancelCrewPos", async () => {
    const rex = createTestRex();
    const crewPos = createTestCrewPos();
    const crewPosModified = { ...crewPos, location: { lat: 1, lng: 2 } };
    const store = createTestStore({
      rex: {
        ...rexInitialState,
        rexes: [{ ...rex, crewPos: [crewPosModified] }],
        rexesFromDb: [{ ...rex, crewPos: [crewPos] }],
        selectedRexUuid: rex.uuid,
        crewPosEditingUuid: crewPos.uuid,
        rexesCrewPosEditing: [rex.uuid],
      },
      map: {
        ...mapInitialState,
        mapDirective: {
          mapItemType: "crewPos",
          uuid: crewPosModified.uuid,
          mapAction: "editMarker",
        },
      },
    });

    await store.dispatch(thunkCancelCrewPos({ crewPosUuid: crewPos.uuid }));
    expect(store.getState().rex.rexes[0].crewPos[0]).toEqual(crewPos);
    expect(store.getState().rex.crewPosEditingUuid).toBeNull();
    expect(store.getState().rex.rexesCrewPosEditing.length).toEqual(0);
    expect(store.getState().map.mapDirective).toEqual({
      mapItemType: "crewPos",
      uuid: crewPosModified.uuid,
      mapAction: "cancelEditMarker",
    });
  });

  test("thunkSaveCrewPosition", async () => {
    //mock the call to upsert to the DB (we don't actually want to upsert)
    const mockDbUpsertRex = jest
      .spyOn(httpClient_rex, "upsertRex")
      .mockImplementation(async (rex) => {
        const res: WrappedResponse<Rex> = {
          status: "success",
          message: "Rex upserted",
          data: rex,
        };
        return res;
      });

    const rex = createTestRex();
    const crewPos1 = createTestCrewPos();
    const crewPos2 = createTestCrewPos();
    const store = createTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        selectedRexUuid: rex.uuid,
        crewPosEditingUuid: crewPos1.uuid,
        rexesCrewPosEditing: [rex.uuid],
      },
      map: mapInitialState,
    });

    await store.dispatch(thunkSaveCrewPosition({ crewPos: crewPos1 }));
    expect(store.getState().rex.rexes[0].crewPos.length).toEqual(1);
    expect(store.getState().rex.rexesCrewPosEditing.length).toEqual(0);
    expect(store.getState().rex.crewPosEditingUuid).toBeNull();
    await store.dispatch(thunkSaveCrewPosition({ crewPos: crewPos2 }));
    expect(store.getState().rex.rexes[0].crewPos.length).toEqual(2);
    expect(mockDbUpsertRex).toBeCalledTimes(2);

    mockDbUpsertRex.mockRestore();
  });

  test("thunkDeleteCrewPosByUuid", async () => {
    //mock the call to upsert to the DB (we don't actually want to upsert)
    const mockDbUpsertRex = jest
      .spyOn(httpClient_rex, "upsertRex")
      .mockImplementation(async (rex) => {
        const res: WrappedResponse<Rex> = {
          status: "success",
          message: "Rex upserted",
          data: rex,
        };
        return res;
      });

    const rex = createTestRex();
    const crewPos = createTestCrewPos();
    rex.crewPos = [crewPos];
    const store = createTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        rexesFromDb: [rex],
        selectedRexUuid: rex.uuid,
      },
    });

    await store.dispatch(thunkDeleteCrewPosByUuid({ crewPosUuid: crewPos.uuid }));
    expect(store.getState().rex.rexes[0].crewPos).toEqual([]);
    expect(store.getState().rex.rexesFromDb[0].crewPos).toEqual([]);
    expect(mockDbUpsertRex).toBeCalledTimes(1);

    mockDbUpsertRex.mockRestore();
  });
});
