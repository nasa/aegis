import { readFile } from "node:fs/promises";
import type { Locator } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import { test, expect } from "../fixtures/behavioralTest";
import { expectMapLabel } from "../fixtures/mapAssertions";
import { MISSION_NAMES } from "../fixtures/missionSeed";
import {
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  selectPlanningStation,
  selectPlanningStationActions,
} from "./planningHelpers";

async function textContrastRatio(alert: Locator): Promise<number> {
  return alert.evaluate((element) => {
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
  });
}

test.describe("ACCESS-001 keyboard and dialog focus", () => {
  test("keyboard edit focuses the dialog field and restores focus after dismissal", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, MISSION_NAMES.stationA);
    const trigger = page.getByRole("button", { name: "Action Name edit", exact: true });
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(trigger).toBeFocused();
    await expect
      .poll(() => trigger.evaluate((element) => getComputedStyle(element).outlineStyle))
      .not.toBe("none");
    await page.keyboard.press("Enter");

    const dialog = page.locator("dialog[open]");
    const input = dialog.getByLabel("Action Name", { exact: true });
    await expect(input).toBeFocused();
    await input.fill("");
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect((await mission.read()).actions[mission.ids.actionA].name).toBe("Sample regolith");

    await page.keyboard.press("Enter");
    const reopenedInput = dialog.getByLabel("Action Name", { exact: true });
    await expect(reopenedInput).toBeFocused();
    await reopenedInput.fill("Keyboard sample action");
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].name)
      .toBe("Keyboard sample action");
  });
});

test.describe("ACCESS-002 responsive editor and dashboard", () => {
  test.use({ deviceScaleFactor: 2 });

  test("editor controls and map remain reachable at narrow and wide viewports", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
    for (const width of [360, 641, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByLabel("globalEditToggle", { exact: true })).toBeVisible();
      await expect(page.locator('[data-map-mode="editor"] .ol-viewport')).toBeVisible();
      await expect
        .poll(async () => {
          const bounds = await page.locator('[data-map-mode="editor"]').boundingBox();
          return bounds ? bounds.x + bounds.width : Infinity;
        })
        .toBeLessThanOrEqual(width + 1);
      const bounds = await page.locator('[data-map-mode="editor"]').boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      expect(bounds!.width).toBeGreaterThan(100);
      if (width === 360) {
        await enablePlanningEditMode(page);
        await openPlanningSection(page, "mission");
        const nameTrigger = page.getByRole("button", { name: "Mission Name edit", exact: true });
        await nameTrigger.focus();
        await page.keyboard.press("Enter");
        const dialog = page.locator("dialog[open]");
        await expect(dialog.getByLabel("Mission Name", { exact: true })).toBeVisible();
        const dialogBounds = await dialog.getByLabel("Mission Name", { exact: true }).boundingBox();
        expect(dialogBounds).not.toBeNull();
        expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
        expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(width + 1);
        await page.keyboard.press("Escape");
        await expect(nameTrigger).toBeFocused();
        await page.getByLabel("evas Section", { exact: true }).click();
        await expect(page.getByLabel("evaList-item")).toHaveCount(2);
      }
    }
  });

  test("long labels, report text and timeline canvas stay inside the narrow editor viewport", async ({
    page,
    mission,
  }) => {
    const longStationName = "North Ridge Surface Operations Station ".repeat(5).trim();
    await mission.change((doc) => {
      doc.stations[mission.ids.stationA].name = longStationName;
      doc.traverses[mission.ids.traverseA].duration = 9999;
    });
    await page.setViewportSize({ width: 360, height: 900 });
    await mission.open(page);
    await page.getByLabel("station Section", { exact: true }).click();
    const stationRow = page
      .getByLabel("stationList-item", { exact: true })
      .filter({ hasText: longStationName });
    await expect(stationRow).toContainText(longStationName);
    const stationName = stationRow.locator("div").nth(1);
    const stationNameLayout = await stationName.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(stationNameLayout.clientWidth).toBeGreaterThan(0);
    expect(stationNameLayout.scrollWidth).toBeLessThanOrEqual(stationNameLayout.clientWidth + 1);

    await page.getByLabel("evas Section", { exact: true }).click();
    await page
      .getByLabel("evaList-item")
      .filter({ hasText: MISSION_NAMES.evaA })
      .getByText(MISSION_NAMES.evaA, { exact: true })
      .click();
    await page.getByText(MISSION_NAMES.traverseA, { exact: true }).click();
    await page.getByLabel("report_panel", { exact: true }).click();
    await expect(page.getByText("Traverse Report", { exact: true })).toBeVisible();
    const reportPanel = page.locator('[class*="rightControl"]').last();
    const reportBounds = await reportPanel.boundingBox();
    expect(reportBounds).not.toBeNull();
    expect(reportBounds!.x).toBeGreaterThanOrEqual(0);
    expect(reportBounds!.x + reportBounds!.width).toBeLessThanOrEqual(361);
    const warning = page.getByText(
      "Traverse duration is significantly more than the calculated total duration of actions and movement",
      { exact: true }
    );
    await expect(warning).toBeVisible();
    const warningSize = await warning.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      right: element.getBoundingClientRect().right,
    }));
    expect(warningSize.scrollWidth).toBeLessThanOrEqual(warningSize.clientWidth + 1);
    expect(warningSize.right).toBeLessThanOrEqual(361);

    await page.locator('[data-tooltip-content="Timeline"]').click();
    const timeline = page.locator('[class*="timelineContainer"]');
    await expect(timeline).toBeVisible();
    await expect
      .poll(() => timeline.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(1);
    const timelineLayout = await timeline.evaluate((element) => ({
      bounds: element.getBoundingClientRect().toJSON(),
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      canvas: element.querySelector("canvas")?.getBoundingClientRect().toJSON() ?? null,
    }));
    expect(timelineLayout.bounds.x).toBeGreaterThanOrEqual(0);
    expect(timelineLayout.bounds.right).toBeLessThanOrEqual(361);
    expect(timelineLayout.scrollWidth).toBeLessThanOrEqual(timelineLayout.clientWidth + 1);
    expect(timelineLayout.canvas).not.toBeNull();
    expect(timelineLayout.canvas!.left).toBeGreaterThanOrEqual(timelineLayout.bounds.left);
    expect(timelineLayout.canvas!.right).toBeLessThanOrEqual(timelineLayout.bounds.right + 1);
  });

  test.describe("active dashboard", () => {
    test.use({ scenario: "execution", deviceScaleFactor: 2 });

    test("dashboard map and minimap stay visible and within narrow and wide viewports", async ({
      page,
      mission,
    }) => {
      await page.goto(mission.dashboardUrl);
      expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
      for (const width of [360, 641, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const mode of ["dashboard", "minimap"]) {
          const map = page.locator(`[data-map-mode="${mode}"]`);
          await expect(map.locator(".ol-viewport")).toBeVisible();
          await expect
            .poll(async () => {
              const bounds = await map.boundingBox();
              return bounds ? bounds.x + bounds.width : Infinity;
            })
            .toBeLessThanOrEqual(width + 1);
          const bounds = await map.boundingBox();
          expect(bounds).not.toBeNull();
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
          expect(bounds!.width).toBeGreaterThan(80);
        }
        await expect(page.getByTestId("dashboard-pet-clock")).toBeVisible();
      }
    });
  });
});

test.describe("ACCESS-003 cross-browser map and dashboard parity", () => {
  test("known station, POI and traverse labels render in the editor map", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.planetRadius = 1737400;
    });
    await mission.open(page);
    const viewport = page.locator('[data-map-mode="editor"] .ol-viewport');
    const withoutLabels = await viewport.screenshot();
    await page.getByTestId("map-menu-launcher").click();
    const menu = page.getByTestId("map-menu-floating-panel");
    for (const category of ["Stations", "POIs"]) {
      await menu
        .getByText(category, { exact: true })
        .locator("..")
        .getByText("Labels", { exact: true })
        .click();
    }
    await menu.locator('svg[data-icon="xmark"]').click();
    await expectMapLabel(page, MISSION_NAMES.stationA, "editor");
    await expectMapLabel(page, MISSION_NAMES.poiA, "editor");
    await page.mouse.move(0, 0);
    expect((await viewport.screenshot()).equals(withoutLabels)).toBe(false);
    await page.getByLabel("evas Section", { exact: true }).click();
    await page
      .getByLabel("evaList-item")
      .filter({ hasText: MISSION_NAMES.evaA })
      .getByText(MISSION_NAMES.evaA, { exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate((uuid) => {
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
        }, mission.ids.traverseA)
      )
      .toEqual(["► 63°", "34m", "► 117°", "34m"]);
    const membership = await page.evaluate((stationUuid) => {
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
    }, mission.ids.stationA);
    expect(membership, "the known station must belong to a rendered editor layer source").toBe(
      true
    );
  });

  test.describe("active dashboard", () => {
    test.use({ scenario: "execution" });

    test("dashboard and minimap own the active execution and share its feature labels", async ({
      page,
      mission,
    }) => {
      await page.goto(mission.dashboardUrl);
      await expect(page.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
      await expect(page.locator('[data-map-mode="dashboard"] .ol-viewport')).toBeVisible();
      await expect(page.locator('[data-map-mode="minimap"] .ol-viewport')).toBeVisible();
      await expectMapLabel(page, "+00:03:00 / 1 (C)", "dashboard");
      const owners = await page.evaluate(() =>
        window.__aegisMaps
          .filter(
            (entry) =>
              ["dashboard", "minimap"].includes(entry.mode) &&
              entry.map.getTargetElement()?.isConnected
          )
          .map((entry) => entry.mode)
      );
      expect(owners.sort()).toEqual(["dashboard", "minimap"]);
    });
  });
});

test.describe("ACCESS-004 cross-browser editing and downloads", () => {
  test("keyboard text edit persists and mission export downloads valid JSON", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openPlanningSection(page, "mission");
    const trigger = page.getByRole("button", { name: "Mission Banner edit", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.locator("dialog[open]");
    await expect(dialog.getByLabel("Mission Banner", { exact: true })).toBeVisible();
    await dialog
      .getByLabel("Mission Banner", { exact: true })
      .fill("Keyboard updated surface plan");
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(trigger.locator('div[aria-label="Mission Banner"]')).toHaveText(
      "Keyboard updated surface plan"
    );
    await expect
      .poll(async () => (await mission.read()).missionBanner)
      .toBe("Keyboard updated surface plan");

    await page.getByLabel("export_panel", { exact: true }).click();
    await page.locator("#export-mission").setChecked(true);
    const pending = page.waitForEvent("download");
    await page.getByLabel("Export JSON File", { exact: true }).click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toContain("_export.json");
    const data = JSON.parse(await readFile(await download.path(), "utf8")) as {
      exportMission?: { missionBanner?: string };
    };
    expect(data.exportMission?.missionBanner).toBe("Keyboard updated surface plan");
  });
});

test.describe("ACCESS-005 accessible status and visual distinction", () => {
  test("report status is named and keyboard-operable when its warning icon changes", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.traverses[mission.ids.traverseA].duration = null;
    });
    await mission.open(page);
    await page.getByLabel("evas Section", { exact: true }).click();
    await page
      .getByLabel("evaList-item")
      .filter({ hasText: MISSION_NAMES.evaA })
      .getByText(MISSION_NAMES.evaA, { exact: true })
      .click();
    await page.getByText(MISSION_NAMES.traverseA, { exact: true }).click();
    const reportTab = page.getByRole("button", { name: "report_panel", exact: true });
    await expect(reportTab).toHaveAttribute("aria-description", "Reports: No warnings");
    await expect(reportTab.locator('svg[data-icon="check"]')).toBeVisible();

    await mission.change((doc) => {
      doc.traverses[mission.ids.traverseA].duration = 9999;
    });
    await expect(reportTab).toHaveAttribute("aria-description", "Reports: Warnings present");
    await expect(reportTab.locator('svg[data-icon="triangle-exclamation"]')).toBeVisible();
    await reportTab.focus();
    await page.keyboard.press("Space");
    await expect(reportTab).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByText("Traverse duration is significantly more", { exact: false })
    ).toBeVisible();
  });

  test("invalid numeric input exposes a readable error and prevents saving", async ({
    page,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, MISSION_NAMES.stationA);
    const dialog = await openPlanningField(page, "Time in minutes");
    await dialog.getByLabel("Time in minutes", { exact: true }).fill("0");
    await expect(dialog.getByRole("alert")).toHaveText("Must be a number greater than 0");
    expect(await textContrastRatio(dialog.getByRole("alert"))).toBeGreaterThanOrEqual(4.5);
    expect(await dialog.innerText()).toContain("Must be a number greater than 0");
    await expect(dialog.getByLabel("Time in minutes", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect((await mission.read()).stations[mission.ids.stationA].duration).toBe(15);

    await selectPlanningStationActions(page, MISSION_NAMES.stationA);
    const actionNameTrigger = page.getByRole("button", { name: "Action Name edit", exact: true });
    await actionNameTrigger.focus();
    await page.keyboard.press("Enter");
    const actionDialog = page.locator("dialog[open]");
    await actionDialog.getByLabel("Action Name", { exact: true }).fill("");
    await expect(actionDialog.getByRole("alert")).toHaveText("Required");
    await expect(actionDialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await expect(actionDialog.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
    await page.keyboard.press("Tab");
    await expect(actionDialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(actionDialog).toHaveCount(0);
    expect((await mission.read()).actions[mission.ids.actionA].name).toBe("Sample regolith");
  });
});
