import { createCustomTestStore } from "../../fixtures/redux/makeTestStore";
import { initialState as rexInitialState } from "store/rex";
import { initialState as evaInitialState } from "store/eva";
import { initialState as stationInitialState } from "store/station";
import { initialState as traverseInitialState } from "store/traverse";
import { initialState as missionInitialState } from "store/mission";
import {
  thunkAddRexActionMass,
  thunkAddRexStatusEntry,
  thunkCancelRex,
  thunkCreateRex,
  thunkDeleteRex,
  thunkRexPetStartStop,
  thunkSaveRex,
} from "store/thunk/thunkRex";
import { v4 as uuidv4 } from "uuid";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the vi.mock
vi.mock("http-client/rex");
vi.mock("http-client/eva");
import * as httpClient_rex from "http-client/rex";
import * as httpClient_eva from "http-client/eva";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankEVA } from "store/storeUtils/eva";
import { setMissionAutomergeDocHandle } from "client/automergeDocHandles";

//I don't understand what is even calling this that is causing me to mock it
vi.mock("string-strip-html", () => ({
  stripHtml: () => vi.fn(),
}));

const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {
  return true;
});

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
});

afterAll(() => {
  vi.restoreAllMocks();
  alertSpy.mockRestore();
});

describe("Thunk Rex Tests", () => {
  test("thunkCreateRex", async () => {
    const eva = generateBlankEVA();
    const store = createCustomTestStore({
      mission: { ...missionInitialState },
      rex: { ...rexInitialState },
      eva: { ...evaInitialState, evas: [eva] },
      station: { ...stationInitialState },
      traverse: { ...traverseInitialState },
    });
    await store.dispatch(thunkCreateRex({ asPlannedEvaUuid: eva.uuid }));

    // check that the new rex is in the store
    expect(store.getState().rex.rexes.length).toEqual(1);
    const newRexUuid = store.getState().rex.rexes[0].uuid;
    expect(store.getState().rex.rexes[0].evaUuid).not.toEqual(eva.uuid);
    expect(store.getState().rex.selectedRexUuid).toEqual(newRexUuid);
    expect(store.getState().interface.rightPanelIsOpen).toEqual(true);

    // the eva should have been duplicated automatically with a new uuid and same refUuid
    expect(store.getState().eva.evas.length).toEqual(2);
    expect(store.getState().eva.evas[0].refUuid).toEqual(store.getState().eva.evas[1].refUuid);
    expect(store.getState().eva.evas[0].uuid).not.toEqual(store.getState().eva.evas[1].uuid);
  });

  test("thunkSaveRex", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
    const rexModified = { ...rex, name: "Vitest Rex-1 Modified" };
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rexModified],
        rexesFromDb: [rex],
        selectedRexUuid: rex.uuid,
      },
    });
    await store.dispatch(thunkSaveRex({ rexUuid: rexModified.uuid }));
    expect(httpClient_rex.upsertRexes).toHaveBeenCalledTimes(1);
    const savedRex = store.getState().rex.rexesFromDb.find((r) => r.uuid === rex.uuid);
    expect(savedRex.name).toEqual("Vitest Rex-1 Modified");
  });

  test("thunkCancelRex", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
    const rexModified = { ...rex, name: "Vitest Rex-1 Modified" };
    const evaUnsaved = generateBlankEVA();
    const rexUnsaved = generateBlankRex({ name: "Vitest Rex-1", evaUuid: evaUnsaved.uuid });
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rexModified, rexUnsaved],
        rexesFromDb: [rex],
      },
      eva: {
        ...evaInitialState,
        evas: [eva, evaUnsaved],
        evasFromDb: [eva],
      },
    });

    // cancel the modified rex
    await store.dispatch(thunkCancelRex({ rexUuid: rexModified.uuid }));
    expect(store.getState().rex.rexes.find((r) => r.uuid === rexModified.uuid).name).toEqual(
      "Vitest Rex-1"
    );
    expect(
      store
        .getState()
        .eva.evas.map((e) => e.uuid)
        .includes(evaUnsaved.uuid)
    ).toBeTruthy();

    // cancel the unsaved rex
    await store.dispatch(thunkCancelRex({ rexUuid: rexUnsaved.uuid }));
    expect(
      store
        .getState()
        .rex.rexesFromDb.map((r) => r.uuid)
        .includes(rexUnsaved.uuid)
    ).toBeFalsy();
    expect(
      store
        .getState()
        .rex.rexes.map((r) => r.uuid)
        .includes(rexUnsaved.uuid)
    ).toBeFalsy();
    expect(
      store
        .getState()
        .eva.evas.map((e) => e.uuid)
        .includes(evaUnsaved.uuid)
    ).toBeFalsy();
    expect(
      store
        .getState()
        .eva.evasFromDb.map((e) => e.uuid)
        .includes(evaUnsaved.uuid)
    ).toBeFalsy();
  });

  test("thunkDeleteRex", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
    const rexModified = { ...rex, name: "Vitest Rex-1 Modified" };
    const evaUnsaved = generateBlankEVA();
    const rexUnsaved = generateBlankRex({ name: "Vitest Rex-1", evaUuid: evaUnsaved.uuid });
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rexModified, rexUnsaved],
        rexesFromDb: [rex],
        selectedRexUuid: rex.uuid,
      },
      eva: {
        ...evaInitialState,
        evas: [eva, evaUnsaved],
        evasFromDb: [eva],
      },
    });

    // delete modified Rex
    await store.dispatch(thunkDeleteRex({ rexUuid: rexModified.uuid }));
    expect(store.getState().rex.selectedRexUuid).toBeNull();
    expect(
      store
        .getState()
        .rex.rexesFromDb.map((r) => r.uuid)
        .includes(rex.uuid)
    ).toBeFalsy();
    expect(
      store
        .getState()
        .rex.rexes.map((r) => r.uuid)
        .includes(rex.uuid)
    ).toBeFalsy();
    expect(httpClient_rex.deleteRexes).toHaveBeenCalledTimes(1);
    expect(
      store
        .getState()
        .eva.evasFromDb.map((e) => e.uuid)
        .includes(eva.uuid)
    ).toBeFalsy();
    expect(
      store
        .getState()
        .eva.evas.map((e) => e.uuid)
        .includes(eva.uuid)
    ).toBeFalsy();
    expect(httpClient_eva.deleteEvas).toHaveBeenCalledTimes(1);

    // delete unsaved rex
    await store.dispatch(thunkDeleteRex({ rexUuid: rexUnsaved.uuid }));
    expect(
      store
        .getState()
        .rex.rexes.map((r) => r.uuid)
        .includes(rexUnsaved.uuid)
    ).toBeFalsy();
    expect(
      store
        .getState()
        .eva.evas.map((e) => e.uuid)
        .includes(rexUnsaved.uuid)
    ).toBeFalsy();
  });

  test("thunkRexPetStartStop", async () => {
    const eva = generateBlankEVA();
    const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [rex],
        rexesFromDb: [rex],
      },
      eva: { ...evaInitialState, evas: [eva], evasFromDb: [eva] },
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

  test("thunkAddRexStatusEntry and thunkAddRexActionMass", async () => {
    const eva = generateBlankEVA();
    const runningRex = generateBlankRex({
      name: "Vitest Rex-1",
      isRunning: true,
      evaUuid: eva.uuid,
    });
    const store = createCustomTestStore({
      rex: {
        ...rexInitialState,
        rexes: [runningRex],
        rexesFromDb: [runningRex],
        selectedRexUuid: runningRex.uuid,
      },
    });

    const stationUuid = uuidv4();
    const traverseUuid = uuidv4();
    const actionUuid = uuidv4();

    // check station states
    await store.dispatch(
      thunkAddRexStatusEntry({ entryType: "station", uuid: stationUuid, rexStatus: "in-progress" })
    );
    expect(store.getState().rex.rexes[0].stationEntries[stationUuid].rexStatus).toBe("in-progress");

    //assert traverse states
    await store.dispatch(
      thunkAddRexStatusEntry({
        entryType: "traverse",
        uuid: traverseUuid,
        rexStatus: "in-progress",
      })
    );
    expect(store.getState().rex.rexes[0].traverseEntries[traverseUuid].rexStatus).toBe(
      "in-progress"
    );

    // assert action states and saving mass
    await store.dispatch(
      thunkAddRexStatusEntry({ entryType: "action", uuid: actionUuid, rexStatus: "in-progress" })
    );
    expect(store.getState().rex.rexes[0].actionEntries[actionUuid].rexStatus).toBe("in-progress");
    await store.dispatch(thunkAddRexActionMass({ uuid: actionUuid, mass: 999 }));
    expect(store.getState().rex.rexes[0].actionEntries[actionUuid].rexStatus).toBe("in-progress");
    expect(store.getState().rex.rexes[0].actionEntries[actionUuid].mass).toBe(999);
    await store.dispatch(
      thunkAddRexStatusEntry({ entryType: "action", uuid: actionUuid, rexStatus: "complete" })
    );
    expect(store.getState().rex.rexes[0].actionEntries[actionUuid].rexStatus).toBe("complete");
    expect(store.getState().rex.rexes[0].actionEntries[actionUuid].mass).toBe(999);

    // assert xgress states
    await store.dispatch(
      thunkAddRexStatusEntry({ entryType: "xgress", uuid: "ingress", rexStatus: "in-progress" })
    );
    expect(store.getState().rex.rexes[0].xgressEntries["ingress"].rexStatus).toBe("in-progress");

    // assert everything was saved to the fromDb copy in the store
    expect(store.getState().rex.rexes[0]).toEqual(store.getState().rex.rexesFromDb[0]);
  });

  // test("thunkMakeExportRexString", async () => {});
});
