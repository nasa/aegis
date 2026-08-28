import { createCustomTestStore } from "../../fixtures/store";
import {
  thunkDocCreateRex,
  thunkDocDeleteRex,
  thunkUIJumpToRunningRex,
  thunkDocAddRexStatusEntry,
  thunkDocAddRexActionMass,
  thunkDocCreateInitialPosEntries,
} from "store/thunk/thunkRex";
import { v4 as uuidv4 } from "uuid";
import { generateBlankPosEntry, generateBlankRex } from "store/storeUtils/rex";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import { applyRexPetStartStop } from "operations/apply/apply-rex";

// Mock thunkDocDuplicateEva so we can control its return value in specific tests.
const mockThunkDocDuplicateEva = vi.fn();
vi.mock("store/thunk/thunkEva", async () => {
  const actual = await vi.importActual("store/thunk/thunkEva");
  return {
    ...(actual as object),
    thunkDocDuplicateEva: () => mockThunkDocDuplicateEva,
  };
});

const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => true);

const getMission = (): Mission => getMissionDocHandle().doc();

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  // wipe automerge to a known-empty state for each test
  getMissionDocHandle().change((m) => {
    m.stations = {};
    m.traverses = {};
    m.evas = {};
    m.actions = {};
    m.pois = {};
    m.rexes = {};
  });

  // By default, let thunkDocDuplicateEva succeed (the real implementation is used
  // in the existing success-path test; this default is for the mocked tests).
  mockThunkDocDuplicateEva.mockResolvedValue({ meta: { requestStatus: "fulfilled" } });
});

afterAll(() => {
  vi.restoreAllMocks();
  alertSpy.mockRestore();
});

describe("Thunk Rex Tests", () => {
  describe("thunkDocCreateRex", () => {
    test("duplicates the EVA and creates a new Rex pointing at it", async () => {
      const eva = generateBlankEVA();
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
      });

      const store = createCustomTestStore({});

      await store.dispatch(thunkDocCreateRex({ asPlannedEvaUuid: eva.uuid }));

      // A new rex should exist on automerge
      const rexes = Object.values(getMission().rexes);
      expect(rexes.length).toEqual(1);
      const newRex = rexes[0];
      expect(newRex.evaUuid).not.toEqual(eva.uuid);
      expect(store.getState().rex.selectedRexUuid).toEqual(newRex.uuid);
      expect(store.getState().interface.rightPanelIsOpen).toEqual(true);

      // The original eva should have been duplicated (with the same refUuid but
      // a new uuid) so the rex has its own private copy.
      const evas = Object.values(getMission().evas);
      expect(evas.length).toEqual(2);
      expect(evas[0].refUuid).toEqual(evas[1].refUuid);
      expect(evas[0].uuid).not.toEqual(evas[1].uuid);
      expect(newRex.evaUuid).toEqual(evas.find((e) => e.uuid !== eva.uuid)?.uuid);
    });

    test("rejects when the source EVA does not exist in the doc", async () => {
      const store = createCustomTestStore({});
      const result = await store.dispatch(
        thunkDocCreateRex({ asPlannedEvaUuid: uuidv4() /* not in the doc */ })
      );

      // The thunk should produce a rejected action
      expect(result.meta.requestStatus).toBe("rejected");
      // No rex should have been created
      expect(Object.values(getMission().rexes).length).toBe(0);
    });
  });

  describe("thunkDocDeleteRex", () => {
    test("removes the rex and its associated rex-eva from automerge", async () => {
      const eva = generateBlankEVA();
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });

      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({});

      // delete the rex
      await store.dispatch(thunkDocDeleteRex({ rexUuid: rex.uuid }));
      expect(store.getState().rex.selectedRexUuid).toBeNull();
      expect(getMission().rexes[rex.uuid]).toBeUndefined();
      expect(getMission().evas[eva.uuid]).toBeUndefined();
    });

    test("is a no-op when rexUuid is empty/falsy", async () => {
      const eva = generateBlankEVA();
      const rex = generateBlankRex({ name: "Vitest Rex", evaUuid: eva.uuid });
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({});
      // Pass an empty string — should early-return without touching automerge
      await store.dispatch(thunkDocDeleteRex({ rexUuid: "" as string }));

      expect(getMission().rexes[rex.uuid]).toBeDefined();
      expect(getMission().evas[eva.uuid]).toBeDefined();
      expect(store.getState().rex.selectedRexUuid).toBeNull();
    });

    test("is a no-op when rexUuid does not exist in automerge", async () => {
      const eva = generateBlankEVA();
      const rex = generateBlankRex({ name: "Vitest Rex", evaUuid: eva.uuid });
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({});
      // Pass a uuid that doesn't exist in automerge
      await store.dispatch(thunkDocDeleteRex({ rexUuid: "non-existent-uuid" }));

      // Existing rex and eva should still be present
      expect(getMission().rexes[rex.uuid]).toBeDefined();
      expect(getMission().evas[eva.uuid]).toBeDefined();
    });

    test("dispatches setOnlyShowRunningRex(false) when deleting a running rex while showRunningRexOnly is true", async () => {
      const eva = generateBlankEVA();
      const rex = generateBlankRex({
        name: "Vitest Running Rex",
        evaUuid: eva.uuid,
        isRunning: true,
      });
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      // Pre-seed the store with showRunningRexOnly: true
      const store = createCustomTestStore({
        eva: {
          selectedEvaRightNavItem: "info_panel",
          selectedEvaUuid: eva.uuid,
          selectedEvaSequenceItemUuid: null,
          expandedEvaUuids: [],
          evaDropdownUIStates: {},
          showRunningRexOnly: true,
          runningRexExpanded: true,
        },
      });

      await store.dispatch(thunkDocDeleteRex({ rexUuid: rex.uuid }));

      expect(store.getState().eva.showRunningRexOnly).toBe(false);
      expect(getMission().rexes[rex.uuid]).toBeUndefined();
      expect(getMission().evas[eva.uuid]).toBeUndefined();
    });
  });

  describe("thunkUIJumpToRunningRex", () => {
    test("selects the running rex and its eva", async () => {
      const eva = generateBlankEVA();
      const runningRex = generateBlankRex({
        name: "Vitest Running Rex",
        evaUuid: eva.uuid,
        isRunning: true,
      });
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[runningRex.uuid] = runningRex;
      });

      const store = createCustomTestStore({});

      await store.dispatch(thunkUIJumpToRunningRex());

      expect(store.getState().rex.selectedRexUuid).toBe(runningRex.uuid);
      expect(store.getState().eva.selectedEvaUuid).toBe(eva.uuid);
      expect(store.getState().eva.showRunningRexOnly).toBe(true);
      expect(store.getState().eva.selectedEvaSequenceItemUuid).toBeNull();
      expect(store.getState().rex.selectedPosEntryUuid).toBeNull();
      expect(store.getState().interface.sectionSelectedLabel).toBe("evas");
    });

    test("is a no-op when no running rex exists", async () => {
      const eva = generateBlankEVA();
      // Rex with isRunning: false (default)
      const rex = generateBlankRex({ name: "Vitest Non-Running Rex", evaUuid: eva.uuid });
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({});
      const initialState = store.getState();

      await store.dispatch(thunkUIJumpToRunningRex());

      // State should be unchanged
      expect(store.getState().rex.selectedRexUuid).toBe(initialState.rex.selectedRexUuid);
      expect(store.getState().eva.selectedEvaUuid).toBe(initialState.eva.selectedEvaUuid);
      expect(store.getState().eva.showRunningRexOnly).toBe(false);
    });
  });

  describe("applyRexPetStartStop (via withMissionChange)", () => {
    test("toggles petRunning and updates petValueAtStartStop on the doc", () => {
      const eva = generateBlankEVA();
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      withMissionChange((m) =>
        applyRexPetStartStop(m, { rexUuid: rex.uuid, directive: "start", petValue: "+00:10:00" })
      );
      let updatedRex = getMission().rexes[rex.uuid];
      expect(updatedRex.petValueAtStartStop).toEqual("+00:10:00");
      expect(updatedRex.petRunning).toBeTruthy();
      expect(updatedRex.petStartStopTimestamp).toBeTruthy();

      withMissionChange((m) =>
        applyRexPetStartStop(m, { rexUuid: rex.uuid, directive: "stop", petValue: "+00:15:00" })
      );
      updatedRex = getMission().rexes[rex.uuid];
      expect(updatedRex.petValueAtStartStop).toEqual("+00:15:00");
      expect(updatedRex.petRunning).toBeFalsy();
      expect(updatedRex.petStartStopTimestamp).toBeTruthy();
    });
  });

  describe("thunkDocAddRexStatusEntry and thunkDocAddRexActionMass", () => {
    test("write entries on the doc", async () => {
      const eva = generateBlankEVA();
      const runningRex = generateBlankRex({
        name: "Vitest Rex-1",
        isRunning: true,
        evaUuid: eva.uuid,
      });
      getMissionDocHandle().change((m) => {
        m.evas[eva.uuid] = eva;
        m.rexes[runningRex.uuid] = runningRex;
      });

      const store = createCustomTestStore({
        rex: {
          selectedRexUuid: runningRex.uuid,
          selectedPosEntryUuid: null,
          posEntryInEdit: null,
        },
      });

      const stationUuid = uuidv4();
      const traverseUuid = uuidv4();
      const actionUuid = uuidv4();

      // station status
      await store.dispatch(
        thunkDocAddRexStatusEntry({
          entryType: "station",
          uuid: stationUuid,
          rexStatus: "in-progress",
        })
      );
      expect(getMission().rexes[runningRex.uuid].stationEntries[stationUuid].rexStatus).toBe(
        "in-progress"
      );

      // traverse status
      await store.dispatch(
        thunkDocAddRexStatusEntry({
          entryType: "traverse",
          uuid: traverseUuid,
          rexStatus: "in-progress",
        })
      );
      expect(getMission().rexes[runningRex.uuid].traverseEntries[traverseUuid].rexStatus).toBe(
        "in-progress"
      );

      // action status + mass
      await store.dispatch(
        thunkDocAddRexStatusEntry({
          entryType: "action",
          uuid: actionUuid,
          rexStatus: "in-progress",
        })
      );
      expect(getMission().rexes[runningRex.uuid].actionEntries[actionUuid].rexStatus).toBe(
        "in-progress"
      );
      await store.dispatch(thunkDocAddRexActionMass({ uuid: actionUuid, mass: 999 }));
      expect(getMission().rexes[runningRex.uuid].actionEntries[actionUuid].mass).toBe(999);

      // complete the action — mass should remain
      await store.dispatch(
        thunkDocAddRexStatusEntry({ entryType: "action", uuid: actionUuid, rexStatus: "complete" })
      );
      expect(getMission().rexes[runningRex.uuid].actionEntries[actionUuid].rexStatus).toBe(
        "complete"
      );
      expect(getMission().rexes[runningRex.uuid].actionEntries[actionUuid].mass).toBe(999);

      // Sanity: redux store rex slice still selected
      expect(store.getState().rex.selectedRexUuid).toBe(runningRex.uuid);
    });
  });

  describe("thunkDocCreateInitialPosEntries", () => {
    it("creates one pos entry per posSource on the running rex, at the egress station location", async () => {
      const station = generateBlankStation({
        name: "Vitest Egress Station",
        location: { lat: 10, lng: 20 },
      });
      const eva = generateBlankEVA({
        name: "Vitest Eva",
        sequence: [{ type: "station", uuid: station.uuid }],
      });
      const rex = generateBlankRex({ name: "Vitest Running", isRunning: true, evaUuid: eva.uuid });
      getMissionDocHandle().change((m) => {
        m.stations[station.uuid] = station;
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({});
      await store.dispatch(thunkDocCreateInitialPosEntries({ rexUuid: rex.uuid }));

      const entries = getMission().rexes[rex.uuid].posEntries;
      // generateBlankRex creates 3 posSources, so we get 3 entries
      expect(entries.length).toBe(rex.posSources.length);
      // each entry is placed at the egress station's location
      expect(entries[0].location).toEqual({ lat: 10, lng: 20 });
      // each entry references all posTypes
      expect(entries[0].posTypeUuids.length).toBe(rex.posTypes.length);
    });

    it("places pos entries at the lander station's location when egressing at the lander", async () => {
      // A lander egress is an ordinary station that happens to be pinned to the
      // lander; moving the lander repositions it, so its stored location is
      // authoritative here.
      const landerStation = generateBlankStation({
        name: "Egress",
        isLanderXgress: true,
        location: { lat: 1, lng: 2 },
      });
      const eva = generateBlankEVA({
        name: "Vitest Eva",
        sequence: [{ type: "station", uuid: landerStation.uuid }],
      });
      const rex = generateBlankRex({ name: "Vitest Running", isRunning: true, evaUuid: eva.uuid });
      getMissionDocHandle().change((m) => {
        m.landerLocation = { lat: 1, lng: 2 };
        m.stations[landerStation.uuid] = landerStation;
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({});
      await store.dispatch(thunkDocCreateInitialPosEntries({ rexUuid: rex.uuid }));

      const entries = getMission().rexes[rex.uuid].posEntries;
      expect(entries[0].location).toEqual({ lat: 1, lng: 2 });
    });

    it("appends to existing pos entries rather than replacing them", async () => {
      const landerStation = generateBlankStation({ name: "Egress", isLanderXgress: true });
      const eva = generateBlankEVA({
        name: "Vitest Eva",
        sequence: [{ type: "station", uuid: landerStation.uuid }],
      });
      const rex = generateBlankRex({ name: "Vitest Running", isRunning: true, evaUuid: eva.uuid });
      const preExisting = generateBlankPosEntry({ posTypeUuids: [rex.posTypes[0].uuid] });
      rex.posEntries = [preExisting];
      getMissionDocHandle().change((m) => {
        m.landerLocation = { lat: 0, lng: 0 };
        m.stations[landerStation.uuid] = landerStation;
        m.evas[eva.uuid] = eva;
        m.rexes[rex.uuid] = rex;
      });

      const store = createCustomTestStore({});
      await store.dispatch(thunkDocCreateInitialPosEntries({ rexUuid: rex.uuid }));

      const entries = getMission().rexes[rex.uuid].posEntries;
      expect(entries.length).toBe(1 + rex.posSources.length);
      expect(entries[0].uuid).toBe(preExisting.uuid);
    });
  });
});
