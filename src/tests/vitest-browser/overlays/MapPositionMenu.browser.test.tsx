/**
 * Browser-mode tests for `MapPositionMenu` (the Positions tab of the floating Rex Menu widget).
 *
 * Regression coverage for: switching the EVA dropdown from a REX back to As Planned clears
 * `selectedRexUuid` (and the mission doc has no entry for it) before the Rex Menu widget's
 * removal effect has run, so the component can render once with `selectedRex === null`. It
 * previously dereferenced `selectedRex.isRunning` unconditionally and crashed.
 */

import { configureStore } from "@reduxjs/toolkit";
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

const REX_UUID = "rex-uuid-pos-menu-1";

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
      rex: { selectedRexUuid: REX_UUID, selectedPosEntryUuid: null, posEntryInEdit: null },
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
  harness = createReactHarness();
  Object.keys(mockMissionDoc).forEach((k) => {
    delete (mockMissionDoc as Record<string, unknown>)[k];
  });
});

afterEach(() => {
  harness.unmount();
});

describe("MapPositionMenu", () => {
  it("renders nothing (does not throw) when the selected REX no longer exists in the mission doc", () => {
    // Simulates switching the EVA dropdown back to As Planned: selectedRexUuid is still set for
    // one render, but the REX has already been removed from the mission doc.
    mockMissionDoc.rexes = {};
    const store = makeStore();

    expect(() => renderMapPositionMenu(store)).not.toThrow();
    expect(harness.container.querySelector("[data-testid='positions-menu']")).toBeNull();
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
});
