/**
 * The EVA actions panel is a read-only roll-up of every sequence parent's
 * actions. It must show the same action letters as the station and traverse
 * action panels, including the limited-editing letters: pinned baseline
 * letters for a parent that existed before execution, and "0+"-prefixed
 * positional letters for a parent added under limited editing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Provider } from "react-redux";
import type { StoreType } from "store";
import { createCustomTestStore } from "tests/vitest/fixtures/store";
import { initialState as evaInitialState } from "store/eva";
import { initialState as rexInitialState } from "store/rex";
import { initialState as userInitialState } from "store/user";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankRex } from "store/storeUtils/rex";
import actionsStyles from "components/panes/actions.module.css";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";
import "styles/globals.css";

const fixture = vi.hoisted(() => ({ mission: null as Mission | null }));
vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: (selector: (mission: Mission | null) => unknown) =>
    selector(fixture.mission),
}));

import EvaActionsPanel from "components/panes/eva/eva-right-eva-actions";

let store: StoreType;
let harness: ReactHarness;

/**
 * A REX mid-execution under limited editing: "existing" was duplicated with
 * the EVA and carries a letter baseline of two actions; a third action was
 * added to it afterwards. "added" is a station created under the restriction,
 * so its actions render with the added-parent prefix.
 */
beforeEach(() => {
  const mission = generateBlankMission({ actionSystemVersion: 1 });
  mission.stations = {
    existing: generateBlankStation({
      uuid: "existing",
      name: "Existing Station",
      actionOrderUuids: ["act-a", "act-b", "act-added"],
    }),
    added: generateBlankStation({
      uuid: "added",
      name: "Added Station",
      actionOrderUuids: ["act-x", "act-y"],
    }),
  };
  mission.actions = {
    "act-a": generateBlankAction({ uuid: "act-a", stationUuid: "existing", name: "Alpha" }),
    "act-b": generateBlankAction({ uuid: "act-b", stationUuid: "existing", name: "Bravo" }),
    "act-added": generateBlankAction({
      uuid: "act-added",
      stationUuid: "existing",
      name: "Added Later",
    }),
    "act-x": generateBlankAction({ uuid: "act-x", stationUuid: "added", name: "Xray" }),
    "act-y": generateBlankAction({ uuid: "act-y", stationUuid: "added", name: "Yankee" }),
  };
  mission.evas = {
    "eva-rex": generateBlankEVA({
      uuid: "eva-rex",
      name: "EVA Rex",
      sequence: [
        { type: "station", uuid: "existing" },
        { type: "station", uuid: "added" },
      ],
    }),
  };
  mission.rexes = {
    "rex-1": {
      ...generateBlankRex({ evaUuid: "eva-rex" }),
      uuid: "rex-1",
      name: "Rex 1",
      isRunning: true,
      executeEditMode: "limited",
      executeEditState: {
        addedStationUuids: ["added"],
        addedTraverseUuids: [],
        addedActionUuids: ["act-added"],
        actionLetterOrderByParent: { existing: ["act-a", "act-b", "act-added"] },
      },
    } as Rex,
  };
  fixture.mission = mission;

  store = createCustomTestStore({
    eva: { ...evaInitialState, selectedEvaUuid: "eva-rex" },
    rex: { ...rexInitialState, selectedRexUuid: "rex-1" },
    user: {
      ...userInitialState,
      missionPerms: { missionId: mission.id, permissions: { view: true, edit: true } },
    },
  });
  harness = createReactHarness();
});

afterEach(() => harness.unmount());

/** The ordinal column rendered beside each action, in document order. */
const renderedOrdinals = (): string[] =>
  Array.from(
    harness.container.querySelectorAll(`.${actionsStyles.actionlistitemOrdinal}`),
    (node) => node.textContent.trim()
  );

describe("EVA actions panel under limited editing", () => {
  it("pins baseline letters and prefixes actions of a station added under the restriction", async () => {
    harness.render(
      <Provider store={store}>
        <EvaActionsPanel />
      </Provider>
    );

    await vi.waitFor(() => {
      // Existing station keeps its baseline letters, including the action added
      // afterwards; the added station's actions use the "0+" prefix.
      expect(renderedOrdinals()).toEqual(["A", "B", "C", "0+A", "0+B"]);
    });
  });

  it("keeps a pinned letter with its action after a reorder", async () => {
    fixture.mission.stations.existing.actionOrderUuids = ["act-added", "act-a", "act-b"];

    harness.render(
      <Provider store={store}>
        <EvaActionsPanel />
      </Provider>
    );

    await vi.waitFor(() => {
      // The moved action keeps C rather than becoming A.
      expect(renderedOrdinals()).toEqual(["C", "A", "B", "0+A", "0+B"]);
    });
  });

  it("uses plain positional letters when the rex is unrestricted", async () => {
    fixture.mission.rexes["rex-1"].executeEditMode = "unrestricted";
    fixture.mission.rexes["rex-1"].executeEditState = null;

    harness.render(
      <Provider store={store}>
        <EvaActionsPanel />
      </Provider>
    );

    await vi.waitFor(() => {
      expect(renderedOrdinals()).toEqual(["A", "B", "C", "A", "B"]);
    });
  });
});
