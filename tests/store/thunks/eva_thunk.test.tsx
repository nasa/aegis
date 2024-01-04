import { StoreType } from "store";
import { createFullTestStore } from "tests/factories/makeTestStore";
import { v4 as uuidv4 } from "uuid";
import {
  thunkCreateEva,
  thunkDeleteEva,
  thunkDuplicateEva,
  thunkEvaCancel,
  thunkGetStationOrTraverse,
  thunkSaveEva,
} from "store/thunk/thunkEva";
import { createTestTraverse } from "tests/factories/TraverseFactory";
import {
  setTraverseEditMode,
  upsertTraverseByField,
  upsertTraverses,
  upsertTraversesFromDb,
} from "store/traverse";
import { setEvaEditMode, upsertEva, upsertEvaByField } from "store/eva";
import { createTestEva } from "tests/factories/EVAFactory";
import { upsertRexByField } from "store/rex";
import _ from "lodash";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the jest.mock
jest.mock("http-client/traverse");
jest.mock("http-client/eva");
jest.mock("http-client/rex");
import * as httpClient_traverse from "http-client/traverse";
import * as httpClient_eva from "http-client/eva";
import * as httpClient_rex from "http-client/rex";

const confirmSpy = jest.spyOn(window, "confirm").mockImplementation(() => {
  return true;
});
const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {
  return true;
});

const mockThunkGetElevation = jest.fn();
jest.mock("store/thunk/thunkElevation", () => ({
  thunkGetElevation: () => mockThunkGetElevation,
}));

let store: StoreType;

beforeAll(() => {
  store = createFullTestStore();
});

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  jest.restoreAllMocks();
  confirmSpy.mockRestore();
  alertSpy.mockRestore();
});

describe("Thunk EVA Tests", () => {
  // it("thunkCreateEvasCalculatedFields", async () => {});

  it("thunkGetStationOrTraverse", async () => {
    const station = store.getState().station.stations[0];
    const traverse = store.getState().traverse.traverses[0];
    const dummyUuid = uuidv4();

    let res = await store.dispatch(thunkGetStationOrTraverse({ uuid: station.uuid }));
    expect(res.payload).toStrictEqual({ type: "station", item: station });

    res = await store.dispatch(thunkGetStationOrTraverse({ uuid: traverse.uuid }));
    expect(res.payload).toStrictEqual({ type: "traverse", item: traverse });

    res = await store.dispatch(thunkGetStationOrTraverse({ uuid: dummyUuid }));
    expect(res.payload).toBeFalsy();
  });

  it("thunkSaveEva", async () => {
    // modify the eva
    const eva = store.getState().eva.evas[0];
    const newEvaName = "Jest Test EVA Modified";
    store.dispatch(upsertEvaByField(eva.uuid, "name", newEvaName));
    store.dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: true }));

    // get a traverse in this eva and modify it
    const traverse = store
      .getState()
      .traverse.traverses.find(
        (t) => t.uuid === eva.sequence.find((s) => s.type === "traverse").uuid
      );
    const newTraverseName = "Jest Test Traverse Modified";
    store.dispatch(upsertTraverseByField(traverse.uuid, "name", newTraverseName));

    const newTraverse = createTestTraverse();
    store.dispatch(upsertTraverses([newTraverse]));
    store.dispatch(upsertTraversesFromDb([newTraverse]));

    await store.dispatch(thunkSaveEva({ evaUuid: eva.uuid }));

    // assert eva
    expect(httpClient_eva.upsertEvas).toHaveBeenCalledTimes(1);
    expect(store.getState().eva.evasFromDb.find((e) => e.uuid === eva.uuid).name).toEqual(
      newEvaName
    );
    expect(store.getState().eva.evasEditing.includes(eva.uuid)).toBeFalsy();

    // assert modified traverse
    expect(httpClient_traverse.upsertTraverses).toHaveBeenCalledTimes(1);
    expect(store.getState().traverse.traverses.find((t) => t.uuid === traverse.uuid).name).toEqual(
      newTraverseName
    );
    expect(
      store.getState().traverse.traversesFromDb.find((t) => t.uuid === traverse.uuid).name
    ).toEqual(newTraverseName);

    // assert deleted traverse
    expect(httpClient_traverse.deleteTraverses).toHaveBeenCalledTimes(1);
    expect(
      store.getState().traverse.traverses.find((t) => t.uuid === newTraverse.uuid)
    ).toBeUndefined();
    expect(
      store.getState().traverse.traversesFromDb.find((t) => t.uuid === newTraverse.uuid)
    ).toBeUndefined();
  });

  it("thunkEvaCancel existing eva", async () => {
    // modify the eva
    const eva = store.getState().eva.evas[0];
    const newEvaName = "Jest Test EVA Modified";
    store.dispatch(upsertEvaByField(eva.uuid, "name", newEvaName));

    // get a traverse in this eva and modify it
    const traverse = store
      .getState()
      .traverse.traverses.find(
        (t) => t.uuid === eva.sequence.find((s) => s.type === "traverse").uuid
      );
    const newTraverseName = "Jest Test Traverse Modified";
    store.dispatch(upsertTraverseByField(traverse.uuid, "name", newTraverseName));

    // insert a traverse at the end of the sequence for testing (this might not make sense for a real sequence)
    const newTraverse = createTestTraverse();
    store.dispatch(upsertTraverses([newTraverse]));
    store.dispatch(setTraverseEditMode({ uuid: newTraverse.uuid, editMode: false }));
    store.dispatch(
      upsertEvaByField(eva.uuid, "sequence", [
        ...eva.sequence,
        { type: "traverse", uuid: newTraverse.uuid },
      ])
    );
    store.dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: true }));

    await store.dispatch(thunkEvaCancel({ evaUuid: eva.uuid }));

    // assert eva changes
    const evaFromDb = store.getState().eva.evasFromDb.find((e) => e.uuid === eva.uuid);
    expect(evaFromDb).toStrictEqual(eva);
    expect(store.getState().eva.evasEditing.includes(eva.uuid)).toBeFalsy();

    // assert traverse changes
    expect(
      store.getState().traverse.traverses.find((t) => t.uuid === newTraverse.uuid)
    ).toBeUndefined();
    expect(store.getState().traverse.traversesEditing.includes(newTraverse.uuid)).toBeFalsy();
    expect(store.getState().traverse.traverses.find((t) => t.uuid === traverse.uuid)).toStrictEqual(
      store.getState().traverse.traversesFromDb.find((t) => t.uuid === traverse.uuid)
    );
  });

  it("thunkEvaCancel unsaved eva", async () => {
    const unsavedEva = createTestEva();
    const newTraverse = createTestTraverse();
    unsavedEva.sequence = [{ uuid: newTraverse.uuid, type: "traverse" }];
    store.dispatch(upsertEva(unsavedEva));
    store.dispatch(setEvaEditMode({ evaUuid: unsavedEva.uuid, editMode: true }));
    store.dispatch(setTraverseEditMode({ uuid: newTraverse.uuid, editMode: false }));

    await store.dispatch(thunkEvaCancel({ evaUuid: unsavedEva.uuid }));

    // assert eva changes
    expect(store.getState().eva.evasFromDb.find((e) => e.uuid === unsavedEva.uuid)).toBeFalsy();
    expect(store.getState().eva.evas.find((e) => e.uuid === unsavedEva.uuid)).toBeFalsy();
    expect(store.getState().eva.evasEditing.includes(unsavedEva.uuid)).toBeFalsy();

    // assert traverse changes
    expect(
      store.getState().traverse.traverses.find((t) => t.uuid === newTraverse.uuid)
    ).toBeUndefined();
    expect(
      store.getState().traverse.traversesFromDb.find((t) => t.uuid === newTraverse.uuid)
    ).toBeUndefined();
    expect(store.getState().traverse.traversesEditing.includes(newTraverse.uuid)).toBeFalsy();
  });

  it("thunkDeleteEva", async () => {
    // make sure there's an eva to delete and it's on a rex
    await store.dispatch(thunkCreateEva());
    const evaFromDb = store.getState().eva.evasFromDb[0];
    const rex = store.getState().rex.rexes[0];
    store.dispatch(upsertRexByField(rex.uuid, "selectedRexEvaUuid", evaFromDb.uuid));
    store.dispatch(setEvaEditMode({ evaUuid: evaFromDb.uuid, editMode: true }));

    // assert cant delete if rex running
    store.dispatch(upsertRexByField(rex.uuid, "rexRunning", true));
    await store.dispatch(thunkDeleteEva({ evaUuid: evaFromDb.uuid }));
    expect(alertSpy).toHaveBeenCalledTimes(1);

    store.dispatch(upsertRexByField(rex.uuid, "rexRunning", false));
    await store.dispatch(thunkDeleteEva({ evaUuid: evaFromDb.uuid }));

    // assert rex deselected the eva
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(
      store.getState().rex.rexes.find((r) => r.uuid === rex.uuid).selectedRexEvaUuid
    ).toBeNull();
    expect(
      store.getState().rex.rexesFromDb.find((r) => r.uuid === rex.uuid).selectedRexEvaUuid
    ).toBeNull();
    expect(httpClient_rex.upsertRexes).toHaveBeenCalled();

    // assert traverses cleaned up
    const evaTraverse = evaFromDb.sequence.filter((s) => s.type === "traverse").map((s) => s.uuid);
    expect(
      store.getState().traverse.traverses.filter((t) => {
        return evaTraverse.includes(t.uuid);
      })
    ).toEqual([]);
    expect(httpClient_traverse.deleteTraverses).toHaveBeenCalledTimes(1);

    // assert eva deleted
    expect(httpClient_eva.deleteEvas).toHaveBeenCalledTimes(1);
    expect(store.getState().eva.evas.find((e) => e.uuid === evaFromDb.uuid)).toBeUndefined();
    expect(store.getState().eva.evasFromDb.find((e) => e.uuid === evaFromDb.uuid)).toBeUndefined();
    expect(store.getState().eva.evasEditing.includes(evaFromDb.uuid)).toBeFalsy();
  });

  it("thunkCreateEva", async () => {
    const numTraverses = store.getState().traverse.traverses.length;
    const numEvas = store.getState().eva.evas.length;

    await store.dispatch(thunkCreateEva());
    expect(store.getState().traverse.traverses.length).toEqual(numTraverses + 1);
    expect(store.getState().eva.evas.length).toEqual(numEvas + 1);
  });

  it("thunkDuplicateEva no stations", async () => {
    const eva = store.getState().eva.evas.find((e) => e.sequence.length > 0);
    store.dispatch(upsertEvaByField(eva.uuid, "egressLocationUuid", "lander"));
    store.dispatch(upsertEvaByField(eva.uuid, "ingressLocationUuid", "lander"));
    const numEvas = store.getState().eva.evas.length;
    const numTraversesInEva = eva.sequence.filter((s) => s.type === "traverse").length;
    const numTraverses = store.getState().traverse.traverses.length;
    const numStations = store.getState().station.stations.length;

    await store.dispatch(thunkDuplicateEva({ eva: eva, includeStations: false }));
    expect(store.getState().traverse.traverses.length).toEqual(numTraverses + numTraversesInEva);
    expect(store.getState().eva.evas.length).toEqual(numEvas + 1);
    expect(store.getState().station.stations.length).toEqual(numStations);
  });

  it("thunkDuplicateEva with stations", async () => {
    const eva = store.getState().eva.evas.find((e) => e.sequence.length > 0);
    store.dispatch(upsertEvaByField(eva.uuid, "egressLocationUuid", "lander"));
    store.dispatch(upsertEvaByField(eva.uuid, "ingressLocationUuid", "lander"));
    const numEvas = store.getState().eva.evas.length;
    const numTraversesInEva = eva.sequence.filter((s) => s.type === "traverse").length;
    const numTraverses = store.getState().traverse.traverses.length;
    const numStationsInEva = eva.sequence.filter((s) => s.type === "station").length;
    const numStations = store.getState().station.stations.length;

    await store.dispatch(thunkDuplicateEva({ eva: eva, includeStations: true }));
    expect(store.getState().traverse.traverses.length).toEqual(numTraverses + numTraversesInEva);
    expect(store.getState().eva.evas.length).toEqual(numEvas + 1);
    expect(store.getState().station.stations.length).toEqual(numStations + numStationsInEva);
  });

  // it("thunkAddStationToEva", async () => {});

  // it("thunkDeleteStationFromEva", async () => {});

  // it("thunkChangeStationInEva", async () => {});

  // it("thunkReorderStationInEva", async () => {});
});
