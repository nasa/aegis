import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import type { CSSProperties } from "react";
import ReportsPage from "components/panes/reports/reports-page";
import ReportColumnHeader from "components/panes/reports/shared/report-column-header";
import EvaComparisonTable from "components/panes/reports/eva-comparison/eva-comparison-table";
import { ReportIdProvider } from "components/panes/reports/reports-context";
import gridStyles from "components/panes/reports/shared/report-grid.module.css";
import comparisonStyles from "components/panes/reports/eva-comparison/eva-comparison.module.css";
import { reportSetColumnDerivedData, reportSlice } from "store/report";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankPoi } from "store/storeUtils/poi";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";
import "styles/globals.css";

const fixture = vi.hoisted(() => ({ mission: null as Mission | null }));
vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: (selector: (mission: Mission | null) => unknown) =>
    selector(fixture.mission),
}));

vi.mock("components/panes/reports/eva-stm-coverage/eva-stm-coverage-page", () => ({
  default: () => <div>Coverage content</div>,
}));
vi.mock("components/panes/reports/eva-comparison/eva-comparison-page", () => ({
  default: () => <div>Comparison content</div>,
}));
vi.mock("components/panes/reports/poi-traceability/poi-traceability-page", () => ({
  default: () => <div>Traceability content</div>,
}));

const makeStore = () => configureStore({ reducer: { report: reportSlice.reducer } });
let store: ReturnType<typeof makeStore>;
let harness: ReactHarness;

beforeEach(() => {
  const mission = generateBlankMission({ actionSystemVersion: 2 });
  mission.missionPriorities = {
    p1: { trace: "SIMD-0002.1", category: "Sample Collection" },
    p2: { trace: "SIMD-0010.1", category: "Sample Collection" },
    pPoiOnly: { trace: "GEO-0004.1", category: "Field Geology" },
  };
  mission.stations = {
    s1: generateBlankStation({ uuid: "s1", name: "Station 1" }),
  };
  mission.pois = {
    poi1: generateBlankPoi({ uuid: "poi1", name: "Rim POI", actionOrderUuids: ["poiAct"] }),
  };
  mission.evas = {
    eva1: generateBlankEVA({
      uuid: "eva1",
      name: "EVA Alpha",
      sequence: [{ type: "station", uuid: "s1" }],
    }),
  };
  mission.actions = {
    actEnabled: generateBlankAction({
      uuid: "actEnabled",
      stationUuid: "s1",
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
    poiAct: generateBlankAction({
      uuid: "poiAct",
      poiUuid: "poi1",
      name: "Characterize rim",
      enabled: true,
      missionPriorityUuid: "pPoiOnly",
    }),
  };
  fixture.mission = mission;
  store = makeStore();
  harness = createReactHarness();
});
afterEach(() => harness.unmount());

const renderGrid = () => {
  const columns: EvaReportColumn[] = Array.from({ length: 30 }, (_, index) => ({
    key: `eva${index}`,
    kind: "eva",
    evaUuid: `eva${index}`,
    isRex: false,
    label: `EVA ${index}`,
    groupKey: `eva${index}`,
    groupLabel: `EVA ${index}`,
  }));
  store.dispatch(
    reportSetColumnDerivedData({
      reportId: "comparison",
      data: {
        visibleColumns: columns,
        resolvedBaselineKey: "eva1",
        visibleRowIds: ["stationCount"],
        sequenceByColumnKey: {
          eva0: [{ uuid: "s1", type: "station", name: "Station 1", icon: null }],
        },
        metricsByColumnKey: {
          ...Object.fromEntries(columns.map((column) => [column.key, { stationCount: 2 }])),
          eva0_s1: { stationCount: 1 },
        },
      },
    })
  );
  harness.render(
    <Provider store={store}>
      <ReportIdProvider value="comparison">
        <div
          className={gridStyles.gridScroll}
          style={{ width: 600, "--stmCoverageStationCellWidth": "40px" } as CSSProperties}
        >
          <ReportColumnHeader
            leftAxis={<div className={comparisonStyles.metricLabelCorner}>Metric</div>}
          />
          <EvaComparisonTable />
        </div>
      </ReportIdProvider>
    </Provider>
  );
};

describe("Reports navigation and grid", () => {
  it("retains the selected report when the pane remounts", async () => {
    const render = () =>
      harness.render(
        <Provider store={store}>
          <ReportsPage />
        </Provider>
      );
    render();
    await page.getByText("EVA Comparison", { exact: true }).click();
    expect(harness.container.textContent).toContain("Comparison content");
    harness.render(null);
    render();
    expect(harness.container.textContent).toContain("Comparison content");
    expect(store.getState().report.activeTab).toBe("comparison");

    await page.getByText("POI Traceability", { exact: true }).click();
    harness.render(null);
    render();
    expect(harness.container.textContent).toContain("Traceability content");
    expect(store.getState().report.activeTab).toBe("poiTrace");

    await page.getByText("Mission Priorities", { exact: true }).click();
    harness.render(null);
    render();
    expect(store.getState().report.activeTab).toBe("missionPriorities");
    expect(harness.container.textContent).toContain("SIMD-0002.1");
  });

  it("renders Mission Priorities categories, disabled-only indicator, POI-only badge, and drilldown on cell click", async () => {
    harness.render(
      <Provider store={store}>
        <ReportsPage />
      </Provider>
    );
    await page.getByText("Mission Priorities", { exact: true }).click();

    const grid = harness.container.querySelector(`.${gridStyles.gridScroll}`)!;
    expect(grid.textContent).toContain("Field Geology");
    expect(grid.textContent).toContain("Sample Collection");
    expect(grid.textContent).toContain("SIMD-0002.1");
    expect(grid.textContent).toContain("SIMD-0010.1");
    expect(grid.textContent).toContain("POI only (1)");
    expect(grid.textContent).toContain("0 (D)");

    // Clicking the priority row opens the drilldown side panel
    await page.getByRole("button", { name: "SIMD-0002.1 (Sample Collection)" }).click();
    expect(harness.container.textContent).toContain("In EVA Alpha");
    expect(harness.container.textContent).toContain("Collect regolith");

    // Clicking the disabled-only row shows the disabled action in the drilldown
    await page.getByRole("button", { name: "SIMD-0010.1 (Sample Collection)" }).click();
    expect(harness.container.textContent).toContain("0 active (disabled only)");
    expect(harness.container.textContent).toContain("Disabled in this EVA / REX (1)");
    expect(harness.container.textContent).toContain("Backup sample");

    // Toggling off "Show disabled" hides the 0 (D) indicator and updates the drilldown status
    await page.getByText("Show disabled", { exact: true }).click();
    expect(grid.textContent).not.toContain("0 (D)");
    expect(harness.container.textContent).toContain("0 active (no active actions)");
    expect(harness.container.textContent).not.toContain("Disabled in this EVA / REX");
  });

  it("expands to the right from title clicks and keeps the baseline unchanged", async () => {
    renderGrid();
    await page.getByRole("button", { name: "EVA 0: Expand into stations", exact: true }).click();
    const baseline = store.getState().report.comparison.resolvedBaselineKey;
    expect(baseline).toBe("eva1");
    expect(store.getState().report.comparison.baselineColumnKey).toBeNull();
    expect(store.getState().report.comparison.expandedColumns).toContain("eva0");

    const headers = harness.container.querySelectorAll(
      `.${gridStyles.columnGroup} .${gridStyles.headerColumns} > div`
    );
    expect(headers[0].textContent).toContain("EVA 0 (Total)");
    expect(headers[1].textContent).toContain("Station 1");
    const rowCells = harness.container.querySelector(`.${gridStyles.tableRowCells}`)!;
    expect(rowCells.children[1].getAttribute("data-tooltip-html")).toContain("EVA 0:");
    expect(rowCells.children[2].textContent).toBe("1");
    expect(rowCells.children[2].getBoundingClientRect().left).toBeGreaterThan(
      rowCells.children[1].getBoundingClientRect().left
    );

    await page.getByRole("button", { name: "EVA 0: Collapse stations", exact: true }).click();
    expect(store.getState().report.comparison.expandedColumns).not.toContain("eva0");
    expect(store.getState().report.comparison.resolvedBaselineKey).toBe(baseline);
  });

  it("renders group bands and header borders across the full table at narrow and wide widths", async () => {
    await page.viewport(1800, 850);
    renderGrid();
    await page.getByRole("button", { name: "EVA 0: Expand into stations", exact: true }).click();
    const scroll = harness.container.querySelector(`.${gridStyles.gridScroll}`) as HTMLElement;
    for (const width of [550, 1600]) {
      scroll.style.width = `${width}px`;
      const header = harness.container.querySelector(`.${gridStyles.header}`)!;
      const band = harness.container.querySelector(`.${comparisonStyles.groupHeaderRow}`)!;
      const row = harness.container.querySelector(`.${comparisonStyles.metricRow}`)!;
      const cells = harness.container.querySelector(`.${gridStyles.tableRowCells}`)!;
      expect(band.getBoundingClientRect().right).toBeCloseTo(
        cells.getBoundingClientRect().right,
        0
      );
      expect(header.getBoundingClientRect().right).toBeCloseTo(
        row.getBoundingClientRect().right,
        0
      );
      expect(band.getBoundingClientRect().width).toBeGreaterThanOrEqual(scroll.clientWidth);
    }
  });
});
