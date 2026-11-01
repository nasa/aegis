import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import ReportsPage from "components/panes/reports/reports-page";
import gridStyles from "components/panes/reports/shared/report-grid.module.css";
import { sliceReducers } from "store/index";
import { reportSetActiveTab, reportSetRexStatusFilter } from "store/report";
import { setMissionPerms } from "store/user";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankRex } from "store/storeUtils/rex";

const fixture = vi.hoisted(() => ({ mission: null as Mission | null }));
vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: (selector: (mission: Mission | null) => unknown) =>
    selector(fixture.mission),
}));

const makeStore = () => configureStore({ reducer: sliceReducers });

describe("MissionPrioritiesPage UI transitions", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute("open", "");
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function () {
        this.removeAttribute("open");
      };
    }

    const mission = generateBlankMission({ actionSystemVersion: 2 });
    mission.missionPriorities = {
      p1: { trace: "SIMD-0002.1", category: "Sample Collection" },
      p2: { trace: "SIMD-0010.1", category: "Sample Collection" },
      pPoiOnly: { trace: "GEO-0004.1", category: "Field Geology" },
    };
    mission.stations = {
      s1: generateBlankStation({ uuid: "s1", refUuid: "ref-s1", name: "Station 1" }),
      s1Rex: generateBlankStation({ uuid: "s1Rex", refUuid: "ref-s1", name: "Station 1" }),
    };
    mission.pois = {
      poi1: generateBlankPoi({ uuid: "poi1", name: "Rim POI", actionOrderUuids: ["poiAct"] }),
    };
    mission.evas = {
      eva1: generateBlankEVA({
        uuid: "eva1",
        refUuid: "ref-eva1",
        name: "EVA Alpha",
        sequence: [{ type: "station", uuid: "s1" }],
      }),
      eva1Rex: generateBlankEVA({
        uuid: "eva1Rex",
        refUuid: "ref-eva1",
        name: "",
        sequence: [{ type: "station", uuid: "s1Rex" }],
      }),
    };
    mission.actions = {
      poiAct: generateBlankAction({
        uuid: "poiAct",
        poiUuid: "poi1",
        name: "Characterize rim",
        enabled: true,
        missionPriorityUuid: "pPoiOnly",
      }),
      actEnabled: generateBlankAction({
        uuid: "actEnabled",
        refUuid: "ref-act-1",
        stationUuid: "s1",
        parentActionUuid: "poiAct",
        name: "Collect regolith",
        enabled: true,
        missionPriorityUuid: "p1",
      }),
      actDisabled: generateBlankAction({
        uuid: "actDisabled",
        stationUuid: "s1",
        name: "Backup sample",
        enabled: false,
        missionPriorityUuid: "p2",
      }),
      actRexSkipped: generateBlankAction({
        uuid: "actRexSkipped",
        refUuid: "ref-act-1",
        stationUuid: "s1Rex",
        name: "Collect regolith",
        enabled: true,
        missionPriorityUuid: "p1",
      }),
    };
    mission.rexes = {
      rex1: generateBlankRex({
        uuid: "rex1",
        evaUuid: "eva1Rex",
        name: "Run 1",
        actionEntries: {
          actRexSkipped: { rexStatus: "skipped" },
        },
      }),
    };

    fixture.mission = mission;
    store = makeStore();
    store.dispatch(setMissionPerms({ missionId: 1, permissions: { view: true, edit: false } }));
    store.dispatch(reportSetActiveTab("missionPriorities"));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders categories, traces, disabled-only indicator, POI-only badge, and toggles category collapse", async () => {
    await act(async () => {
      root.render(
        <Provider store={store}>
          <ReportsPage />
        </Provider>
      );
    });

    const grid = container.querySelector(`.${gridStyles.gridScroll}`)!;
    expect(grid.textContent).toContain("Field Geology");
    expect(grid.textContent).toContain("Sample Collection");
    expect(grid.textContent).toContain("SIMD-0002.1");
    expect(grid.textContent).toContain("SIMD-0010.1");
    expect(grid.textContent).toContain("POI only (1)");
    expect(grid.textContent).toContain("0 (D)");

    // Collapse "Sample Collection" category
    const sampleCatBtn = Array.from(grid.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Sample Collection")
    )!;
    await act(async () => {
      sampleCatBtn.click();
    });
    expect(grid.textContent).not.toContain("SIMD-0002.1");
    expect(grid.textContent).toContain("GEO-0004.1");

    // Expand "Sample Collection" category back
    await act(async () => {
      sampleCatBtn.click();
    });
    expect(grid.textContent).toContain("SIMD-0002.1");
  });

  it("opens drilldown with lineage mismatch note, toggles Show disabled, and shows missing baseline explanation in Diff mode", async () => {
    await act(async () => {
      root.render(
        <Provider store={store}>
          <ReportsPage />
        </Provider>
      );
    });

    const grid = container.querySelector(`.${gridStyles.gridScroll}`)!;
    const p1Row = grid.querySelector(
      '[aria-label="SIMD-0002.1 (Sample Collection)"]'
    ) as HTMLElement;
    await act(async () => {
      p1Row.click();
    });

    expect(container.textContent).toContain("In EVA Alpha");
    expect(container.textContent).toContain("Collect regolith");
    expect(container.textContent).toContain(
      "Inherited from POI Rim POI (priority changed from GEO-0004.1 to SIMD-0002.1)"
    );

    // Switch to disabled-only priority row
    const p2Row = grid.querySelector(
      '[aria-label="SIMD-0010.1 (Sample Collection)"]'
    ) as HTMLElement;
    await act(async () => {
      p2Row.click();
    });
    expect(container.textContent).toContain("0 active (disabled only)");
    expect(container.textContent).toContain("Disabled in this EVA/REX (1)");
    expect(container.textContent).toContain("Backup sample");

    // Toggle off "Show disabled"
    const showDisabledCheckbox = container.querySelector(
      "#mission-priorities-show-disabled"
    ) as HTMLInputElement;
    await act(async () => {
      showDisabledCheckbox.click();
    });
    expect(grid.textContent).not.toContain("0 (D)");
    expect(container.textContent).toContain("0 active (no active actions)");
    expect(container.textContent).not.toContain("Disabled in this EVA/REX");

    // Switch REX filter to "notSkipped" (with Diff mode active by default) and click the REX cell for SIMD-0002.1
    await act(async () => {
      store.dispatch(
        reportSetRexStatusFilter({ reportId: "missionPriorities", value: "notSkipped" })
      );
    });
    expect(grid.textContent).toContain("−1");

    const rexCell = grid.querySelector(
      '[data-tooltip-html^="REX: EVA Alpha: 0 added, 1 removed"]'
    ) as HTMLElement;
    await act(async () => {
      rexCell.click();
    });
    expect(container.textContent).toContain("In baseline only:");
    expect(container.textContent).toContain("Skipped in execution");
    expect(container.textContent).toContain("Excluded by REX filter (1)");

    // Open ActionPreview modal from the drilldown
    const previewBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent === "Preview"
    )!;
    await act(async () => {
      previewBtn.click();
    });
    const openDialog = container.querySelector("dialog[open]");
    expect(openDialog).not.toBeNull();
    expect(openDialog!.textContent).toContain("Collect regolith");
  });
});
