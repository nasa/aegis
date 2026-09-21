import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import ReportColumnPanel from "components/panes/reports/shared/report-column-panel";
import ReportColumnHeader from "components/panes/reports/shared/report-column-header";
import { ReportIdProvider } from "components/panes/reports/reports-context";
import { reportSetColumnDerivedData, reportSlice, reportToggleColumnExpansion } from "store/report";
import styles from "components/panes/reports/shared/report-grid.module.css";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";
import "styles/globals.css";

const longName = "EVA 3 - P5, S5, S7 Replan (As Executed)";
const columns: EvaReportColumn[] = [
  {
    key: "eva",
    kind: "eva",
    evaUuid: "eva",
    isRex: false,
    label: longName,
    groupKey: "eva",
    groupLabel: longName,
  },
  {
    key: "rex",
    kind: "rex",
    evaUuid: "eva",
    isRex: true,
    label: longName,
    groupKey: "eva",
    groupLabel: longName,
  },
  {
    key: "other",
    kind: "eva",
    evaUuid: "other",
    isRex: false,
    label: "Traverse Practice",
    groupKey: "other",
    groupLabel: "Traverse Practice",
  },
];
const makeStore = () => configureStore({ reducer: { report: reportSlice.reducer } });
let store: ReturnType<typeof makeStore>;
let harness: ReactHarness;
const Panel = () => {
  const hidden = useAppSelector((state) => state.report.comparison.hiddenColumns, shallowEqual);
  return <ReportColumnPanel allColumns={columns} hiddenColumnKeys={hidden} />;
};
beforeEach(() => {
  store = makeStore();
  store.dispatch(
    reportSetColumnDerivedData({
      reportId: "comparison",
      data: {
        visibleColumns: columns,
        resolvedBaselineKey: "eva",
        visibleRowIds: null,
        sequenceByColumnKey: {
          eva: [
            {
              uuid: "station",
              name: "Station with a long descriptive name at the crater rim",
              type: "traverse",
            },
          ],
        },
      },
    })
  );
  harness = createReactHarness();
  Object.assign(harness.container.style, {
    width: "700px",
    background: "var(--grey2)",
    color: "white",
  });
  harness.container.style.setProperty("--stmCoverageStationCellWidth", "40px");
  harness.render(
    <Provider store={store}>
      <ReportIdProvider value="comparison">
        <Panel />
        <ReportColumnHeader leftAxis={<div>Metric</div>} />
      </ReportIdProvider>
    </Provider>
  );
});
afterEach(() => harness.unmount());

describe("Report column controls", () => {
  it("filters groups, applies bulk selection only to matches, and restores focus on Escape", async () => {
    await page.getByRole("button", { name: /^View/ }).click();
    await page.getByRole("searchbox").fill("Traverse");
    await page.getByRole("button", { name: "Hide matches" }).click();
    expect(store.getState().report.comparison.hiddenColumns).toEqual(["other"]);
    expect(store.getState().report.stmCoverage.hiddenColumns).toEqual([]);
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.textContent).toContain("View");
  });

  it("retains individual execution selection and indicates a partially selected family", async () => {
    await page.getByRole("button", { name: /^View/ }).click();
    await page.getByRole("button", { name: `Expand ${longName}` }).click();
    await page.getByRole("checkbox", { name: `Show REX: ${longName}`, exact: true }).click();
    expect(store.getState().report.comparison.hiddenColumns).toEqual(["rex"]);
    const groupCheckbox = document.querySelector<HTMLInputElement>(
      `input[aria-label="Show ${longName}"]`
    )!;
    expect(groupCheckbox.indeterminate).toBe(true);
    await page.getByRole("button", { name: "Close column selector" }).click();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("wraps long summary and station names within a bounded height without changing column widths", async () => {
    const labels = () => [
      ...harness.container.querySelectorAll<HTMLElement>(`.${styles.rotatedLabel}`),
    ];
    expect(labels()[0].textContent).toBe(longName);
    expect(labels()[1].textContent).toBe(`REX: ${longName}`);
    const assertFits = () => {
      for (const label of labels()) {
        expect(label.scrollHeight).toBeLessThanOrEqual(label.clientHeight + 1);
        expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth + 1);
        const rect = label.getBoundingClientRect();
        const parent = label.parentElement!.getBoundingClientRect();
        expect(rect.height).toBeLessThanOrEqual(240);
        expect(rect.top).toBeGreaterThanOrEqual(parent.top);
        expect(rect.bottom).toBeLessThanOrEqual(parent.bottom);
        expect(rect.left).toBeGreaterThanOrEqual(parent.left);
        expect(rect.right).toBeLessThanOrEqual(parent.right);
      }
    };
    assertFits();
    expect(labels()[1].getBoundingClientRect().width).toBeGreaterThan(
      parseFloat(getComputedStyle(labels()[1]).lineHeight)
    );
    store.dispatch(reportToggleColumnExpansion({ reportId: "comparison", columnKey: "eva" }));
    await expect
      .poll(() => labels().some((label) => label.textContent?.includes("crater rim")))
      .toBe(true);
    assertFits();
    expect(
      harness.container.querySelector(`.${styles.columnGroup}`)!.getBoundingClientRect().width
    ).toBe(80);
  });

  it.each(["comparison", "stmCoverage"] as const)(
    "contains exceptionally long names and preserves tooltips in %s",
    async (reportId) => {
      const name = "Station".repeat(40);
      store.dispatch(
        reportSetColumnDerivedData({
          reportId,
          data: {
            visibleColumns: [{ ...columns[0], label: name }],
            resolvedBaselineKey: "eva",
            visibleRowIds: null,
            sequenceByColumnKey: {
              eva: [{ uuid: "station", name, type: "traverse" }],
            },
          },
        })
      );
      store.dispatch(reportToggleColumnExpansion({ reportId, columnKey: "eva" }));
      const stationWidth = reportId === "comparison" ? 40 : 22;
      harness.container.style.setProperty("--stmCoverageStationCellWidth", `${stationWidth}px`);
      harness.render(
        <Provider store={store}>
          <ReportIdProvider value={reportId}>
            <ReportColumnHeader leftAxis={<div>Metric</div>} />
          </ReportIdProvider>
        </Provider>
      );
      const station = harness.container.querySelector<HTMLElement>(`.${styles.stationHeaderCell}`)!;
      expect(station.dataset.tooltipHtml).toBe(name);
      expect(station.getBoundingClientRect().width).toBe(stationWidth);
      expect(
        harness.container.querySelector(`.${styles.columnGroup}`)!.getBoundingClientRect().width
      ).toBe(stationWidth + 40);
      expect(
        harness.container.querySelector(`.${styles.header}`)!.getBoundingClientRect().height
      ).toBeLessThanOrEqual(261);
      for (const label of harness.container.querySelectorAll<HTMLElement>(
        `.${styles.rotatedLabel}`
      )) {
        const rect = label.getBoundingClientRect();
        const parent = label.parentElement!.getBoundingClientRect();
        expect(rect.height).toBeLessThanOrEqual(240);
        expect(rect.left).toBeGreaterThanOrEqual(parent.left);
        expect(rect.right).toBeLessThanOrEqual(parent.right);
        expect(rect.bottom).toBeLessThanOrEqual(parent.bottom);
      }
    }
  );
});
