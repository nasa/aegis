/**
 * Browser-mode tests for `MapPositionMenu` (the Positions tab of the floating Rex Menu widget).
 *
 * The widget is available without a REX, so the menu must render a placeholder when no REX is
 * selected or the selected REX is missing (e.g. the EVA dropdown just switched from a REX back
 * to As Planned). It previously dereferenced `selectedRex.isRunning` unconditionally and crashed.
 */

import { configureStore } from "@reduxjs/toolkit";
import { flushSync } from "react-dom";
import { Provider } from "react-redux";
import { MapPositionMenu } from "components/interface/map/overlays/map-menu-pos";
import { userSlice } from "store/user";
import { rexSlice } from "store/rex";
import { mapSlice } from "store/map";
import { hoverSlice } from "store/hover";
import { evaSlice } from "store/eva";
import { createReactHarness, type ReactHarness } from "../map/helpers/reactBrowserHarness";

// Mutable mock Automerge doc — tests populate rexes here before rendering.
const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

const addPosEntry = vi.fn(() => ({ type: "mock/addPosEntry" }));
const editPosEntry = vi.fn((args: { posEntryUuid: string }) => ({
  type: "mock/editPosEntry",
  payload: args,
}));
vi.mock("store/thunk/thunkRexPosEntry", () => ({
  thunkAddPosEntry: () => addPosEntry(),
  thunkEditPosEntry: (args: { posEntryUuid: string }) => editPosEntry(args),
  thunkCancelPosEntryEdit: () => ({ type: "mock/cancelPosEntryEdit" }),
  thunkCancelPosEntryMapDirective: () => ({ type: "mock/cancelPosEntryMapDirective" }),
  thunkStartPosEntryMapDirective: () => ({ type: "mock/startPosEntryMapDirective" }),
  thunkSetPosEntryEditLocation: () => ({ type: "mock/setPosEntryEditLocation" }),
  thunkSavePosEntryEdit: () => ({ type: "mock/savePosEntryEdit" }),
  thunkDeletePosEntry: () => ({ type: "mock/deletePosEntry" }),
}));
vi.mock("store/thunk/crossThunk", () => ({
  thunkSelectEVASequenceItem: () => ({ type: "mock/selectEvaSequenceItem" }),
}));

const REX_UUID = "rex-uuid-pos-menu-1";
const EV1 = { uuid: "ev1", abbr: "1", name: "EV1", icon: "1f468", pathColor: "#ff0000" };
const EV2 = { uuid: "ev2", abbr: "2", name: "EV2", icon: "1f469", pathColor: "#ffffff" };
const TASK = { uuid: "task", abbr: "T", name: "Task", pathColor: "#0062B1" };

function makeEntry(uuid: string, petSeconds: number, posTypeUuids: string[]): PosEntry {
  return {
    uuid,
    location: { lat: 1, lng: 2 },
    elevation: null,
    petSeconds,
    posTypeUuids,
    posSourceUuid: TASK.uuid,
    uncertaintyMeters: 0,
    color: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function setRex(overrides: Partial<Rex> = {}) {
  mockMissionDoc.rexes = {
    [REX_UUID]: {
      uuid: REX_UUID,
      name: "Amber",
      evaUuid: "eva-uuid-1",
      isRunning: true,
      petRunning: false,
      petValueAtStartStop: "+00:10:00",
      posSources: [TASK],
      posTypes: [EV1, EV2],
      posEntries: [],
      ...overrides,
    } as unknown as Mission["rexes"][string],
  };
}

const rowUuids = (groupTestId: string) =>
  [
    ...harness.container.querySelectorAll<HTMLElement>(
      `[data-testid='${groupTestId}'] [data-testid^='position-row-']`
    ),
  ].map((row) => row.dataset.testid!.replace("position-row-", ""));

function makeStore() {
  return configureStore({
    reducer: {
      user: userSlice.reducer,
      rex: rexSlice.reducer,
      map: mapSlice.reducer,
      hover: hoverSlice.reducer,
      eva: evaSlice.reducer,
    },
    preloadedState: {
      user: {
        missionPerms: { missionId: 1, permissions: { view: true, edit: true } },
      },
      rex: {
        selectedRexUuid: REX_UUID,
        selectedPosEntryUuid: null,
        expandedPosEntryUuid: null,
        posEntryInEdit: null,
      },
    },
  });
}

let harness: ReactHarness;

function renderMapPositionMenu(store: ReturnType<typeof makeStore>) {
  harness.render(
    <Provider store={store}>
      <MapPositionMenu />
    </Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  harness = createReactHarness();
  Object.keys(mockMissionDoc).forEach((k) => {
    delete (mockMissionDoc as Record<string, unknown>)[k];
  });
});

afterEach(() => {
  harness.unmount();
});

describe("MapPositionMenu", () => {
  it("shows the select-a-REX placeholder (does not throw) when the selected REX no longer exists", () => {
    // Simulates switching the EVA dropdown back to As Planned: selectedRexUuid is still set for
    // one render, but the REX has already been removed from the mission doc.
    mockMissionDoc.rexes = {};
    const store = makeStore();

    expect(() => renderMapPositionMenu(store)).not.toThrow();
    expect(harness.container.querySelector("[data-testid='positions-menu']")).toBeNull();
    expect(harness.container.querySelector("[data-testid='positions-no-rex']")?.textContent).toBe(
      "Select a REX to see positions."
    );
  });

  it("renders the positions menu once a matching REX exists", () => {
    mockMissionDoc.rexes = {
      [REX_UUID]: {
        uuid: REX_UUID,
        name: "Amber",
        evaUuid: "eva-uuid-1",
        isRunning: true,
        posSources: [],
        posTypes: [],
        posEntries: [],
      } as unknown as Mission["rexes"][string],
    };
    const store = makeStore();

    renderMapPositionMenu(store);
    expect(harness.container.querySelector("[data-testid='positions-menu']")).not.toBeNull();
  });

  it("pins each pos type's latest entry by PET and lists the rest newest first", () => {
    setRex({
      posEntries: [
        makeEntry("e1", 100, [EV1.uuid]),
        makeEntry("e2", 200, [EV1.uuid, EV2.uuid]),
        makeEntry("e3", 50, [EV2.uuid]),
        makeEntry("e4", 300, [EV1.uuid]),
      ],
    });
    renderMapPositionMenu(makeStore());

    expect(rowUuids("position-group-latest")).toEqual(["e4", "e2"]);
    expect(rowUuids("position-group-earlier")).toEqual(["e1", "e3"]);
    // # counts up from the oldest PET.
    const e4Row = harness.container.querySelector("[data-testid='position-row-e4']")!;
    expect(e4Row.querySelector("td")!.textContent).toBe("4");
    expect(e4Row.textContent).toContain("+00:05:00");
    expect(e4Row.textContent).toContain("EV1");
  });

  it("collapses the Earlier group", () => {
    setRex({ posEntries: [makeEntry("e1", 100, [EV1.uuid]), makeEntry("e2", 200, [EV1.uuid])] });
    renderMapPositionMenu(makeStore());

    const toggle = harness.container.querySelector<HTMLButtonElement>(
      "[data-testid='position-group-earlier'] button"
    )!;
    expect(toggle.textContent).toBe("Earlier (1)");
    flushSync(() => toggle.click());
    expect(rowUuids("position-group-earlier")).toEqual([]);
  });

  it("adds a position only while the REX is running", () => {
    setRex({ isRunning: false });
    renderMapPositionMenu(makeStore());
    const addButton = () =>
      harness.container.querySelector<HTMLElement>("[aria-label='Position']")!;
    expect(addButton().getAttribute("aria-disabled")).toBe("true");
    flushSync(() => addButton().click());
    expect(addPosEntry).not.toHaveBeenCalled();

    harness.unmount();
    harness = createReactHarness();
    setRex({ isRunning: true });
    renderMapPositionMenu(makeStore());
    flushSync(() => addButton().click());
    expect(addPosEntry).toHaveBeenCalledTimes(1);
  });

  it("shows the new-position editor above the table with the draft's types selected", () => {
    setRex();
    const store = makeStore();
    store.dispatch(
      rexSlice.actions.setPosEntryInEdit({
        uuid: "draft",
        rexUuid: REX_UUID,
        isNew: true,
        values: {
          location: null,
          elevation: null,
          petSeconds: 600,
          posTypeUuids: [EV2.uuid],
          posSourceUuid: TASK.uuid,
          uncertaintyMeters: 5,
          color: null,
        },
        base: null,
        elevationPending: false,
      })
    );
    renderMapPositionMenu(store);

    const editor = harness.container.querySelector("[data-testid='position-editor']")!;
    expect(editor.textContent).toContain("Add Position");
    const pressed = [...editor.querySelectorAll("[data-testid='position-editor-types'] button")]
      .filter((button) => button.getAttribute("aria-pressed") === "true")
      .map((button) => button.getAttribute("aria-label"));
    expect(pressed).toEqual(["EV2"]);
    expect(
      editor.querySelector<HTMLInputElement>("[data-testid='position-editor-pet']")!.value
    ).toBe("+00:10:00");
    // No location yet, so Save is disabled.
    expect(editor.querySelector("[aria-label='Save']")!.getAttribute("aria-disabled")).toBe(
      "true"
    );
  });

  it("opens an existing entry for editing from its row menu", () => {
    setRex({ posEntries: [makeEntry("e1", 100, [EV1.uuid])] });
    renderMapPositionMenu(makeStore());

    flushSync(() =>
      harness.container.querySelector<HTMLButtonElement>("[aria-label='Position actions']")!.click()
    );
    const edit = [...harness.container.querySelectorAll<HTMLElement>("[role='menuitem']")].find(
      (item) => item.textContent === "Edit Position"
    )!;
    flushSync(() => edit.click());
    expect(editPosEntry).toHaveBeenCalledWith({ posEntryUuid: "e1" });
  });
});
