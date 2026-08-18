import { createCustomTestStore } from "../../fixtures/store";
import { initialState as evaInitialState } from "store/eva";
import { initialState as mapInitialState } from "store/map";
import {
  thunkUICancelTraverse,
  thunkDocDeleteTraverses,
  thunkDocUpdateTraverse,
  thunkDocResetTraverse,
  thunkDocSaveTraverse,
  thunkDocUpdateTraversesAroundStation,
} from "store/thunk/thunkTraverse";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { setMissionAutomergeDocHandle, getMissionDocHandle } from "client/automergeDocHandles";

const mockThunkFetchElevation = vi.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
vi.mock("store/thunk/thunkElevation", () => ({
  thunkFetchElevation: () => mockThunkFetchElevation,
}));

const getMission = (): Mission => getMissionDocHandle().doc();

beforeAll(() => {
  // The vitest setup file mocks this to create a blank mission doc on demand.
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  // wipe automerge entity collections to a known-empty state between tests
  getMissionDocHandle().change((m) => {
    m.stations = {};
    m.traverses = {};
    m.evas = {};
    m.actions = {};
    m.pois = {};
    m.rexes = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Thunk Traverse Tests", () => {
  it("thunkDocUpdateTraverse() updates path/distances/name and persists to automerge", async () => {
    const traverseEgress: Traverse = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const traverseIngress: Traverse = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const traverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const traverseNoEva: Traverse = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const station1: Station = generateBlankStation({
      name: "Vitest Station-1",
      location: { lat: 1, lng: 1.1 },
    });
    const station2: Station = generateBlankStation({
      name: "Vitest Station-1",
      location: { lat: 2, lng: 2.1 },
    });
    const eva: Eva = generateBlankEVA({ name: "Vitest Eva-1" });
    eva.sequence = [
      { uuid: traverseEgress.uuid, type: "traverse" },
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
      { uuid: traverseIngress.uuid, type: "traverse" },
    ];

    getMissionDocHandle().change((m) => {
      m.traverses[traverseEgress.uuid] = traverseEgress;
      m.traverses[traverse.uuid] = traverse;
      m.traverses[traverseIngress.uuid] = traverseIngress;
      m.traverses[traverseNoEva.uuid] = traverseNoEva;
      m.stations[station1.uuid] = station1;
      m.stations[station2.uuid] = station2;
      m.evas[eva.uuid] = eva;
    });

    const store = createCustomTestStore({});

    //update with a path
    const newPath = [
      station1.location,
      { lat: 1.5, lng: 2.5 },
      { lat: 1.6, lng: 2.6 },
      station2.location,
    ];
    await store.dispatch(
      thunkDocUpdateTraverse({
        path: newPath,
        traverseUuid: traverse.uuid,
        evaSequence: eva.sequence,
        renameTraverse: true,
      })
    );
    let resultTraverse = getMission().traverses[traverse.uuid];
    expect(resultTraverse.name).toEqual("Vitest Station-1 to Vitest Station-1");
    expect(resultTraverse.path).toEqual([
      station1.location,
      { lat: 1.5, lng: 2.5 },
      { lat: 1.6, lng: 2.6 },
      station2.location,
    ]);
    expect(resultTraverse.pathSegmentDistances.length).toEqual(3);
    expect(resultTraverse.updatedAt).not.toBeNull();
    expect(mockThunkFetchElevation).toHaveBeenCalledTimes(1);

    //update with no path -> falls back to a traverse not in any EVA, gets lander/lander
    await store.dispatch(thunkDocUpdateTraverse({ path: null, traverseUuid: traverseNoEva.uuid }));
    resultTraverse = getMission().traverses[traverseNoEva.uuid];
    // name is unchanged when `rename` is not set
    expect(resultTraverse.name).toEqual("Vitest Traverse-1");
    expect(resultTraverse.path).toEqual([
      { lat: 3, lng: 3 },
      { lat: 3, lng: 3 },
    ]);
    expect(mockThunkFetchElevation).toHaveBeenCalledTimes(2);
  });

  it("thunkDocResetTraverse() resets traverse path to its surrounding station locations", async () => {
    const traverse = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const traverse2 = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const traverse3 = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const station1: Station = generateBlankStation({
      name: "Vitest Station-1",
      location: { lat: 1, lng: 1.1 },
    });
    const station2: Station = generateBlankStation({
      name: "Vitest Station-2",
      location: { lat: 2, lng: 2.1 },
    });
    const station3: Station = generateBlankStation({
      name: "Vitest Station-3",
      location: { lat: 3, lng: 2.1 },
    });
    // Station 3 is the egress; the ingress is a lander stand-in.
    const landerIngress: Station = generateBlankStation({
      name: "Lander",
      isLanderXgress: true,
      location: { lat: 3, lng: 3 },
    });
    const eva = generateBlankEVA({ name: "Vitest Eva-1" });
    eva.sequence = [
      { uuid: station3.uuid, type: "station" },
      { uuid: traverse2.uuid, type: "traverse" },
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
      { uuid: traverse3.uuid, type: "traverse" },
      { uuid: landerIngress.uuid, type: "station" },
    ];
    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
      m.traverses[traverse2.uuid] = traverse2;
      m.traverses[traverse3.uuid] = traverse3;
      m.stations[station1.uuid] = station1;
      m.stations[station2.uuid] = station2;
      m.stations[station3.uuid] = station3;
      m.stations[landerIngress.uuid] = landerIngress;
      m.evas[eva.uuid] = eva;
    });

    const store = createCustomTestStore({
      eva: {
        ...evaInitialState,
        selectedEvaUuid: eva.uuid,
        selectedEvaSequenceItemUuid: traverse.uuid,
      },
    });

    await store.dispatch(thunkDocResetTraverse({ traverseUuid: traverse.uuid }));
    expect(getMission().traverses[traverse.uuid].path).toEqual([
      station1.location,
      station2.location,
    ]);
    await store.dispatch(thunkDocResetTraverse({ traverseUuid: traverse2.uuid }));
    expect(getMission().traverses[traverse2.uuid].path).toEqual([
      station3.location,
      station1.location,
    ]);
    await store.dispatch(thunkDocResetTraverse({ traverseUuid: traverse3.uuid }));
    expect(getMission().traverses[traverse3.uuid].path).toEqual([
      station2.location,
      { lat: 3, lng: 3 },
    ]);
  });

  it("thunkDocUpdateTraversesAroundStation() updates all surrounding traverses across all evas", async () => {
    // eva1 traverses
    const traverse1 = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const traverse2 = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const traverse3 = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const traverse4 = generateBlankTraverse({ name: "Vitest Traverse-1" });
    // eva2 traverses — share station1 and station2 with eva1
    const traverse5 = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const traverse6 = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const traverse7 = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const station1: Station = generateBlankStation({
      name: "Vitest Station-1",
      location: { lat: 1, lng: 1.1 },
    });
    const station2: Station = generateBlankStation({
      name: "Vitest Station-2",
      location: { lat: 2, lng: 2.1 },
    });
    const station3: Station = generateBlankStation({
      name: "Vitest Station-3",
      location: { lat: 3, lng: 2.1 },
    });
    // Both EVAs egress and ingress at the lander, each with its own stand-in.
    const makeLander = () =>
      generateBlankStation({
        name: "Lander",
        isLanderXgress: true,
        location: { lat: 3, lng: 3 },
      });
    const eva1Egress = makeLander();
    const eva1Ingress = makeLander();
    const eva2Egress = makeLander();
    const eva2Ingress = makeLander();

    const eva1 = generateBlankEVA({ name: "Vitest Eva-1" });
    eva1.sequence = [
      { uuid: eva1Egress.uuid, type: "station" },
      { uuid: traverse1.uuid, type: "traverse" },
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse2.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
      { uuid: traverse3.uuid, type: "traverse" },
      { uuid: station3.uuid, type: "station" },
      { uuid: traverse4.uuid, type: "traverse" },
      { uuid: eva1Ingress.uuid, type: "station" },
    ];
    // eva2 shares station1 and station2 but has its own traverses
    const eva2 = generateBlankEVA({ name: "Vitest Eva-2" });
    eva2.sequence = [
      { uuid: eva2Egress.uuid, type: "station" },
      { uuid: traverse5.uuid, type: "traverse" },
      { uuid: station1.uuid, type: "station" },
      { uuid: traverse6.uuid, type: "traverse" },
      { uuid: station2.uuid, type: "station" },
      { uuid: traverse7.uuid, type: "traverse" },
      { uuid: eva2Ingress.uuid, type: "station" },
    ];
    getMissionDocHandle().change((m) => {
      m.traverses[traverse1.uuid] = traverse1;
      m.traverses[traverse2.uuid] = traverse2;
      m.traverses[traverse3.uuid] = traverse3;
      m.traverses[traverse4.uuid] = traverse4;
      m.traverses[traverse5.uuid] = traverse5;
      m.traverses[traverse6.uuid] = traverse6;
      m.traverses[traverse7.uuid] = traverse7;
      m.stations[station1.uuid] = station1;
      m.stations[station2.uuid] = station2;
      m.stations[station3.uuid] = station3;
      for (const lander of [eva1Egress, eva1Ingress, eva2Egress, eva2Ingress]) {
        m.stations[lander.uuid] = lander;
      }
      m.evas[eva1.uuid] = eva1;
      m.evas[eva2.uuid] = eva2;
    });

    const store = createCustomTestStore({});
    await store.dispatch(thunkDocUpdateTraversesAroundStation({ stationUuid: station1.uuid }));
    await store.dispatch(thunkDocUpdateTraversesAroundStation({ stationUuid: station2.uuid }));
    await store.dispatch(thunkDocUpdateTraversesAroundStation({ stationUuid: station3.uuid }));

    // eva1 traverses
    const t1 = getMission().traverses[traverse1.uuid];
    const t2 = getMission().traverses[traverse2.uuid];
    const t3 = getMission().traverses[traverse3.uuid];
    const t4 = getMission().traverses[traverse4.uuid];
    expect(t1.path).toEqual([{ lat: 3, lng: 3 }, station1.location]);
    expect(t2.path).toEqual([station1.location, station2.location]);
    expect(t3.path).toEqual([station2.location, station3.location]);
    expect(t4.path).toEqual([station3.location, { lat: 3, lng: 3 }]);
    expect(t1.name).toEqual("Lander to Vitest Station-1");
    expect(t2.name).toEqual("Vitest Station-1 to Vitest Station-2");
    expect(t3.name).toEqual("Vitest Station-2 to Vitest Station-3");
    expect(t4.name).toEqual("Vitest Station-3 to Lander");

    // eva2 traverses — must also be updated when dispatching for their shared stations
    const t5 = getMission().traverses[traverse5.uuid];
    const t6 = getMission().traverses[traverse6.uuid];
    const t7 = getMission().traverses[traverse7.uuid];
    expect(t5.path).toEqual([{ lat: 3, lng: 3 }, station1.location]);
    expect(t6.path).toEqual([station1.location, station2.location]);
    expect(t7.path).toEqual([station2.location, { lat: 3, lng: 3 }]);
    expect(t5.name).toEqual("Lander to Vitest Station-1");
    expect(t6.name).toEqual("Vitest Station-1 to Vitest Station-2");
    expect(t7.name).toEqual("Vitest Station-2 to Lander");
  });

  it("thunkDocSaveTraverse() updates the traverse name based on its neighbouring stations", async () => {
    const traverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-1 Modified" });
    const station = generateBlankStation({ name: "Vitest Station-1" });
    const landerEgress = generateBlankStation({
      name: "Lander",
      isLanderXgress: true,
      location: { lat: 3, lng: 3 },
    });
    const eva = generateBlankEVA({ name: "Vitest Eva-1" });
    eva.sequence = [
      { uuid: landerEgress.uuid, type: "station" },
      { uuid: traverse.uuid, type: "traverse" },
      { uuid: station.uuid, type: "station" },
    ];

    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
      m.stations[station.uuid] = station;
      m.stations[landerEgress.uuid] = landerEgress;
      m.evas[eva.uuid] = eva;
    });

    const store = createCustomTestStore({
      eva: {
        ...evaInitialState,
        selectedEvaUuid: eva.uuid,
      },
    });

    await store.dispatch(thunkDocSaveTraverse({ traverseUuid: traverse.uuid }));
    // The traverse runs from the lander stand-in at sequence[0] to the station
    // at sequence[2], so the derived name is "Lander to Vitest Station-1".
    expect(getMission().traverses[traverse.uuid].name).toEqual("Lander to Vitest Station-1");
  });

  it("thunkUICancelTraverse() is a no-op for traverses without an active polyline-edit directive", async () => {
    const traverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-1" });
    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
    });
    const store = createCustomTestStore({});

    // With no active map directive for this traverse, the thunk should not
    // dispatch a map directive update and the traverse should remain untouched.
    await store.dispatch(thunkUICancelTraverse({ traverseUuid: traverse.uuid }));
    expect(getMission().traverses[traverse.uuid]).toEqual(traverse);
    expect(store.getState().map.mapDirective).toBeFalsy();
  });

  it("thunkDocDeleteTraverses() removes traverse + associated actions from automerge", async () => {
    const traverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-1" });
    const traverseAction = generateBlankAction({
      name: "Vitest Traverse Action",
      traverseUuid: traverse.uuid,
    });
    const traverseAction2 = generateBlankAction({
      name: "Vitest Traverse Action 2",
      traverseUuid: traverse.uuid,
    });
    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
      m.actions[traverseAction.uuid] = traverseAction;
      m.actions[traverseAction2.uuid] = traverseAction2;
    });

    const store = createCustomTestStore({});

    await store.dispatch(thunkDocDeleteTraverses({ traverseUuids: [traverse.uuid] }));

    // traverse and its actions all gone from automerge
    expect(getMission().traverses[traverse.uuid]).toBeUndefined();
    expect(getMission().actions[traverseAction.uuid]).toBeUndefined();
    expect(getMission().actions[traverseAction2.uuid]).toBeUndefined();
  });

  // ─── Additional coverage tests ────────────────────────────────────────────

  it("thunkDocUpdateTraverse() returns early when traverse does not exist", async () => {
    // No traverses are set in automerge, so the early-return branch fires
    const store = createCustomTestStore({});
    const result = await store.dispatch(
      thunkDocUpdateTraverse({ traverseUuid: "non-existent-uuid" })
    );
    // Should fulfil but return undefined (early return)
    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(result.payload).toBeUndefined();
  });

  it("thunkDocUpdateTraverse() uses lander/lander fallback when traverse has no path and no custom path provided", async () => {
    // traverse with an empty path (no path property)
    const traverse: Traverse = generateBlankTraverse({ name: "Vitest No-Path Traverse" });
    traverse.path = [];

    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
      // landerLocation is already set by the blank mission fixture: { lat: 3, lng: 3 }
    });

    const store = createCustomTestStore({});
    await store.dispatch(thunkDocUpdateTraverse({ traverseUuid: traverse.uuid, path: null }));

    const result = getMission().traverses[traverse.uuid];
    expect(result.path).toEqual([
      { lat: 3, lng: 3 },
      { lat: 3, lng: 3 },
    ]);
  });

  it("thunkDocSaveTraverse() is a no-op when traverseUuid is falsy", async () => {
    const store = createCustomTestStore({});
    const result = await store.dispatch(thunkDocSaveTraverse({ traverseUuid: "" }));
    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(result.payload).toBeUndefined();
  });

  it("thunkDocSaveTraverse() leaves name unchanged when no EVA is selected (no selectedEvaSequence)", async () => {
    const traverse: Traverse = generateBlankTraverse({ name: "Vitest Original Name" });
    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
    });

    // Store has no selectedEvaUuid, so selectedEvaSequence will be undefined
    const store = createCustomTestStore({
      eva: { ...evaInitialState, selectedEvaUuid: null },
    });

    await store.dispatch(thunkDocSaveTraverse({ traverseUuid: traverse.uuid }));

    // Name resolves to " to " because both stationNameBefore/After remain "".
    // The thunk calls applyUpdateTraverseByField when name differs.
    const result = getMission().traverses[traverse.uuid];
    expect(result.name).toEqual(" to ");
  });

  it("thunkDocSaveTraverse() dispatches saveEditPolyline when an editPolyline directive is active", async () => {
    vi.useFakeTimers();
    const traverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-Save" });
    const station = generateBlankStation({ name: "Vitest Station-1" });
    const eva = generateBlankEVA({ name: "Vitest Eva-1" });
    eva.sequence = [
      { uuid: traverse.uuid, type: "traverse" },
      { uuid: station.uuid, type: "station" },
      { uuid: "randomTraverseUuid2", type: "traverse" },
    ];
    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
      m.stations[station.uuid] = station;
      m.evas[eva.uuid] = eva;
    });

    const store = createCustomTestStore({
      eva: { ...evaInitialState, selectedEvaUuid: eva.uuid },
      map: {
        ...mapInitialState,
        mapDirective: {
          uuid: traverse.uuid,
          mapItemType: "traverse",
          mapAction: "editPolyline",
        },
      },
    });

    const dispatchPromise = store.dispatch(thunkDocSaveTraverse({ traverseUuid: traverse.uuid }));
    // thunkUpdateMapDirective uses setTimeout(200ms) — advance past it
    vi.advanceTimersByTime(300);
    await dispatchPromise;
    vi.useRealTimers();

    // The active editPolyline directive should be updated to saveEditPolyline
    expect(store.getState().map.mapDirective?.mapAction).toBe("saveEditPolyline");
    expect(store.getState().map.mapDirective?.uuid).toBe(traverse.uuid);
  });

  it("thunkUICancelTraverse() dispatches cancelEditPolyline when an editPolyline directive is active", async () => {
    vi.useFakeTimers();
    const traverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-Cancel" });
    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
    });

    const store = createCustomTestStore({
      map: {
        ...mapInitialState,
        mapDirective: {
          uuid: traverse.uuid,
          mapItemType: "traverse",
          mapAction: "editPolyline",
        },
      },
    });

    const dispatchPromise = store.dispatch(thunkUICancelTraverse({ traverseUuid: traverse.uuid }));
    vi.advanceTimersByTime(300);
    await dispatchPromise;
    vi.useRealTimers();

    expect(store.getState().map.mapDirective?.mapAction).toBe("cancelEditPolyline");
    expect(store.getState().map.mapDirective?.uuid).toBe(traverse.uuid);
  });

  it("thunkUICancelTraverse() is a no-op when the active directive belongs to a different traverse", async () => {
    const traverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-A" });
    const otherTraverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-B" });
    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
      m.traverses[otherTraverse.uuid] = otherTraverse;
    });

    const store = createCustomTestStore({
      map: {
        ...mapInitialState,
        mapDirective: {
          uuid: otherTraverse.uuid,
          mapItemType: "traverse",
          mapAction: "editPolyline",
        },
      },
    });

    await store.dispatch(thunkUICancelTraverse({ traverseUuid: traverse.uuid }));

    // Directive for the OTHER traverse should remain untouched
    expect(store.getState().map.mapDirective?.uuid).toBe(otherTraverse.uuid);
    expect(store.getState().map.mapDirective?.mapAction).toBe("editPolyline");
  });

  it("thunkDocDeleteTraverses() is a no-op when given an empty array", async () => {
    const traverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-1" });
    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
    });
    const store = createCustomTestStore({});

    const result = await store.dispatch(thunkDocDeleteTraverses({ traverseUuids: [] }));
    expect(result.meta.requestStatus).toBe("fulfilled");
    // Traverse should still exist
    expect(getMission().traverses[traverse.uuid]).toBeDefined();
  });

  it("thunkDocDeleteTraverses() cancels an active editPolyline directive before deleting", async () => {
    vi.useFakeTimers();
    const traverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-Delete" });
    const traverseAction = generateBlankAction({
      name: "Vitest Action",
      traverseUuid: traverse.uuid,
    });
    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
      m.actions[traverseAction.uuid] = traverseAction;
    });

    const store = createCustomTestStore({
      map: {
        ...mapInitialState,
        mapDirective: {
          uuid: traverse.uuid,
          mapItemType: "traverse",
          mapAction: "editPolyline",
        },
      },
    });

    const dispatchPromise = store.dispatch(
      thunkDocDeleteTraverses({ traverseUuids: [traverse.uuid] })
    );
    vi.advanceTimersByTime(300);
    await dispatchPromise;
    vi.useRealTimers();

    // Traverse deleted from automerge
    expect(getMission().traverses[traverse.uuid]).toBeUndefined();
    expect(getMission().actions[traverseAction.uuid]).toBeUndefined();
    // Directive was cancelled (set to cancelEditPolyline) by the thunk
    expect(store.getState().map.mapDirective?.mapAction).toBe("cancelEditPolyline");
  });

  it("thunkDocDeleteTraverses() does not cancel directive when uuid matches a different traverse", async () => {
    const traverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-Del-A" });
    const otherTraverse: Traverse = generateBlankTraverse({ name: "Vitest Traverse-Del-B" });
    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
      m.traverses[otherTraverse.uuid] = otherTraverse;
    });

    const store = createCustomTestStore({
      map: {
        ...mapInitialState,
        mapDirective: {
          uuid: otherTraverse.uuid,
          mapItemType: "traverse",
          mapAction: "editPolyline",
        },
      },
    });

    await store.dispatch(thunkDocDeleteTraverses({ traverseUuids: [traverse.uuid] }));

    // traverse deleted, but the directive for the other traverse should remain
    expect(getMission().traverses[traverse.uuid]).toBeUndefined();
    expect(store.getState().map.mapDirective?.uuid).toBe(otherTraverse.uuid);
    expect(store.getState().map.mapDirective?.mapAction).toBe("editPolyline");
  });

  it("thunkDocUpdateTraversesAroundStation() with evaUuid filters to only that EVA", async () => {
    const traverse1 = generateBlankTraverse({ name: "Vitest Eva1 Traverse-Before" });
    const traverse2 = generateBlankTraverse({ name: "Vitest Eva1 Traverse-After" });
    const traverse3 = generateBlankTraverse({ name: "Vitest Eva2 Traverse-Before" });
    const traverse4 = generateBlankTraverse({ name: "Vitest Eva2 Traverse-After" });
    const station: Station = generateBlankStation({
      name: "Vitest Shared Station",
      location: { lat: 4, lng: 4 },
    });
    const eva1 = generateBlankEVA({ name: "Vitest Eva-1" });
    eva1.sequence = [
      { uuid: traverse1.uuid, type: "traverse" },
      { uuid: station.uuid, type: "station" },
      { uuid: traverse2.uuid, type: "traverse" },
    ];
    const eva2 = generateBlankEVA({ name: "Vitest Eva-2" });
    eva2.sequence = [
      { uuid: traverse3.uuid, type: "traverse" },
      { uuid: station.uuid, type: "station" },
      { uuid: traverse4.uuid, type: "traverse" },
    ];
    getMissionDocHandle().change((m) => {
      m.traverses[traverse1.uuid] = traverse1;
      m.traverses[traverse2.uuid] = traverse2;
      m.traverses[traverse3.uuid] = traverse3;
      m.traverses[traverse4.uuid] = traverse4;
      m.stations[station.uuid] = station;
      m.evas[eva1.uuid] = eva1;
      m.evas[eva2.uuid] = eva2;
    });

    const store = createCustomTestStore({});
    // Only update traverses around station for eva1
    await store.dispatch(
      thunkDocUpdateTraversesAroundStation({ stationUuid: station.uuid, evaUuid: eva1.uuid })
    );

    // eva1 traverses should have been updated by thunkDocUpdateTraverse
    // path gets at least 2 points (lander→lander since no station locations given)
    expect(getMission().traverses[traverse1.uuid].path.length).toBeGreaterThanOrEqual(2);
    expect(getMission().traverses[traverse2.uuid].path.length).toBeGreaterThanOrEqual(2);

    // eva2 traverses must NOT have been touched: their updatedAt is unchanged
    expect(getMission().traverses[traverse3.uuid].updatedAt).toBe(traverse3.updatedAt);
    expect(getMission().traverses[traverse4.uuid].updatedAt).toBe(traverse4.updatedAt);
    // and their paths are still empty (blank default)
    expect(getMission().traverses[traverse3.uuid].path).toHaveLength(0);
    expect(getMission().traverses[traverse4.uuid].path).toHaveLength(0);
  });

  it("thunkDocUpdateTraversesAroundStation() handles station not found in any EVA sequence gracefully", async () => {
    const station: Station = generateBlankStation({
      name: "Vitest Orphan Station",
      location: { lat: 7, lng: 7 },
    });
    const eva = generateBlankEVA({ name: "Vitest Eva-1" });
    const traverse = generateBlankTraverse({ name: "Vitest Unrelated Traverse" });
    eva.sequence = [{ uuid: traverse.uuid, type: "traverse" }];
    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
      m.stations[station.uuid] = station;
      m.evas[eva.uuid] = eva;
    });

    const store = createCustomTestStore({});
    // Station is not in any EVA sequence → loop finds no match, nothing updated
    const result = await store.dispatch(
      thunkDocUpdateTraversesAroundStation({ stationUuid: station.uuid })
    );
    expect(result.meta.requestStatus).toBe("fulfilled");
    // Traverse should be untouched (path is still the blank default)
    expect(getMission().traverses[traverse.uuid].name).toBe("Vitest Unrelated Traverse");
  });
});
