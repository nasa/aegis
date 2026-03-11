import { createCustomTestStore } from "../../factories/makeTestStore";
import { initialState as traverseInitialState } from "store/traverse";
import { initialState as missionInitialState } from "store/mission";
import { initialState as evaInitialState } from "store/eva";
import { initialState as stationInitialState } from "store/station";
import { initialState as actionInitialState } from "store/action";
import {
  thunkCancelTraverse,
  thunkDeleteTraverses,
  thunkDuplicateTraverse,
  thunkFullUpdateTraverse,
  thunkResetTraverse,
  thunkSaveTraverse,
  thunkUpdateTraversePath,
  thunkUpdateTraversesAroundStation,
} from "store/thunk/thunkTraverse";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the jest.mock
jest.mock("http-client/traverse");
jest.mock("http-client/action");
import * as httpClient_traverse from "http-client/traverse";
import * as httpClient_action from "http-client/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { setMissionAutomergeDocHandle } from "client/automergeDocHandles";

const mockThunkGetElevation = jest.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
jest.mock("store/thunk/thunkElevation", () => ({
  thunkGetElevation: () => mockThunkGetElevation,
}));

beforeAll(() => {
  /**
   * Init the mission automerge doc. In the app this is handled in the component.
   * Pass in null because this function is being mocked in jest.setup.ts so we don't
   * have to pass in a real value.
   */
  setMissionAutomergeDocHandle(null);
});

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Thunk Traverse Tests", () => {
  test("thunkUpdateTraversePath()", async () => {
    const traverse: Traverse = generateBlankTraverse({ name: "Jest Traverse-1" });

    const newPath = [
      { lat: 1, lng: 2 },
      { lat: 1.2, lng: 2.2 },
    ];
    const store = createCustomTestStore({
      traverse: { ...traverseInitialState, traverses: [traverse] },
      mission: {
        ...missionInitialState,
      },
    });

    await store.dispatch(thunkUpdateTraversePath({ path: newPath, traverseUuid: traverse.uuid }));
    const storeState = store.getState();
    expect(storeState.traverse.traverses[0].path).toEqual(newPath);
    expect(storeState.traverse.traverses[0].pathSegmentDistances.length).toEqual(1);
  });

  test("thunkFullUpdateTraverse()", async () => {
    const traverseEgress: Traverse = generateBlankTraverse({ name: "Jest Traverse-1" });
    const traverseIngress: Traverse = generateBlankTraverse({ name: "Jest Traverse-1" });
    const traverse: Traverse = generateBlankTraverse({ name: "Jest Traverse-1" });
    const traverseNoEva: Traverse = generateBlankTraverse({ name: "Jest Traverse-1" });
    const station1: Station = generateBlankStation({
      name: "Jest Station-1",
      location: { lat: 1, lng: 1.1 },
    });
    const station2: Station = generateBlankStation({
      name: "Jest Station-1",
      location: { lat: 2, lng: 2.1 },
    });
    const eva: Eva = generateBlankEVA({ name: "Jest Eva-1" });
    eva.sequence = [
      { uuid: traverseEgress.uuid, type: "traverse" },
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
      { uuid: traverseIngress.uuid, type: "traverse" },
    ];
    const newPath = [
      station1.location,
      { lat: 1.5, lng: 2.5 },
      { lat: 1.6, lng: 2.6 },
      station2.location,
    ];
    const store = createCustomTestStore({
      traverse: {
        ...traverseInitialState,
        traverses: [traverseEgress, traverse, traverseIngress, traverseNoEva],
        traversesEditing: [traverse.uuid],
      },
      mission: {
        ...missionInitialState,
      },
      eva: {
        ...evaInitialState,
        evas: [eva],
      },
      station: {
        ...stationInitialState,
        stations: [station1, station2],
      },
    });

    //update with a path
    await store.dispatch(
      thunkFullUpdateTraverse({
        path: newPath,
        traverseUuid: traverse.uuid,
        evaSequence: eva.sequence,
        rename: true,
        saveToDb: true,
      })
    );
    let storeState = store.getState();
    let resultTraverse = storeState.traverse.traverses.find((t) => t.uuid === traverse.uuid);
    expect(resultTraverse.name).toEqual("Jest Station-1 to Jest Station-1");
    expect(resultTraverse.path).toEqual([
      station1.location,
      { lat: 1.5, lng: 2.5 },
      { lat: 1.6, lng: 2.6 },
      station2.location,
    ]);
    expect(resultTraverse.pathSegmentDistances.length).toEqual(3);
    expect(resultTraverse.updatedAt).not.toBeNull();
    expect(mockThunkGetElevation).toHaveBeenCalledTimes(1);
    expect(httpClient_traverse.upsertTraverses).toHaveBeenCalledTimes(1);
    expect(storeState.traverse.traversesFromDb.length).toEqual(1);
    expect(storeState.traverse.traversesEditing.length).toEqual(0);

    //update with no path
    await store.dispatch(thunkFullUpdateTraverse({ path: null, traverseUuid: traverseNoEva.uuid }));
    storeState = store.getState();
    resultTraverse = storeState.traverse.traverses.find((t) => t.uuid === traverseNoEva.uuid);
    expect(resultTraverse.name).toEqual("Jest Traverse-1");
    expect(resultTraverse.path).toEqual([
      { lat: 3, lng: 3 },
      { lat: 3, lng: 3 },
    ]);
    expect(storeState.traverse.traversesFromDb.length).toEqual(1);
    expect(httpClient_traverse.upsertTraverses).toHaveBeenCalledTimes(1);
    expect(mockThunkGetElevation).toHaveBeenCalledTimes(2);
  });

  test("thunkResetTraverse", async () => {
    const traverse = generateBlankTraverse({ name: "Jest Traverse-1" });
    const traverse2 = generateBlankTraverse({ name: "Jest Traverse-1" });
    const traverse3 = generateBlankTraverse({ name: "Jest Traverse-1" });
    const station1: Station = generateBlankStation({
      name: "Jest Station-1",
      location: { lat: 1, lng: 1.1 },
    });
    const station2: Station = generateBlankStation({
      name: "Jest Station-2",
      location: { lat: 2, lng: 2.1 },
    });
    const station3: Station = generateBlankStation({
      name: "Jest Station-3",
      location: { lat: 3, lng: 2.1 },
    });
    const eva = generateBlankEVA({ name: "Jest Eva-1" });
    eva.egressLocationUuid = station3.uuid;
    eva.sequence = [
      { uuid: traverse2.uuid, type: "traverse" },
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
      { uuid: traverse3.uuid, type: "traverse" },
    ];
    const store = createCustomTestStore({
      traverse: { ...traverseInitialState, traverses: [traverse, traverse2, traverse3] },
      eva: {
        ...evaInitialState,
        evas: [eva],
        selectedEvaUuid: eva.uuid,
        selectedEvaSequenceItemUuid: traverse.uuid,
      },
      mission: {
        ...missionInitialState,
      },
      station: { ...stationInitialState, stations: [station1, station2, station3] },
    });
    await store.dispatch(thunkResetTraverse({ traverseUuid: traverse.uuid }));
    expect(store.getState().traverse.traverses.find((t) => t.uuid === traverse.uuid).path).toEqual([
      station1.location,
      station2.location,
    ]);
    await store.dispatch(thunkResetTraverse({ traverseUuid: traverse2.uuid }));
    expect(store.getState().traverse.traverses.find((t) => t.uuid === traverse2.uuid).path).toEqual(
      [station3.location, station1.location]
    );
    await store.dispatch(thunkResetTraverse({ traverseUuid: traverse3.uuid }));
    expect(store.getState().traverse.traverses.find((t) => t.uuid === traverse3.uuid).path).toEqual(
      [station2.location, { lat: 3, lng: 3 }]
    );
  });

  test("thunkUpdateTraversesAroundStation", async () => {
    const traverse1 = generateBlankTraverse({ name: "Jest Traverse-1" });
    const traverse2 = generateBlankTraverse({ name: "Jest Traverse-1" });
    const traverse3 = generateBlankTraverse({ name: "Jest Traverse-1" });
    const traverse4 = generateBlankTraverse({ name: "Jest Traverse-1" });
    const station1: Station = generateBlankStation({
      name: "Jest Station-1",
      location: { lat: 1, lng: 1.1 },
    });
    const station2: Station = generateBlankStation({
      name: "Jest Station-2",
      location: { lat: 2, lng: 2.1 },
    });
    const station3: Station = generateBlankStation({
      name: "Jest Station-3",
      location: { lat: 3, lng: 2.1 },
    });
    const eva1 = generateBlankEVA({ name: "Jest Eva-1" });
    eva1.sequence = [
      { uuid: traverse1.uuid, type: "traverse" },
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse2.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
      { uuid: traverse3.uuid, type: "traverse" },
      { uuid: station3.uuid, type: "station" },
      { uuid: traverse4.uuid, type: "traverse" },
    ];

    const store = createCustomTestStore({
      traverse: {
        ...traverseInitialState,
        traverses: [traverse1, traverse2, traverse3, traverse4],
      },
      eva: {
        ...evaInitialState,
        evas: [eva1],
      },
      mission: {
        ...missionInitialState,
      },
      station: { ...stationInitialState, stations: [station1, station2, station3] },
    });
    await store.dispatch(thunkUpdateTraversesAroundStation({ stationUuid: station1.uuid }));
    await store.dispatch(thunkUpdateTraversesAroundStation({ stationUuid: station2.uuid }));
    await store.dispatch(thunkUpdateTraversesAroundStation({ stationUuid: station3.uuid }));
    const t1 = store.getState().traverse.traverses.find((t) => t.uuid === traverse1.uuid);
    const t2 = store.getState().traverse.traverses.find((t) => t.uuid === traverse2.uuid);
    const t3 = store.getState().traverse.traverses.find((t) => t.uuid === traverse3.uuid);
    const t4 = store.getState().traverse.traverses.find((t) => t.uuid === traverse4.uuid);
    expect(t1.path).toEqual([{ lat: 3, lng: 3 }, station1.location]);
    expect(t2.path).toEqual([station1.location, station2.location]);
    expect(t3.path).toEqual([station2.location, station3.location]);
    expect(t4.path).toEqual([station3.location, { lat: 3, lng: 3 }]);
    expect(t1.name).toEqual("Lander to Jest Station-1");
    expect(t2.name).toEqual("Jest Station-1 to Jest Station-2");
    expect(t3.name).toEqual("Jest Station-2 to Jest Station-3");
    expect(t4.name).toEqual("Jest Station-3 to Lander");
  });

  test("thunkSaveTraverse()", async () => {
    const traverse: Traverse = generateBlankTraverse({ name: "Jest Traverse-1" });
    const traverseModified: Traverse = { ...traverse, name: "Jest Traverse-1 Modified" };
    const traverseAction = generateBlankAction({
      name: "Jest Traverse Action",
      traverseUuid: traverse.uuid,
      updatedAt: new Date("1/1/2000").getTime(),
    });
    const traverseActionModified = {
      ...traverseAction,
      name: "Jest Traverse Action Modified",
      updatedAt: new Date("1/2/2000").getTime(),
    };
    const station = generateBlankStation({
      name: "Jest Station-1",
    });
    const eva = generateBlankEVA({ name: "Jest Eva-1" });
    eva.sequence = [
      { uuid: traverse.uuid, type: "traverse" },
      { uuid: station.uuid, type: "station" },
      { uuid: "randomTraverseUuid", type: "traverse" },
    ];

    const store = createCustomTestStore({
      traverse: {
        ...traverseInitialState,
        traversesFromDb: [traverse],
        traverses: [traverseModified],
        traversesEditing: [traverse.uuid],
      },
      action: {
        ...actionInitialState,
        actions: [traverseAction],
        actionsFromDb: [traverseActionModified],
      },
      eva: {
        ...evaInitialState,
        evas: [eva],
        selectedEvaUuid: eva.uuid,
      },
      station: {
        ...stationInitialState,
        stations: [station],
      },
    });

    await store.dispatch(thunkSaveTraverse({ traverseUuid: traverse.uuid }));
    expect(httpClient_traverse.upsertTraverses).toHaveBeenCalledTimes(1);
    expect(httpClient_action.upsertActions).toHaveBeenCalledTimes(1);
    expect(store.getState().action.actions[0]).toEqual(store.getState().action.actionsFromDb[0]);
    expect(store.getState().traverse.traverses[0]).toEqual(
      store.getState().traverse.traversesFromDb[0]
    );
    expect(store.getState().traverse.traverses[0].name).toEqual("Lander to Jest Station-1");
    expect(store.getState().traverse.traversesEditing.length).toEqual(0);
  });

  test("thunkDuplicateTraverse()", async () => {
    const traverse: Traverse = generateBlankTraverse({ name: "Jest Traverse-1" });
    const traverseAction = generateBlankAction({
      name: "Jest Traverse Action",
      traverseUuid: traverse.uuid,
    });
    const store = createCustomTestStore({
      traverse: {
        ...traverseInitialState,
        traverses: [traverse],
        traversesFromDb: [traverse],
      },
      action: {
        ...actionInitialState,
        actions: [traverseAction],
        actionsFromDb: [traverseAction],
      },
    });

    // duplicate without preserving refUuid
    await store.dispatch(
      thunkDuplicateTraverse({ traverseUuid: traverse.uuid, preserveRefUuid: false })
    );
    expect(store.getState().traverse.traverses.length).toEqual(2);
    expect(store.getState().traverse.traverses[0].refUuid).not.toEqual(
      store.getState().traverse.traverses[1].refUuid
    );
    // should have saved to db
    expect(store.getState().traverse.traversesFromDb.length).toEqual(2);
    expect(httpClient_traverse.upsertTraverses).toHaveBeenCalledTimes(2); // call happens +2 because actions causes another upsert to traverse
    // actions should be duplicated and saved to db
    expect(store.getState().action.actions.length).toEqual(2);
    expect(store.getState().action.actionsFromDb.length).toEqual(2);
    expect(store.getState().action.actions[0].refUuid).not.toEqual(
      store.getState().action.actions[1].refUuid
    );
    expect(httpClient_action.upsertActions).toHaveBeenCalledTimes(1);

    // duplicate with preserving refUuid
    await store.dispatch(
      thunkDuplicateTraverse({ traverseUuid: traverse.uuid, preserveRefUuid: true })
    );
    expect(store.getState().traverse.traverses.length).toEqual(3);
    expect(
      store.getState().traverse.traverses.filter((t) => t.refUuid === traverse.refUuid).length
    ).toEqual(2);
    // should have saved to db
    expect(store.getState().traverse.traversesFromDb.length).toEqual(3);
    expect(httpClient_traverse.upsertTraverses).toHaveBeenCalledTimes(4); // call happens +2 because actions causes another upsert to traverse
    // actions should be duplicated and saved to db
    expect(store.getState().action.actions.length).toEqual(3);
    expect(store.getState().action.actionsFromDb.length).toEqual(3);
    expect(
      store.getState().action.actions.filter((a) => a.refUuid === traverseAction.refUuid).length
    ).toEqual(2);
    expect(httpClient_action.upsertActions).toHaveBeenCalledTimes(2);
  });

  test("thunkCancelTraverse()", async () => {
    const traverse: Traverse = generateBlankTraverse({ name: "Jest Traverse-1" });
    const traverseModified: Traverse = { ...traverse, name: "Jest Traverse-1 Modified" };
    const traverseAction = generateBlankAction({
      name: "Jest Traverse Action",
      traverseUuid: traverse.uuid,
    });
    const traverseActionModified = {
      ...traverseAction,
      name: "Jest Traverse Action Modified",
    };
    const unsavedTraverseAction = generateBlankAction({
      name: "Jest Traverse Action Unsaved",
      traverseUuid: traverse.uuid,
    });
    const store = createCustomTestStore({
      traverse: {
        ...traverseInitialState,
        traversesFromDb: [traverse],
        traverses: [traverseModified],
        traversesEditing: [traverse.uuid],
      },
      action: {
        ...actionInitialState,
        actions: [traverseAction, unsavedTraverseAction],
        actionsFromDb: [traverseActionModified],
      },
    });

    await store.dispatch(thunkCancelTraverse({ traverseUuid: traverse.uuid }));
    expect(httpClient_traverse.upsertTraverses).toHaveBeenCalledTimes(0);
    expect(store.getState().action.actions).toEqual(store.getState().action.actionsFromDb);
    expect(store.getState().traverse.traverses).toEqual(store.getState().traverse.traversesFromDb);
    expect(store.getState().traverse.traversesEditing.length).toEqual(0);
  });

  test("thunkDeleteTraverse()", async () => {
    const traverse: Traverse = generateBlankTraverse({ name: "Jest Traverse-1" });
    const traverseAction = generateBlankAction({
      name: "Jest Traverse Action",
      traverseUuid: traverse.uuid,
    });
    const unsavedTraverseAction = generateBlankAction({
      name: "Jest Traverse Action Unsaved",
      traverseUuid: traverse.uuid,
    });
    const store = createCustomTestStore({
      traverse: {
        ...traverseInitialState,
        traversesFromDb: [traverse],
        traverses: [traverse],
        traversesEditing: [traverse.uuid],
      },
      action: {
        ...actionInitialState,
        actions: [traverseAction, unsavedTraverseAction],
        actionsFromDb: [traverseAction],
      },
    });

    await store.dispatch(thunkDeleteTraverses({ traverseUuids: [traverse.uuid] }));
    expect(httpClient_traverse.deleteTraverses).toHaveBeenCalledTimes(1);
    expect(httpClient_action.deleteActions).toHaveBeenCalledTimes(1);
    expect(store.getState().traverse.traverses.length).toEqual(0);
    expect(store.getState().traverse.traversesFromDb.length).toEqual(0);
    expect(store.getState().traverse.traversesEditing.length).toEqual(0);
    expect(store.getState().action.actions.length).toEqual(0);
    expect(store.getState().action.actionsFromDb.length).toEqual(0);
  });
});
