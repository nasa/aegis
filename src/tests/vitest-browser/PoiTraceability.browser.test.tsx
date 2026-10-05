import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import PoiTraceabilityPage from "components/panes/reports/poi-traceability/poi-traceability-page";
import { reportSlice } from "store/report";
import { actionSlice } from "store/action";
import { evaSlice } from "store/eva";
import { poiSlice } from "store/poi";
import { rexSlice } from "store/rex";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { connectionSlice } from "store/connection";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankRex } from "store/storeUtils/rex";
import { stageDuplicateEva } from "operations/stage/stage-eva";
import { applyDuplicateEvaStage } from "operations/apply/apply-eva";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";
import reportStyles from "components/panes/reports/shared/report-grid.module.css";
import actionStyles from "components/panes/actions-action.module.css";
import "styles/globals.css";

const fixture = vi.hoisted(() => ({ mission: null as Mission | null }));
vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: (selector: (mission: Mission | null) => unknown) =>
    selector(fixture.mission),
}));

const makeStore = () =>
  configureStore({
    reducer: {
      report: reportSlice.reducer,
      action: actionSlice.reducer,
      eva: evaSlice.reducer,
      poi: poiSlice.reducer,
      rex: rexSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
      connection: connectionSlice.reducer,
      user: () => ({ missionPerms: { permissions: { edit: true } } }),
    },
  });
let store: ReturnType<typeof makeStore>;
let harness: ReactHarness;
beforeEach(() => {
  const mission = generateBlankMission({ actionSystemVersion: 2 });
  mission.pois = {
    p1: generateBlankPoi({ uuid: "p1", name: "P4", actionOrderUuids: ["pa1", "pa2"] }),
    p2: generateBlankPoi({ uuid: "p2", name: "P5", actionOrderUuids: [] }),
  };
  mission.stations = {
    s1: generateBlankStation({ uuid: "s1", name: "Sta4", icon: "2b50", actionOrderUuids: ["sa1"] }),
  };
  mission.evas = {
    eva1: generateBlankEVA({
      uuid: "eva1",
      name: "EVA 4",
      sequence: [{ type: "station", uuid: "s1" }],
    }),
    eva2: generateBlankEVA({
      uuid: "eva2",
      name: "EVA 6",
      sequence: [{ type: "station", uuid: "s1" }],
    }),
  };
  mission.actions = {
    pa1: generateBlankAction({ uuid: "pa1", poiUuid: "p1", name: "Station characterization" }),
    pa2: generateBlankAction({
      uuid: "pa2",
      poiUuid: "p1",
      name: "Chip sample boulder",
      descriptionTask: "Collect a chip from the boulder.",
      description: "Characterize the exposed surface.",
    }),
    sa1: generateBlankAction({
      uuid: "sa1",
      stationUuid: "s1",
      parentActionUuid: "pa1",
      name: "Station characterization",
    }),
  };
  mission.rexes = {};
  for (const [index, status] of (["skipped", "complete"] as const).entries()) {
    const stage = stageDuplicateEva(mission, {
      sourceEvaUuid: "eva1",
      isRexEva: true,
      includeStations: true,
    })!;
    applyDuplicateEvaStage(mission, stage);
    const executed = stage.stationStages[0].actionsStage.newActions[0];
    const rex = generateBlankRex({
      uuid: `rex${index}`,
      evaUuid: stage.newEvaUuid,
      name: `Run ${index + 1}`,
      createdAt: index + 1,
      actionEntries: { [executed.newUuid]: { rexStatus: status } },
    });
    mission.rexes[rex.uuid] = rex;
    if (index === 1) {
      mission.actions[executed.newUuid].name = "Station characterization at crater rim";
      mission.actions[executed.newUuid].descriptionTask = "Photograph the crater rim.";
      rex.isRunning = true;
      rex.actionEntries![executed.newUuid].mass = 0;
      rex.actionEntries![executed.newUuid].containerId = "Bag 42";
    }
  }
  fixture.mission = mission;
  harness = createReactHarness();
  Object.assign(harness.container.style, {
    width: "1100px",
    height: "760px",
    display: "flex",
    background: "var(--grey2)",
    color: "white",
    padding: "12px",
  });
  store = makeStore();
  harness.render(
    <Provider store={store}>
      <PoiTraceabilityPage />
    </Provider>
  );
});
afterEach(() => harness.unmount());

describe("POI action family tree", () => {
  it("uses shared STM colors and priority badges for original, adopted, and executed actions", () => {
    const mission = fixture.mission!;
    mission.actionDefinitions = {
      verbs: { sample: { name: "Sample", abbr: "s" } },
      nouns: {
        rock: { name: "Rock", abbr: "r" },
        boulder: { name: "Boulder", abbr: "b" },
      },
      adjectives: { crater: { name: "Crater", abbr: "c" } },
    };
    mission.missionPriorities = {
      original: { trace: "SIMD-0005.1", category: "Science" },
      adopted: { trace: "SIMD-0005.2", category: "Science" },
      executed: { trace: "SIMD-0005.3", category: "Science" },
    };
    mission.actionDefinitionConjunctions = { verbToNoun: "on", nounToAdjective: "within" };
    for (const action of Object.values(mission.actions)) {
      if (action.uuid !== "pa1" && action.parentActionUuid !== "pa1") continue;
      action.name = "";
      action.stmAction = true;
      action.actionDefinition = { verbUuid: "sample", nounUuid: "rock", adjectiveUuid: "crater" };
      action.missionPriorityUuid = "original";
    }
    mission.actions.sa1.missionPriorityUuid = "adopted";
    const executed = Object.values(mission.actions).find(
      (action) => !!mission.rexes[Object.keys(mission.rexes)[1]].actionEntries?.[action.uuid]
    )!;
    executed.actionDefinition = { ...executed.actionDefinition, nounUuid: "boulder" };
    executed.missionPriorityUuid = "executed";
    const render = () =>
      harness.render(
        <Provider store={store}>
          <PoiTraceabilityPage />
        </Provider>
      );
    render();
    expect(harness.container.querySelector('nav[aria-label="POI actions"]')?.textContent).toContain(
      "Sample on Rock"
    );
    expect(harness.container.querySelector("h3")?.textContent).toContain("Sample on Rock");
    expect(harness.container.textContent).toContain("Action: Sample on Boulder");
    expect(harness.container.textContent).not.toContain("Unnamed action");

    const reference = document.createElement("span");
    document.body.appendChild(reference);
    for (const [className, color] of [
      [reportStyles.drilldownRuleVerb, "verb"],
      [reportStyles.drilldownRuleNoun, "noun"],
      [reportStyles.drilldownRuleAdjective, "adjective"],
    ]) {
      reference.style.color = `var(--${color})`;
      const parts = harness.container.querySelectorAll(`.${className}`);
      expect(parts.length).toBeGreaterThanOrEqual(4);
      for (const part of parts) {
        expect(getComputedStyle(part).color).toBe(getComputedStyle(reference).color);
      }
    }
    reference.remove();
    for (const trace of ["SIMD-0005.1", "SIMD-0005.2", "SIMD-0005.3"]) {
      const badge = harness.container.querySelector(`[aria-label="Mission priority: ${trace}"]`)!;
      expect(badge.classList.contains(actionStyles.actionHeadingPriority)).toBe(true);
      expect(badge.getAttribute("data-tooltip-content")).toBe(
        `Mission priority: ${trace} | Science`
      );
    }

    mission.actionDefinitions = {
      ...mission.actionDefinitions,
      verbs: { sample: { name: "Collect", abbr: "c" } },
    };
    render();
    expect(harness.container.querySelector("h3")?.textContent).toContain("Collect on Rock");
    expect(harness.container.textContent).toContain("Action: Collect on Boulder");
  });

  it.each([
    { conjunction: "Pri", label: "Adjective", name: "GEO-07.02" },
    { conjunction: "in", label: "Priority", name: "GEO-07.02" },
    { conjunction: "in", label: "Adjective", name: "Pri GEO-07.02" },
  ])(
    "badges legacy priorities in the left list and source title ($conjunction / $label / $name)",
    ({ conjunction, label, name }) => {
      const mission = fixture.mission!;
      mission.actionDefinitions = {
        verbs: { sample: { name: "Sealed Double Drive Tube", abbr: "s" } },
        nouns: { cold: { name: "Cold1", abbr: "c" } },
        adjectives: { priority: { name, abbr: "p" } },
      };
      mission.actionDefinitionConjunctions = { verbToNoun: "at", nounToAdjective: conjunction };
      mission.actionDefinitionLabels = {
        ...mission.actionDefinitionLabels,
        adjective: { singular: label, plural: `${label}s` },
      };
      mission.actions.pa1.stmAction = true;
      mission.actions.pa1.name = "";
      mission.actions.pa1.actionDefinition = {
        verbUuid: "sample",
        nounUuid: "cold",
        adjectiveUuid: "priority",
      };
      mission.actions.sa1.stmAction = true;
      mission.actions.sa1.actionDefinition = {
        ...mission.actions.pa1.actionDefinition,
        adjectiveUuid: null,
      };
      mission.actions.sa1.missionPriorityUuid = "converted";
      mission.missionPriorities = { converted: { trace: "GEO-0007.02", category: "Geology" } };
      harness.render(
        <Provider store={store}>
          <PoiTraceabilityPage />
        </Provider>
      );

      const list = harness.container.querySelector('nav[aria-label="POI actions"]')!;
      const title = harness.container.querySelector("h3")!;
      const adoptedBadge = harness.container.querySelector(
        '[aria-label="Mission priority: GEO-0007.02"]'
      )!;
      for (const container of [list, title]) {
        expect(container.textContent).toContain("Sealed Double Drive Tube at Cold1");
        expect(container.textContent).not.toMatch(/\bPri\b/);
        const badge = container.querySelector('[aria-label="Mission priority: GEO-07.02"]')!;
        expect(badge.textContent).toBe("GEO-07.02");
        expect(badge.classList.contains(actionStyles.actionHeadingPriority)).toBe(true);
        expect(container.querySelector(`.${reportStyles.drilldownRuleAdjective}`)).toBeNull();
        for (const property of [
          "color",
          "border",
          "borderRadius",
          "padding",
          "fontWeight",
        ] as const) {
          expect(getComputedStyle(badge)[property]).toBe(getComputedStyle(adoptedBadge)[property]);
        }
      }
    }
  );

  it("displays in-progress execution status separately from pending", () => {
    const mission = fixture.mission!;
    const rex = Object.values(mission.rexes)[1];
    fixture.mission = {
      ...mission,
      rexes: {
        ...mission.rexes,
        [rex.uuid]: {
          ...rex,
          actionEntries: Object.fromEntries(
            Object.entries(rex.actionEntries!).map(([uuid, entry]) => [
              uuid,
              { ...entry, rexStatus: "in-progress" as const },
            ])
          ),
        },
      },
    };
    harness.render(
      <Provider store={store}>
        <PoiTraceabilityPage />
      </Provider>
    );
    const outcomes = harness.container.querySelector('ul[aria-label="Execution outcomes"]')!;
    expect(outcomes.textContent).toContain("In progress");
    expect(outcomes.textContent).not.toContain("Pending");
    expect(outcomes.textContent).not.toContain("Completed");
  });

  it("opens the first POI/action directly and places execution outcomes under the correct EVA", () => {
    const branches = harness.container.querySelectorAll('ul[aria-label="EVA adoptions"] > li');
    expect(branches).toHaveLength(2);
    expect(branches[0].textContent).toContain("EVA 4");
    expect(branches[0].textContent).toContain("Completed");
    expect(branches[0].textContent).toContain("Skipped");
    expect(branches[1].textContent).toContain("EVA 6");
    expect(branches[1].textContent).toContain("No execution recorded");
    expect(branches[1].textContent).not.toContain("Completed");
    expect(harness.container.querySelector('button[aria-current="true"]')?.textContent).toContain(
      "1 completed"
    );
  });

  it("switches actions and POIs without an intermediate detail tab", async () => {
    await page.getByRole("button", { name: "Chip sample boulder Not adopted" }).click();
    await vi.waitFor(() =>
      expect(harness.container.textContent).toContain("No adoption in this scope")
    );
    expect(harness.container.querySelector('ul[aria-label="EVA adoptions"]')).toBeNull();
    const buttons = harness.container.querySelectorAll(
      'nav[aria-label="Points of interest"] button[aria-current]'
    );
    (buttons[1] as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(harness.container.textContent).toContain("This POI has no actions to trace.")
    );
    (buttons[0] as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(
        harness.container.querySelector('nav[aria-label="POI actions"] button[aria-pressed="true"]')
          ?.textContent
      ).toContain("Station characterization")
    );
  });

  it("shows every action and uses plain text labels", () => {
    const actions = harness.container.querySelectorAll('nav[aria-label="POI actions"] button');
    expect(actions).toHaveLength(2);
    expect(actions[0].textContent).toContain("Station characterization");
    expect(actions[1].textContent).toContain("Chip sample boulder");
    expect(harness.container.querySelector("select[id]")).toBeNull();
    const labels = harness.container.cloneNode(true) as HTMLElement;
    labels.querySelectorAll('[aria-hidden="true"]').forEach((icon) => icon.remove());
    expect(labels.textContent).not.toMatch(/[^\x00-\x7F]/);
  });

  it("previews the original action and restores the selected trace and focus on close", async () => {
    await page.getByRole("button", { name: "Chip sample boulder Not adopted" }).click();
    const before = store.getState();
    const trigger = harness.container.querySelector(
      'button[aria-haspopup="dialog"]'
    ) as HTMLButtonElement;
    await page.getByRole("button", { name: "Preview original action", exact: true }).click();
    const dialog = harness.container.querySelector("dialog[open]") as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain("Original POI action");
    expect(dialog.textContent).toContain("Characterize the exposed surface.");
    expect(
      Array.from(dialog.querySelectorAll("input, textarea, select")).filter((field) =>
        (field as HTMLElement).checkVisibility()
      )
    ).toHaveLength(0);
    (dialog.querySelector('[data-icon="caret-down"]')!.parentElement as HTMLElement).click();
    await vi.waitFor(() =>
      expect(dialog.textContent).not.toContain("Characterize the exposed surface.")
    );
    (dialog.querySelector('[data-icon="caret-right"]')!.parentElement as HTMLElement).click();
    await vi.waitFor(() =>
      expect(dialog.textContent).toContain("Characterize the exposed surface.")
    );
    expect(store.getState()).toBe(before);
    await page.getByRole("button", { name: "Close preview", exact: true }).click();
    await vi.waitFor(() => expect(harness.container.querySelector("dialog[open]")).toBeNull());
    expect(
      harness.container.querySelector('nav[aria-label="POI actions"] button[aria-pressed="true"]')
        ?.textContent
    ).toContain("Chip sample boulder");
    expect(document.activeElement).toBe(trigger);
    expect(store.getState()).toBe(before);
  });

  it("previews the exact execution copy with its REX outcome and recorded values", async () => {
    const before = store.getState();
    const missionBefore = JSON.stringify(fixture.mission);
    const executions = harness.container.querySelectorAll('ul[aria-label="Execution outcomes"] li');
    (executions[1].querySelector("button") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(harness.container.querySelector("dialog[open]")).not.toBeNull());
    const dialog = harness.container.querySelector("dialog[open]")!;
    expect(dialog.textContent).toContain("Executed action");
    expect(dialog.textContent).toContain("Station characterization at crater rim");
    expect(dialog.textContent).toContain("EVA: EVA 4");
    expect(dialog.textContent).toContain("REX: Run 2 / Completed");
    expect(dialog.textContent).toContain("Photograph the crater rim.");
    expect((dialog as HTMLElement).innerText).toMatch(/Executed Mass \(g\):\s*0/);
    expect(
      Array.from(dialog.querySelectorAll("input, textarea, select")).filter((field) =>
        (field as HTMLElement).checkVisibility()
      )
    ).toHaveLength(0);
    expect(dialog.textContent).toContain("Bag 42");
    expect(store.getState()).toBe(before);
    expect(JSON.stringify(fixture.mission)).toBe(missionBefore);
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(harness.container.querySelector("dialog[open]")).toBeNull());
    expect(store.getState()).toBe(before);
  });

  it("previews a planned adoption without a REX and dismisses by backdrop", async () => {
    const before = store.getState();
    const branches = harness.container.querySelectorAll('ul[aria-label="EVA adoptions"] > li');
    (branches[1].querySelector("button") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(harness.container.querySelector("dialog[open]")).not.toBeNull());
    const dialog = harness.container.querySelector("dialog[open]") as HTMLDialogElement;
    expect(dialog.textContent).toContain("Adopted action");
    expect(dialog.textContent).toContain("EVA: EVA 6");
    expect(dialog.textContent).toContain("Station: Sta4");
    expect(dialog.textContent).not.toContain("REX:");
    (dialog.querySelector("h2") as HTMLElement).click();
    expect(dialog.open).toBe(true);
    dialog.click();
    await vi.waitFor(() => expect(harness.container.querySelector("dialog[open]")).toBeNull());
    expect(store.getState()).toBe(before);
  });

  it("stacks the tree in a narrow report pane without horizontal overflow", async () => {
    harness.container.style.width = "580px";
    await vi.waitFor(() => {
      const branch = harness.container.querySelector('ul[aria-label="EVA adoptions"] > li')!;
      const adoption = branch.children[0].getBoundingClientRect();
      const outcome = branch.children[1].getBoundingClientRect();
      expect(outcome.top).toBeGreaterThanOrEqual(adoption.bottom);
      expect(harness.container.scrollWidth).toBeLessThanOrEqual(harness.container.clientWidth);
    });
  });

  it("places adoption and execution side by side in a wide report pane", async () => {
    await page.viewport(1700, 850);
    harness.container.style.width = "1600px";
    const branch = harness.container.querySelector('ul[aria-label="EVA adoptions"] > li')!;
    await vi.waitFor(() =>
      expect(branch.children[1].getBoundingClientRect().left).toBeGreaterThan(
        branch.children[0].getBoundingClientRect().left
      )
    );
    const actions = harness.container
      .querySelector('nav[aria-label="POI actions"]')!
      .getBoundingClientRect();
    expect(actions.right).toBeLessThan(branch.getBoundingClientRect().left);
    expect(branch.getBoundingClientRect().height).toBeLessThan(160);
  });
});
