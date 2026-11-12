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
import { usePosEntryEditSession } from "components/interface/map/hooks/usePosEntryEditSession";
import { userSlice } from "store/user";
import { rexSlice } from "store/rex";
import { mapSlice } from "store/map";
import { hoverSlice } from "store/hover";
import { evaSlice } from "store/eva";
import formStyles from "components/interface/form/globalFields.module.css";
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
const setLocation = vi.fn((args: { uuid: string; location: AEGISPoint | null }) =>
  rexSlice.actions.setPosEntryInEditLocation({ ...args, elevationPending: false })
);
const savePosEntry = vi.fn(() => ({ type: "mock/savePosEntryEdit" }));
const cancelPosEntry = vi.fn(() => (dispatch: (action: unknown) => void) => {
  dispatch(rexSlice.actions.clearPosEntryInEdit({ keepExpanded: true }));
  dispatch(mapSlice.actions.updateMapDirective(null));
});
vi.mock("store/thunk/thunkRexPosEntry", () => ({
  thunkAddPosEntry: () => addPosEntry(),
  thunkEditPosEntry: (args: { posEntryUuid: string }) => editPosEntry(args),
  thunkCancelPosEntryEdit: () => cancelPosEntry(),
  thunkCancelPosEntryMapDirective: () => ({ type: "mock/cancelPosEntryMapDirective" }),
  thunkStartPosEntryMapDirective: () => ({ type: "mock/startPosEntryMapDirective" }),
  thunkSetPosEntryEditLocation: (args: Parameters<typeof setLocation>[0]) => setLocation(args),
  thunkSavePosEntryEdit: () => savePosEntry(),
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

function makeEditingStore() {
  setRex();
  const store = makeStore();
  store.dispatch(
    rexSlice.actions.setPosEntryInEdit({
      uuid: "draft",
      rexUuid: REX_UUID,
      isNew: true,
      values: {
        location: { lat: 1, lng: 2 },
        elevation: null,
        petSeconds: 600,
        posTypeUuids: [EV1.uuid],
        posSourceUuid: TASK.uuid,
        uncertaintyMeters: 5,
        color: null,
      },
      base: null,
      elevationPending: false,
    })
  );
  return store;
}

function typeField(testId: string, text: string) {
  const input = harness.container.querySelector<HTMLInputElement>(`[data-testid='${testId}']`)!;
  flushSync(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}

let harness: ReactHarness;

function PositionsSession({ showMenu }: { showMenu: boolean }) {
  usePosEntryEditSession();
  return showMenu ? <MapPositionMenu /> : null;
}

function renderMapPositionMenu(store: ReturnType<typeof makeStore>, showMenu = true) {
  harness.render(
    <Provider store={store}>
      <PositionsSession showMenu={showMenu} />
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

  it("pins each pos type's latest entry by PET and lists older positions newest first", () => {
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
    expect(rowUuids("position-group-older")).toEqual(["e1", "e3"]);
    const e4Row = harness.container.querySelector("[data-testid='position-row-e4']")!;
    expect(e4Row.querySelector("td")!.textContent).toBe("");
    expect([...harness.container.querySelectorAll("th")].some((th) => th.textContent === "#")).toBe(
      false
    );
    expect(e4Row.textContent).toContain("+00:05:00");
    expect(e4Row.textContent).toContain("EV1");
  });

  it("collapses Older positions while keeping the latest positions pinned", () => {
    setRex({ posEntries: [makeEntry("e1", 100, [EV1.uuid]), makeEntry("e2", 200, [EV1.uuid])] });
    renderMapPositionMenu(makeStore());

    const toggle = harness.container.querySelector<HTMLButtonElement>(
      "[data-testid='position-group-older'] button"
    )!;
    expect(toggle.textContent).toBe("Older positions (1)");
    flushSync(() => toggle.click());
    expect(rowUuids("position-group-older")).toEqual([]);
    expect(rowUuids("position-group-latest")).toEqual(["e2"]);
  });

  it("omits Older positions when every entry is shown in Latest", () => {
    setRex({ posEntries: [makeEntry("e1", 100, [EV1.uuid])] });
    renderMapPositionMenu(makeStore());

    expect(rowUuids("position-group-latest")).toEqual(["e1"]);
    expect(harness.container.querySelector("[data-testid='position-group-older']")).toBeNull();
  });

  it.each([true, false])(
    "discards an open position draft when its REX stops (new: %s)",
    async (isNew) => {
      const store = makeEditingStore();
      const entry = makeEntry("draft", 100, [EV1.uuid]);
      if (!isNew) {
        setRex({ posEntries: [entry] });
        const draft = store.getState().rex.posEntryInEdit!;
        store.dispatch(
          rexSlice.actions.setPosEntryInEdit({ ...draft, isNew: false, base: draft.values })
        );
      }
      store.dispatch(
        mapSlice.actions.updateMapDirective({
          mapItemType: "posEntry",
          uuid: "draft",
          mapAction: "editMarker",
        })
      );
      renderMapPositionMenu(store);
      expect(cancelPosEntry).not.toHaveBeenCalled();

      mockMissionDoc.rexes![REX_UUID].isRunning = false;
      renderMapPositionMenu(store);

      await vi.waitFor(() => expect(store.getState().rex.posEntryInEdit).toBeNull());
      expect(cancelPosEntry).toHaveBeenCalledTimes(1);
      expect(store.getState().map.mapDirective).toBeNull();
      expect(harness.container.querySelector("[data-testid='position-editor']")).toBeNull();
      expect(mockMissionDoc.rexes![REX_UUID].posEntries).toEqual(isNew ? [] : [entry]);
    }
  );

  it("discards a draft on stop while the Positions tab is hidden", async () => {
    const store = makeEditingStore();
    renderMapPositionMenu(store);
    renderMapPositionMenu(store, false);
    expect(store.getState().rex.posEntryInEdit).not.toBeNull();

    mockMissionDoc.rexes![REX_UUID].isRunning = false;
    renderMapPositionMenu(store, false);

    await vi.waitFor(() => expect(store.getState().rex.posEntryInEdit).toBeNull());
    expect(cancelPosEntry).toHaveBeenCalledTimes(1);
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

  it("shows draft details as soon as a new position is placed and updates them before saving", () => {
    setRex();
    mockMissionDoc.landerLocation = { lat: 0, lng: 0 };
    // One degree along the equator is 1 km; prefer the EVA's 2 km/h over the mission's 4.
    mockMissionDoc.planetRadius = 180_000 / Math.PI;
    mockMissionDoc.traverseRate = 4;
    mockMissionDoc.evas = {
      "eva-uuid-1": { traverseRate: 2 } as Eva,
    };
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
    expect(editor.querySelector("[aria-label='Save']")!.getAttribute("aria-disabled")).toBe("true");
    const detail = (name: string) =>
      editor.querySelector(`[data-testid='position-editor-${name}']`)?.textContent;
    expect(detail("lander-distance")).toBe("-");
    expect(detail("walkback")).toBe("-");

    // Map placement updates only the Redux draft; details must not depend on a saved entry
    // or on the asynchronous elevation request finishing.
    flushSync(() => {
      store.dispatch(
        rexSlice.actions.setPosEntryInEditLocation({
          uuid: "draft",
          location: { lat: 0, lng: 1 },
          elevationPending: true,
        })
      );
    });
    expect(detail("lander-distance")).toBe("1000");
    expect(detail("walkback")).toBe("30");

    flushSync(() =>
      store.dispatch(
        rexSlice.actions.setPosEntryInEditLocation({
          uuid: "draft",
          location: { lat: 0, lng: 2 },
          elevationPending: true,
        })
      )
    );
    expect(detail("lander-distance")).toBe("2000");
    expect(detail("walkback")).toBe("60");
    expect(mockMissionDoc.rexes![REX_UUID].posEntries).toEqual([]);

    // Missing lander information uses the same fallback as the saved-position view.
    mockMissionDoc.landerLocation = null;
    renderMapPositionMenu(store);
    expect(detail("lander-distance")).toBe("Not set");
    expect(detail("walkback")).toBe("Not set");
  });

  it("updates notes in the draft without changing saved positions", () => {
    const store = makeEditingStore();
    renderMapPositionMenu(store);
    const input = harness.container.querySelector<HTMLTextAreaElement>(
      "[data-testid='position-editor-notes']"
    )!;
    for (const notes of ["Near the boulder\nCheck terrain", ""]) {
      flushSync(() => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
          input,
          notes
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(store.getState().rex.posEntryInEdit!.values.notes).toBe(notes || null);
      expect(mockMissionDoc.rexes![REX_UUID].posEntries).toEqual([]);
    }
  });

  it.each([false, true])(
    "shows default yellow for a null position color (editing: %s)",
    (editing) => {
      const store = makeEditingStore();
      const entry = makeEntry("e1", 100, [EV1.uuid]);
      if (!editing) {
        setRex({ posEntries: [entry] });
        store.dispatch(rexSlice.actions.clearPosEntryInEdit({ keepExpanded: true }));
        store.dispatch(rexSlice.actions.setExpandedPosEntryUuid(entry.uuid));
      }
      renderMapPositionMenu(store);
      const sample = () =>
        harness.container.querySelector<HTMLElement>(`.${formStyles.pathColorSample}`)!;
      expect(sample().style.backgroundColor).toBe("rgb(196, 154, 0)");

      if (editing) {
        expect(store.getState().rex.posEntryInEdit!.values.color).toBeNull();
        flushSync(() =>
          store.dispatch(rexSlice.actions.updatePosEntryInEditValues({ color: "#ff0000" }))
        );
        expect(sample().style.backgroundColor).toBe("rgb(255, 0, 0)");
        flushSync(() =>
          harness.container.querySelector<HTMLElement>("[aria-label='Reset radius color']")!.click()
        );
        expect(store.getState().rex.posEntryInEdit!.values.color).toBeNull();
        expect(sample().style.backgroundColor).toBe("rgb(196, 154, 0)");
      } else {
        expect(mockMissionDoc.rexes![REX_UUID].posEntries![0].color).toBeNull();
      }
    }
  );

  it("shows saved multiline notes in the details", () => {
    const notes = "Near the boulder\nCheck terrain";
    setRex({ posEntries: [{ ...makeEntry("e1", 100, [EV1.uuid]), notes }] });
    const store = makeStore();
    store.dispatch(rexSlice.actions.setExpandedPosEntryUuid("e1"));
    renderMapPositionMenu(store);
    expect(
      harness.container.querySelector("[data-testid='position-details-notes']")!.textContent
    ).toBe(notes);
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

  it.each([
    { field: "uncertainty", invalid: "-1", valid: "12.5", key: "uncertaintyMeters", value: 12.5 },
    { field: "uncertainty", invalid: "1.2.3", valid: "8", key: "uncertaintyMeters", value: 8 },
    { field: "pet", invalid: "+00:61:00", valid: "+00:20:30", key: "petSeconds", value: 1230 },
  ])(
    "validates $field independently before updating the draft ($invalid)",
    async ({ field, invalid, valid, key, value }) => {
      const store = makeEditingStore();
      renderMapPositionMenu(store);
      const save = () => harness.container.querySelector<HTMLElement>("[aria-label='Save']")!;
      const original = store.getState().rex.posEntryInEdit!.values;

      const input = typeField(`position-editor-${field}`, invalid);
      expect(input.classList.contains(formStyles.inLineEditInput)).toBe(true);
      expect(input.value).toBe(invalid);
      expect(store.getState().rex.posEntryInEdit!.values).toEqual(original);
      expect(save().getAttribute("aria-disabled")).toBe("true");
      flushSync(() => save().click());
      expect(savePosEntry).not.toHaveBeenCalled();

      typeField(`position-editor-${field}`, valid);
      expect(store.getState().rex.posEntryInEdit!.values).toMatchObject({ [key]: value });
      expect(mockMissionDoc.rexes![REX_UUID].posEntries).toEqual([]);
      expect(save().getAttribute("aria-disabled")).toBe("false");
      flushSync(() => save().click());
      await vi.waitFor(() => expect(savePosEntry).toHaveBeenCalledTimes(1));
    }
  );

  it("validates and applies typed coordinates when saving without a blur", async () => {
    const store = makeEditingStore();
    renderMapPositionMenu(store);
    const save = () => harness.container.querySelector<HTMLElement>("[aria-label='Save']")!;

    typeField("position-editor-coordinates", "95, 20");
    expect(save().getAttribute("aria-disabled")).toBe("true");
    expect(setLocation).not.toHaveBeenCalled();

    typeField("position-editor-coordinates", "3, 4");
    expect(store.getState().rex.posEntryInEdit!.values.location).toEqual({ lat: 1, lng: 2 });
    expect(save().getAttribute("aria-disabled")).toBe("false");
    flushSync(() => save().click());
    await vi.waitFor(() => expect(savePosEntry).toHaveBeenCalledTimes(1));
    expect(setLocation).toHaveBeenCalledWith({ uuid: "draft", location: { lat: 3, lng: 4 } });
    expect(store.getState().rex.posEntryInEdit!.values.location).toEqual({ lat: 3, lng: 4 });
  });

  it("shows map placement and current PET changes in the inline fields", async () => {
    const store = makeEditingStore();
    renderMapPositionMenu(store);
    const coordinateInput = () =>
      harness.container.querySelector<HTMLInputElement>(
        "[data-testid='position-editor-coordinates']"
      )!;
    const before = coordinateInput().value;
    flushSync(() =>
      store.dispatch(
        rexSlice.actions.setPosEntryInEditLocation({
          uuid: "draft",
          location: { lat: 3, lng: 4 },
          elevationPending: false,
        })
      )
    );
    await vi.waitFor(() => expect(coordinateInput().value).toBe("3.000000, 4.000000"));
    expect(coordinateInput().value).not.toBe(before);

    typeField("position-editor-pet", "+00:20:00");
    flushSync(() =>
      harness.container.querySelector<HTMLElement>("[aria-label='Set to current PET']")!.click()
    );
    await vi.waitFor(() =>
      expect(
        harness.container.querySelector<HTMLInputElement>("[data-testid='position-editor-pet']")!
          .value
      ).toBe("+00:10:00")
    );
    expect(store.getState().rex.posEntryInEdit!.values.petSeconds).toBe(600);
  });
});
