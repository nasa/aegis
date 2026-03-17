import type { StoreType } from "store";
import { createFullTestStore } from "tests/vitest/fixtures/redux/makeTestStore";
import { v4 as uuidv4 } from "uuid";
import {
  thunkAddStationToEva,
  thunkChangeStationInEva,
  thunkCreateEva,
  thunkDeleteEva,
  thunkDeleteStationFromEva,
  thunkDuplicateEva,
  thunkCancelEva,
  thunkGetStationOrTraverse,
  thunkReorderStationInEva,
  thunkSaveEva,
  thunkChangeIngressEgress,
} from "store/thunk/thunkEva";
import {
  setTraversesEditMode,
  upsertTraverseByField,
  upsertTraverses,
  upsertTraversesFromDb,
} from "store/traverse";
import { setEvaEditMode, setEvaSequence, upsertEvas, upsertEvaByField } from "store/eva";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the vi.mock
vi.mock("http-client/traverse");
vi.mock("http-client/eva");
vi.mock("http-client/station");
vi.mock("http-client/action");
vi.mock("http-client/rex");
import * as httpClient_traverse from "http-client/traverse";
import * as httpClient_eva from "http-client/eva";
import * as httpClient_station from "http-client/station";
import * as httpClient_action from "http-client/action";
import * as httpClient_rex from "http-client/rex";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import cloneDeep from "lodash/cloneDeep";
import { generateBlankStation } from "store/storeUtils/station";
import { upsertStations } from "store/station";
import { setMissionAutomergeDocHandle } from "client/automergeDocHandles";

const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => {
  return true;
});
const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {
  return true;
});

const mockThunkGetElevation = vi.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
vi.mock("store/thunk/thunkElevation", () => ({
  thunkGetElevation: () => mockThunkGetElevation,
}));

const mockThunkFullUpdateTraverse = vi.fn();
const mockThunkUpdateTraversesAroundStation = vi.fn();
vi.mock("store/thunk/thunkTraverse", async () => {
  const actualModule = await vi.importActual("store/thunk/thunkTraverse");
  return {
    ...actualModule,
    thunkFullUpdateTraverse: () => mockThunkFullUpdateTraverse,
    thunkUpdateTraversesAroundStation: () => mockThunkUpdateTraversesAroundStation,
  };
});

let store: StoreType;

beforeAll(() => {
  /**
   * Init the mission automerge doc. In the app this is handled in the component.
   * Pass in null because this function is being mocked so we don't
   * have to pass in a real value.
   */
  setMissionAutomergeDocHandle(null);
});

beforeEach(async () => {
  vi.clearAllMocks(); // clear call count
  store = createFullTestStore();
});

afterAll(() => {
  vi.restoreAllMocks();
  confirmSpy.mockRestore();
  alertSpy.mockRestore();
});

describe("Thunk EVA Tests", () => {
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
    const eva = store.getState().eva.evas.find((e) => e.name === "Vitest Eva-1 Rex Version");
    const newEvaName = "Vitest Test EVA Modified";
    store.dispatch(upsertEvaByField(eva.uuid, "name", newEvaName));
    store.dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: true }));

    // get a bunch of stations not used in this eva and update an egress and sequence station
    const newStationForEgress = generateBlankStation({ name: "Vitest Test Station" });
    store.dispatch(upsertEvaByField(eva.uuid, "egressLocationUuid", newStationForEgress.uuid));
    const newStationForSequence = generateBlankStation({ name: "Vitest Test Station-2" });
    const newEvaSequence = cloneDeep(eva.sequence);
    newEvaSequence[1].uuid = newStationForSequence.uuid;
    store.dispatch(setEvaSequence({ evaUuid: eva.uuid, sequence: newEvaSequence }));
    store.dispatch(upsertStations([newStationForEgress, newStationForSequence]));

    // get a traverse in this eva and modify it
    const traverse = store
      .getState()
      .traverse.traverses.find(
        (t) => t.uuid === eva.sequence.find((s) => s.type === "traverse").uuid
      );
    const newTraverseName = "Vitest Test Traverse Modified";
    store.dispatch(upsertTraverseByField(traverse.uuid, "name", newTraverseName));

    const newTraverse = generateBlankTraverse({ name: "Vitest Traverse-1" });
    store.dispatch(upsertTraverses([newTraverse]));
    store.dispatch(upsertTraversesFromDb([newTraverse]));

    // save the EVA
    await store.dispatch(thunkSaveEva({ evaUuid: eva.uuid }));

    // assert eva
    expect(httpClient_eva.upsertEvas).toHaveBeenCalledTimes(1);
    expect(store.getState().eva.evasFromDb.find((e) => e.uuid === eva.uuid).name).toEqual(
      newEvaName
    );
    expect(store.getState().eva.evasEditing.includes(eva.uuid)).toBeFalsy();

    // assert deleted traverse
    expect(httpClient_traverse.deleteTraverses).toHaveBeenCalledTimes(1);
    expect(
      store.getState().traverse.traverses.find((t) => t.uuid === newTraverse.uuid)
    ).toBeUndefined();
    expect(
      store.getState().traverse.traversesFromDb.find((t) => t.uuid === newTraverse.uuid)
    ).toBeUndefined();

    // assert the new station in the sequence was duplicated and the old one deleted
    expect(httpClient_station.deleteStations).toHaveBeenCalledTimes(1);
    // old sequence station is deleted
    expect(
      store.getState().station.stations.find((s) => s.uuid === eva.sequence[1].uuid)
    ).toBeUndefined();
    expect(
      store.getState().station.stationsFromDb.find((s) => s.uuid === eva.sequence[1].uuid)
    ).toBeUndefined();
    const savedEva = store.getState().eva.evasFromDb.find((e) => e.uuid === eva.uuid);
    // new sequence station should be duplicated, and assigned to the sequence
    expect(
      store.getState().station.stations.filter((s) => s.refUuid === newStationForSequence.refUuid)
        .length
    ).toEqual(2);
    const newStationForSequenceDuplicated = store
      .getState()
      .station.stations.find(
        (s) => s.refUuid === newStationForSequence.refUuid && s.uuid !== newStationForSequence.uuid
      );
    expect(savedEva.sequence[1].uuid).toEqual(newStationForSequenceDuplicated.uuid); // the sequence should reflect the newly duplicated station uuid

    // assert the egress was duplicated
    expect(
      store.getState().station.stations.filter((s) => s.refUuid === newStationForEgress.refUuid)
        .length
    ).toEqual(2);
    const newStationForEgressDuplicated = store
      .getState()
      .station.stations.find(
        (s) => s.refUuid === newStationForEgress.refUuid && s.uuid !== newStationForEgress.uuid
      );
    expect(savedEva.egressLocationUuid).toEqual(newStationForEgressDuplicated.uuid); // the egress should reflect the newly duplicated station uuid
  });

  describe("thunkCancelEva", () => {
    it("thunkCancelEva existing eva", async () => {
      // modify the eva
      const eva = store.getState().eva.evas[0];
      const newEvaName = "Vitest Test EVA Modified";
      store.dispatch(upsertEvaByField(eva.uuid, "name", newEvaName));

      // get a traverse in this eva and modify it
      const traverse = store
        .getState()
        .traverse.traverses.find(
          (t) => t.uuid === eva.sequence.find((s) => s.type === "traverse").uuid
        );
      const newTraverseName = "Vitest Test Traverse Modified";
      store.dispatch(upsertTraverseByField(traverse.uuid, "name", newTraverseName));

      // insert a traverse at the end of the sequence for testing (this might not make sense for a real sequence)
      const newTraverse = generateBlankTraverse({ name: "Vitest Traverse-1" });
      store.dispatch(upsertTraverses([newTraverse]));
      store.dispatch(setTraversesEditMode({ uuids: [newTraverse.uuid], editMode: false }));
      store.dispatch(
        upsertEvaByField(eva.uuid, "sequence", [
          ...eva.sequence,
          { type: "traverse", uuid: newTraverse.uuid },
        ])
      );
      store.dispatch(setEvaEditMode({ evaUuid: eva.uuid, editMode: true }));

      await store.dispatch(thunkCancelEva({ evaUuid: eva.uuid }));

      // assert eva changes
      const evaFromDb = store.getState().eva.evasFromDb.find((e) => e.uuid === eva.uuid);
      expect(evaFromDb).toStrictEqual(eva);
      expect(store.getState().eva.evasEditing.includes(eva.uuid)).toBeFalsy();

      // assert traverse changes
      expect(
        store.getState().traverse.traverses.find((t) => t.uuid === newTraverse.uuid)
      ).toBeUndefined();
      expect(store.getState().traverse.traversesEditing.includes(newTraverse.uuid)).toBeFalsy();
      expect(
        store.getState().traverse.traverses.find((t) => t.uuid === traverse.uuid)
      ).toStrictEqual(
        store.getState().traverse.traversesFromDb.find((t) => t.uuid === traverse.uuid)
      );
    });

    it("thunkCancelEva unsaved eva", async () => {
      const unsavedEva = generateBlankEVA({ name: "Vitest Eva-1" });
      const newTraverse = generateBlankTraverse({ name: "Vitest Traverse-1" });
      unsavedEva.sequence = [{ uuid: newTraverse.uuid, type: "traverse" }];
      store.dispatch(upsertEvas([unsavedEva]));
      store.dispatch(setEvaEditMode({ evaUuid: unsavedEva.uuid, editMode: true }));
      store.dispatch(setTraversesEditMode({ uuids: [newTraverse.uuid], editMode: false }));

      await store.dispatch(thunkCancelEva({ evaUuid: unsavedEva.uuid }));

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
  });

  describe("thunkDeleteEva", () => {
    it("thunkDeleteEva with no stations", async () => {
      const evaFromDb = store
        .getState()
        .eva.evasFromDb.find((e) => e.name === "Vitest Eva-2 Planned No Rex");
      store.dispatch(setEvaEditMode({ evaUuid: evaFromDb.uuid, editMode: true }));
      await store.dispatch(thunkDeleteEva({ evaUuid: evaFromDb.uuid, forRex: false }));

      // assert traverses and traverse actions are cleaned up
      const evaTraverseUuids = evaFromDb.sequence
        .filter((s) => s.type === "traverse")
        .map((s) => s.uuid);
      expect(
        store.getState().traverse.traverses.filter((t) => evaTraverseUuids.includes(t.uuid))
      ).toEqual([]);
      expect(httpClient_traverse.deleteTraverses).toHaveBeenCalledTimes(1);
      expect(
        store.getState().action.actions.filter((a) => evaTraverseUuids.includes(a.traverseUuid))
      ).toEqual([]);
      expect(httpClient_action.deleteActions).toHaveBeenCalledTimes(1);

      // assert eva deleted
      expect(httpClient_eva.deleteEvas).toHaveBeenCalledTimes(1);
      expect(store.getState().eva.evas.find((e) => e.uuid === evaFromDb.uuid)).toBeUndefined();
      expect(
        store.getState().eva.evasFromDb.find((e) => e.uuid === evaFromDb.uuid)
      ).toBeUndefined();
      expect(store.getState().eva.evasEditing.includes(evaFromDb.uuid)).toBeFalsy();
    });

    it("thunkDeleteEva for Rex", async () => {
      const evaFromDb = store
        .getState()
        .eva.evasFromDb.find((e) => e.name === "Vitest Eva-1 Rex Version");
      store.dispatch(setEvaEditMode({ evaUuid: evaFromDb.uuid, editMode: true }));
      const stationNotInEva = store
        .getState()
        .station.stations.find((s) => !evaFromDb.sequence.map((seq) => seq.uuid).includes(s.uuid));
      store.dispatch(upsertEvaByField(evaFromDb.uuid, "egressLocationUuid", stationNotInEva.uuid));
      await store.dispatch(thunkDeleteEva({ evaUuid: evaFromDb.uuid, forRex: true }));

      // assert traverses and traverse actions are cleaned up
      const evaTraverses = evaFromDb.sequence
        .filter((s) => s.type === "traverse")
        .map((s) => s.uuid);
      expect(
        store.getState().traverse.traverses.filter((t) => {
          return evaTraverses.includes(t.uuid);
        })
      ).toEqual([]);
      expect(httpClient_traverse.deleteTraverses).toHaveBeenCalledTimes(1);
      const traverseUuids = evaFromDb.sequence
        .filter((s) => s.type === "traverse")
        .map((s) => s.uuid);
      expect(
        store.getState().action.actions.filter((a) => traverseUuids.includes(a.traverseUuid))
      ).toEqual([]);

      // assert station and station actions are cleaned up
      const evaStations = evaFromDb.sequence.filter((s) => s.type === "station").map((s) => s.uuid);
      expect(
        store.getState().station.stations.filter((s) => {
          return evaStations.includes(s.uuid);
        })
      ).toEqual([]);
      const stationUuids = evaFromDb.sequence
        .filter((s) => s.type === "station")
        .map((s) => s.uuid);
      expect(
        store.getState().action.actions.filter((a) => stationUuids.includes(a.stationUuid))
      ).toEqual([]);

      // assert eva deleted
      expect(httpClient_eva.deleteEvas).toHaveBeenCalledTimes(1);
      expect(httpClient_action.deleteActions).toHaveBeenCalledTimes(3);
      expect(store.getState().eva.evas.find((e) => e.uuid === evaFromDb.uuid)).toBeUndefined();
      expect(
        store.getState().eva.evasFromDb.find((e) => e.uuid === evaFromDb.uuid)
      ).toBeUndefined();
      expect(store.getState().eva.evasEditing.includes(evaFromDb.uuid)).toBeFalsy();

      // assert the egress station is deleted
      expect(
        store.getState().station.stations.find((s) => s.uuid === stationNotInEva.uuid)
      ).toBeUndefined();
      expect(httpClient_station.deleteStations).toHaveBeenCalledTimes(2); // 1 for sequence stations, 1 for egress
    });

    it("thunkDeleteEva as-planned with attached rexes", async () => {
      const asPlannedEvaWithRex = store
        .getState()
        .eva.evas.find((e) => e.name === "Vitest Eva-1 Planned with Rex");
      await store.dispatch(thunkDeleteEva({ evaUuid: asPlannedEvaWithRex.uuid, forRex: false }));

      // assert no evas exist with same refUuid
      expect(
        store.getState().eva.evas.find((e) => e.refUuid === asPlannedEvaWithRex.refUuid)
      ).toBeFalsy();
      const evaSeqUuids = store
        .getState()
        .eva.evas.map((e) => e.sequence)
        .flat()
        .map((s) => s.uuid);
      expect(
        store.getState().traverse.traverses.filter((t) => !evaSeqUuids.includes(t.uuid))
      ).toEqual([]);
      // assert no rexes with an EVA that doesn't exist
      const allEvaUuids = store.getState().eva.evas.map((e) => e.uuid);
      expect(store.getState().rex.rexes.filter((r) => !allEvaUuids.includes(r.evaUuid))).toEqual(
        []
      );
      expect(httpClient_rex.deleteRexes).toHaveBeenCalledTimes(1);
      expect(httpClient_eva.deleteEvas).toHaveBeenCalledTimes(2);
    });
  });

  it("thunkCreateEva", async () => {
    const numTraverses = store.getState().traverse.traverses.length;
    const numEvas = store.getState().eva.evas.length;

    await store.dispatch(thunkCreateEva());
    expect(store.getState().traverse.traverses.length).toEqual(numTraverses + 1);
    expect(store.getState().eva.evas.length).toEqual(numEvas + 1);
  });

  describe("thunkDuplicateEva", () => {
    it("thunkDuplicateEva no stations", async () => {
      const eva = store.getState().eva.evas.find((e) => e.sequence.length > 0);
      store.dispatch(upsertEvaByField(eva.uuid, "egressLocationUuid", "lander"));
      store.dispatch(upsertEvaByField(eva.uuid, "ingressLocationUuid", "lander"));
      const numEvas = store.getState().eva.evas.length;
      const numTraversesInEva = eva.sequence.filter((s) => s.type === "traverse").length;
      const numTraverses = store.getState().traverse.traverses.length;
      const numStations = store.getState().station.stations.length;

      await store.dispatch(
        thunkDuplicateEva({ evaUuid: eva.uuid, includeStations: false, isRexEva: false })
      );
      // eva should have been duplicated and saved to db
      expect(store.getState().eva.evas.length).toEqual(numEvas + 1);
      expect(store.getState().eva.evasFromDb.length).toEqual(numEvas + 1);
      expect(httpClient_eva.upsertEvas).toHaveBeenCalledTimes(2);
      // traverses should be duplicated and saved to db
      expect(store.getState().traverse.traverses.length).toEqual(numTraverses + numTraversesInEva);
      expect(store.getState().traverse.traversesFromDb.length).toEqual(
        numTraverses + numTraversesInEva
      );
      expect(httpClient_traverse.upsertTraverses).toHaveBeenCalledTimes(numTraversesInEva * 2);
      // stations should NOT have been duplicated and NOT saved to db
      expect(store.getState().station.stations.length).toEqual(numStations);
      expect(store.getState().station.stationsFromDb.length).toEqual(numStations);
      expect(httpClient_station.upsertStations).toHaveBeenCalledTimes(0);
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

      await store.dispatch(
        thunkDuplicateEva({ evaUuid: eva.uuid, includeStations: true, isRexEva: false })
      );
      // eva should have been duplicated and saved to db
      expect(store.getState().eva.evas.length).toEqual(numEvas + 1);
      expect(store.getState().eva.evasFromDb.length).toEqual(numEvas + 1);
      expect(httpClient_eva.upsertEvas).toHaveBeenCalledTimes(2);
      // traverses should be duplicated and saved to db
      expect(store.getState().traverse.traverses.length).toEqual(numTraverses + numTraversesInEva);
      expect(store.getState().traverse.traversesFromDb.length).toEqual(
        numTraverses + numTraversesInEva
      );
      expect(httpClient_traverse.upsertTraverses).toHaveBeenCalledTimes(numTraversesInEva * 2);
      // stations should have been duplicated and saved to db
      expect(store.getState().station.stations.length).toEqual(numStations + numStationsInEva);
      expect(store.getState().station.stationsFromDb.length).toEqual(
        numStations + numStationsInEva
      );
      expect(httpClient_station.upsertStations).toHaveBeenCalledTimes(numStationsInEva * 2);
    });

    it("thunkDuplicateEva with stations for REX", async () => {
      let eva = store.getState().eva.evas.find((e) => e.name === "Vitest Eva-1 Planned with Rex");
      const stationNotInEva = store
        .getState()
        .station.stations.find((s) => !eva.sequence?.map((seq) => seq.uuid).includes(s.uuid));
      store.dispatch(upsertEvaByField(eva.uuid, "egressLocationUuid", stationNotInEva.uuid));
      store.dispatch(upsertEvaByField(eva.uuid, "ingressLocationUuid", stationNotInEva.uuid));
      eva = store.getState().eva.evas.find((e) => e.name === "Vitest Eva-1 Planned with Rex"); // reset the pointer to the updated eva with ingress/egress
      const numEvas = store.getState().eva.evas.length;
      const numTraversesInEva = eva.sequence.filter((s) => s.type === "traverse").length;
      const numTraverses = store.getState().traverse.traverses.length;
      const numStationsInEva = eva.sequence.filter((s) => s.type === "station").length;
      const numStations = store.getState().station.stations.length;

      const res = await store.dispatch(
        thunkDuplicateEva({ evaUuid: eva.uuid, includeStations: true, isRexEva: true })
      );
      // eva should have been duplicated and saved to db
      expect(store.getState().eva.evas.length).toEqual(numEvas + 1);
      expect(store.getState().eva.evasFromDb.length).toEqual(numEvas + 1);
      expect(httpClient_eva.upsertEvas).toHaveBeenCalledTimes(2);
      expect(res.payload).toBeTruthy();
      if (res.payload) expect(res.payload.name).toBe("");
      // traverses should be duplicated and saved to db
      expect(store.getState().traverse.traverses.length).toEqual(numTraverses + numTraversesInEva);
      expect(store.getState().traverse.traversesFromDb.length).toEqual(
        numTraverses + numTraversesInEva
      );
      expect(httpClient_traverse.upsertTraverses).toHaveBeenCalledTimes(numTraversesInEva * 2); // x2 because when actions are duplicated it updates the station actionOrderUuids
      // stations should have been duplicated and saved to db
      // ingress/egress stations should have been duplicated and save to db
      expect(store.getState().station.stations.length).toEqual(numStations + numStationsInEva + 2);
      expect(store.getState().station.stationsFromDb.length).toEqual(
        numStations + numStationsInEva + 2
      );
      expect(httpClient_station.upsertStations).toHaveBeenCalledTimes(numStationsInEva * 2 + 4); // x2 because when actions are duplicated it updates the station actionOrderUuids
    });
  });

  describe("Sequence Tests", () => {
    it("thunkAddStationToEva", async () => {
      //add to existing sequence
      const eva = store.getState().eva.evas[0];
      const evaSequenceCount = eva.sequence.length;
      const traverseCount = store.getState().traverse.traverses.length;
      await store.dispatch(thunkAddStationToEva({ evaUuid: eva.uuid }));
      expect(store.getState().traverse.traverses.length).toEqual(traverseCount + 1);
      expect(store.getState().eva.evas.find((e) => e.uuid === eva.uuid).sequence.length).toEqual(
        evaSequenceCount + 2
      );
    });

    it("thunkDeleteStationFromEva first station", async () => {
      const eva = store.getState().eva.evas.find((e) => e.sequence.length === 7);
      const evaSequence = eva.sequence;
      const traverseCount = store.getState().traverse.traverses.length;

      //delete first station in sequence
      await store.dispatch(
        thunkDeleteStationFromEva({ evaSequence, sequenceIndex: 1, evaUuid: eva.uuid })
      );
      const newSequence = store.getState().eva.evas.find((e) => e.uuid === eva.uuid).sequence;
      expect(newSequence.length).toEqual(evaSequence.length - 2);
      expect(store.getState().traverse.traverses.length).toEqual(traverseCount - 1);
      expect(mockThunkFullUpdateTraverse).toHaveBeenCalledTimes(1);
    });

    it("thunkDeleteStationFromEva middle station", async () => {
      const eva = store.getState().eva.evas.find((e) => e.sequence.length === 7);
      const evaSequence = eva.sequence;
      const traverseCount = store.getState().traverse.traverses.length;

      //delete middle station in sequence
      await store.dispatch(
        thunkDeleteStationFromEva({ evaSequence, sequenceIndex: 3, evaUuid: eva.uuid })
      );
      const newSequence = store.getState().eva.evas.find((e) => e.uuid === eva.uuid).sequence;
      expect(newSequence.length).toEqual(evaSequence.length - 2);
      expect(store.getState().traverse.traverses.length).toEqual(traverseCount - 1);
      expect(mockThunkFullUpdateTraverse).toHaveBeenCalledTimes(1);
    });

    it("thunkDeleteStationFromEva last station", async () => {
      const eva = store.getState().eva.evas.find((e) => e.sequence.length === 7);
      const evaSequence = eva.sequence;
      const traverseCount = store.getState().traverse.traverses.length;

      //delete last item in sequence
      await store.dispatch(
        thunkDeleteStationFromEva({ evaSequence, sequenceIndex: 5, evaUuid: eva.uuid })
      );
      const newSequence = store.getState().eva.evas.find((e) => e.uuid === eva.uuid).sequence;
      expect(newSequence.length).toEqual(evaSequence.length - 2);
      expect(store.getState().traverse.traverses.length).toEqual(traverseCount - 1);
      expect(mockThunkFullUpdateTraverse).toHaveBeenCalledTimes(1);
    });

    it("thunkChangeStationInEva not in REX", async () => {
      const eva = store.getState().eva.evas.find((e) => e.name === "Vitest Eva-2 Planned No Rex");
      const numStations = store.getState().station.stations.length;
      const stationNotInEva = store.getState().station.stations.find(
        (s) =>
          !eva.sequence
            .filter((seq) => seq.type === "station")
            .map((seq) => seq.uuid)
            .includes(s.uuid)
      );

      await store.dispatch(
        thunkChangeStationInEva({
          evaSequence: eva?.sequence,
          sequenceIndex: 1,
          newStationUuid: stationNotInEva.uuid,
          evaUuid: eva.uuid,
        })
      );
      const updatedEva = store
        .getState()
        .eva.evas.find((e) => e.name === "Vitest Eva-2 Planned No Rex");
      expect(updatedEva.sequence[1].uuid).toEqual(stationNotInEva.uuid);
      expect(store.getState().station.stations.length).toEqual(numStations);
      expect(mockThunkUpdateTraversesAroundStation).toHaveBeenCalledTimes(1);
    });

    it("thunkChangeStationInEva in REX", async () => {
      const eva = store.getState().eva.evas.find((e) => e.name === "Vitest Eva-1 Rex Version");
      const numStations = store.getState().station.stations.length;
      const stationNotInEva = store.getState().station.stations.find(
        (s) =>
          !eva.sequence
            .filter((seq) => seq.type === "station")
            .map((seq) => seq.uuid)
            .includes(s.uuid)
      );
      const oldStationUuid = eva.sequence[1].uuid;

      await store.dispatch(
        thunkChangeStationInEva({
          evaSequence: eva?.sequence,
          sequenceIndex: 1,
          newStationUuid: stationNotInEva.uuid,
          evaUuid: eva.uuid,
        })
      );

      // duplicated station should be the one added to the sequence uuid
      const newSequence = store.getState().eva.evas.find((e) => e.uuid === eva.uuid).sequence;
      expect(newSequence[1].uuid).toEqual(stationNotInEva.uuid);
      expect(newSequence.map((seq) => seq.uuid).includes(oldStationUuid)).toBeFalsy();
      expect(store.getState().station.stations.length).toEqual(numStations);
      expect(mockThunkUpdateTraversesAroundStation).toHaveBeenCalledTimes(1);
    });

    it("thunkReorderStationInEva", async () => {
      const eva = store.getState().eva.evas.find((e) => e.sequence.length >= 5);

      await store.dispatch(
        thunkReorderStationInEva({
          direction: "up",
          evaSequence: eva.sequence,
          stationIndex: 3,
          evaUuid: eva.uuid,
        })
      );
      const updatedEvaSequence = store
        .getState()
        .eva.evas.find((e) => e.uuid === eva.uuid).sequence;
      expect(updatedEvaSequence[1].uuid).toEqual(eva.sequence[3].uuid);
      expect(updatedEvaSequence[3].uuid).toEqual(eva.sequence[1].uuid);
      expect(mockThunkFullUpdateTraverse).toHaveBeenCalledTimes(3);
    });

    it("thunkChangeIngressEgress", async () => {
      const eva = store.getState().eva.evas.find((e) => e.name === "Vitest Eva-1 Rex Version");
      const stationNotInEva = store
        .getState()
        .station.stations.find((s) => !eva.sequence.map((seq) => seq.uuid).includes(s.uuid));

      // update ingress
      await store.dispatch(
        thunkChangeIngressEgress({
          type: "ingress",
          newStationUuidOrLander: stationNotInEva.uuid,
          evaUuid: eva.uuid,
        })
      );
      expect(
        store.getState().eva.evas.find((e) => e.uuid === eva.uuid).ingressLocationUuid
      ).toEqual(stationNotInEva.uuid);
      expect(mockThunkFullUpdateTraverse).toHaveBeenCalledTimes(1);

      // update egress
      await store.dispatch(
        thunkChangeIngressEgress({
          type: "egress",
          newStationUuidOrLander: stationNotInEva.uuid,
          evaUuid: eva.uuid,
        })
      );
      expect(store.getState().eva.evas.find((e) => e.uuid === eva.uuid).egressLocationUuid).toEqual(
        stationNotInEva.uuid
      );
      expect(mockThunkFullUpdateTraverse).toHaveBeenCalledTimes(2);
    });
  });
});
