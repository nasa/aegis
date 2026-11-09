import { commands, userEvent } from "vitest/browser";
import type { Locator } from "vitest/browser";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import { test, expect } from "./missionHarness";
import { expectMapLabel } from "./mapInteractions";
import { MISSION_NAMES } from "tests/playwright/fixtures/missionSeed";
import {
  enablePlanningEditMode,
  openPlanningField,
  selectPlanningStation,
  selectPlanningStationActions,
} from "./planningHelpers";
const executionTest = test.extend({ scenario: "execution" as BehavioralScenario });
import { exactText } from "./browserAssertions";
async function textContrastRatio(alert: Locator): Promise<number> {
  return ((element) => {
    const channels = (color: string) => color.match(/[\d.]+/g)?.map(Number) ?? [];
    const luminance = (color: string) => {
      const [red, green, blue] = channels(color)
        .slice(0, 3)
        .map((channel) => {
          const srgb = channel / 255;
          return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const foreground = luminance(getComputedStyle(element).color);
    let ancestor: HTMLElement | null = element.parentElement;
    let background = "rgba(0, 0, 0, 0)";
    while (ancestor && Number(channels(background)[3] ?? 0) === 0) {
      background = getComputedStyle(ancestor).backgroundColor;
      if (channels(background).length === 3) break;
      ancestor = ancestor.parentElement;
    }
    const behind = luminance(background);
    return (Math.max(foreground, behind) + 0.05) / (Math.min(foreground, behind) + 0.05);
  })(alert.element());
}
test("keyboard edit focuses the dialog field and restores focus after dismissal", async ({
  page,
  mission,
}) => {
  await mission.open();
  await enablePlanningEditMode(page);
  await selectPlanningStationActions(page, MISSION_NAMES.stationA);
  const trigger = page.getByRole("button", { name: "Action Name edit", exact: true });
  trigger.element().focus();
  await expect.element(trigger).toHaveFocus();
  await userEvent.keyboard("{Tab}");
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  await expect.element(trigger).toHaveFocus();
  await expect
    .poll(() => ((element) => getComputedStyle(element).outlineStyle)(trigger.element()))
    .not.toBe("none");
  await userEvent.keyboard("{Enter}");

  const dialog = page.getBySelector("dialog[open]");
  const input = dialog.getByLabelText("Action Name", { exact: true });
  await expect.element(input).toHaveFocus();
  await input.fill("");
  await userEvent.keyboard("{Tab}");
  await expect.element(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => dialog.length).toBe(0);
  await expect.element(trigger).toHaveFocus();
  expect((await mission.read()).actions[mission.ids.actionA].name).toBe("Sample regolith");

  await userEvent.keyboard("{Enter}");
  const reopenedInput = dialog.getByLabelText("Action Name", { exact: true });
  await expect.element(reopenedInput).toHaveFocus();
  await reopenedInput.fill("Keyboard sample action");
  await userEvent.keyboard("{Tab}");
  await expect.element(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveFocus();
  await userEvent.keyboard("{Tab}");
  await expect.element(dialog.getByRole("button", { name: "Save", exact: true })).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => dialog.length).toBe(0);
  await expect.element(trigger).toHaveFocus();
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA].name)
    .toBe("Keyboard sample action");
});
test("known station, POI and traverse labels render in the editor map", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.planetRadius = 1737400;
  });
  await mission.open();
  const viewport = page.getBySelector('[data-map-mode="editor"] .ol-viewport');
  const withoutLabels = (await viewport.screenshot({ base64: true })).base64;
  await page.getByTestId("map-menu-launcher").click();
  const menu = page.getByTestId("map-menu-floating-panel");
  for (const category of ["Stations", "POIs"]) {
    await menu
      .getByText(category, { exact: true })
      .getBySelector("..")
      .getByText("Labels", { exact: true })
      .click();
  }
  await menu.getBySelector('svg[data-icon="xmark"]').click();
  await expectMapLabel(MISSION_NAMES.stationA, "editor");
  await expectMapLabel(MISSION_NAMES.poiA, "editor");
  await commands.mapPointer("move", 0, 0);
  expect((await viewport.screenshot({ base64: true })).base64 === withoutLabels).toBe(false);
  await page.getByLabelText("evas Section", { exact: true }).click();
  await page
    .getByLabelText("evaList-item")
    .filter({ hasText: MISSION_NAMES.evaA })
    .getByText(MISSION_NAMES.evaA, { exact: true })
    .click();
  await expect
    .poll(() =>
      ((uuid) => {
        const map = window.__aegisMaps.find(
          (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
        )?.map;
        if (!map) return [];
        for (const candidate of map.getLayers().getArray()) {
          const layer = candidate as VectorLayer<VectorSource>;
          const source = layer.getSource?.();
          if (!source || !("getFeatureById" in source)) continue;
          const feature = source.getFeatureById(uuid);
          if (!feature || feature.get("name") !== "Alpha to Bravo") continue;
          const styles = layer.getStyleFunction()?.(feature, map.getView().getResolution() ?? 1);
          return (Array.isArray(styles) ? styles : styles ? [styles] : [])
            .map((style) => style.getText()?.getText())
            .filter(Boolean);
        }
        return [];
      })(mission.ids.traverseA)
    )
    .toEqual(["► 63°", "34m", "► 117°", "34m"]);
  const membership = await ((stationUuid) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    return map
      ?.getLayers()
      .getArray()
      .some((layer) => {
        const source = (
          layer as { getSource?: () => { getFeatureById?: (id: string) => unknown } }
        ).getSource?.();
        return Boolean(source?.getFeatureById?.(stationUuid));
      });
  })(mission.ids.stationA);
  expect(membership, "the known station must belong to a rendered editor layer source").toBe(true);
});
executionTest(
  "dashboard and minimap own the active execution and share its feature labels",
  async ({ page, mission }) => {
    await mission.openDashboard();
    await expect
      .element(page.getByTestId("dashboard-pet-clock"))
      .toMatchTextContent(exactText("+00:05:00"));
    await expect
      .element(page.getBySelector('[data-map-mode="dashboard"] .ol-viewport'))
      .toBeVisible();
    await expect
      .element(page.getBySelector('[data-map-mode="minimap"] .ol-viewport'))
      .toBeVisible();
    await expectMapLabel("+00:03:00 / 1 (C)", "dashboard");
    const owners = await (() =>
      window.__aegisMaps
        .filter(
          (entry) =>
            ["dashboard", "minimap"].includes(entry.mode) &&
            entry.map.getTargetElement()?.isConnected
        )
        .map((entry) => entry.mode))();
    expect(owners.sort()).toEqual(["dashboard", "minimap"]);
  }
);
test("report status is named and keyboard-operable when its warning icon changes", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.traverses[mission.ids.traverseA].duration = null;
  });
  await mission.open();
  await page.getByLabelText("evas Section", { exact: true }).click();
  await page
    .getByLabelText("evaList-item")
    .filter({ hasText: MISSION_NAMES.evaA })
    .getByText(MISSION_NAMES.evaA, { exact: true })
    .click();
  await page.getByText(MISSION_NAMES.traverseA, { exact: true }).click();
  const reportTab = page.getByRole("button", { name: "report_panel", exact: true });
  await expect.element(reportTab).toHaveAttribute("aria-description", "Reports: No warnings");
  await expect.element(reportTab.getBySelector('svg[data-icon="check"]')).toBeVisible();

  await mission.change((doc) => {
    doc.traverses[mission.ids.traverseA].duration = 9999;
  });
  await expect.element(reportTab).toHaveAttribute("aria-description", "Reports: Warnings present");
  await expect
    .element(reportTab.getBySelector('svg[data-icon="triangle-exclamation"]'))
    .toBeVisible();
  reportTab.element().focus();
  await userEvent.keyboard(" ");
  await expect.element(reportTab).toHaveAttribute("aria-pressed", "true");
  await expect
    .element(page.getByText("Traverse duration is significantly more", { exact: false }))
    .toBeVisible();
});
test("invalid numeric input exposes a readable error and prevents saving", async ({
  page,
  mission,
}) => {
  await mission.open();
  await enablePlanningEditMode(page);
  await selectPlanningStation(page, MISSION_NAMES.stationA);
  const dialog = await openPlanningField(page, "Time in minutes");
  await dialog.getByLabelText("Time in minutes", { exact: true }).fill("0");
  await expect
    .element(dialog.getByRole("alert"))
    .toMatchTextContent(exactText("Must be a number greater than 0"));
  expect(await textContrastRatio(dialog.getByRole("alert"))).toBeGreaterThanOrEqual(4.5);
  expect(await dialog.element().textContent).toContain("Must be a number greater than 0");
  await expect.element(dialog.getByLabelText("Time in minutes", { exact: true })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.poll(() => dialog.length).toBe(0);
  expect((await mission.read()).stations[mission.ids.stationA].duration).toBe(15);

  await selectPlanningStationActions(page, MISSION_NAMES.stationA);
  const actionNameTrigger = page.getByRole("button", { name: "Action Name edit", exact: true });
  actionNameTrigger.element().focus();
  await userEvent.keyboard("{Enter}");
  const actionDialog = page.getBySelector("dialog[open]");
  await actionDialog.getByLabelText("Action Name", { exact: true }).fill("");
  await expect.element(actionDialog.getByRole("alert")).toMatchTextContent(exactText("Required"));
  await expect
    .element(actionDialog.getByRole("button", { name: "Save", exact: true }))
    .toBeDisabled();
  await expect
    .element(actionDialog.getByRole("button", { name: "Cancel", exact: true }))
    .toBeEnabled();
  await userEvent.keyboard("{Tab}");
  await expect
    .element(actionDialog.getByRole("button", { name: "Cancel", exact: true }))
    .toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => actionDialog.length).toBe(0);
  expect((await mission.read()).actions[mission.ids.actionA].name).toBe("Sample regolith");
});
