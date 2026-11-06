import { setChecked } from "./dashboardBrowserActions";
import { exactText } from "./browserAssertions";
import type { Locator, BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { seedAction } from "tests/playwright/fixtures/entitySeeds";
import {
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  selectPlanningEva,
  selectPlanningStationActions,
} from "./planningHelpers";

function total(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .getBySelector("../..")
    .getBySelector('[class*="displayFieldValue"]');
}

async function setNumber(page: Page, label: string, value: string): Promise<void> {
  const dialog = await openPlanningField(page, label);
  await dialog.getByLabelText(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
  await expect.poll(() => dialog.length).toBe(0);
}

async function openTraverse(page: Page): Promise<void> {
  await selectPlanningEva(page, "Survey Alpha");
  await page
    .getByLabelText("evaList-item", { exact: true })
    .filter({ hasText: "Survey Alpha" })
    .getByText("Alpha to Bravo", { exact: true })
    .click();
  await page.getByLabelText("info_panel", { exact: true }).click();
}

test.describe("Calculation contracts", () => {
  for (const fixture of [
    {
      name: "separate crew and unassigned work",
      durations: [10, 4, 1],
      crews: [["EV1"], ["EV2"], []],
      work: 15,
      ev1: 10,
      ev2: 4,
      dwell: 10,
      warning: true,
    },
    {
      name: "joint crew and solo work",
      durations: [3, 2, 5],
      crews: [["EV1", "EV2"], ["EV1"], ["EV2"]],
      work: 10,
      ev1: 5,
      ev2: 8,
      dwell: 8,
      warning: false,
    },
  ] as const) {
    test(`${fixture.name} retains distinct work, crew and dwell totals through station and EVA views`, async ({
      page,
      mission,
    }) => {
      await mission.change((doc) => {
        const uuids = [
          mission.ids.actionA,
          "30000000-0000-4000-8000-000000000070",
          "30000000-0000-4000-8000-000000000071",
        ];
        fixture.durations.forEach((duration, index) => {
          doc.actions[uuids[index]] = seedAction({
            uuid: uuids[index],
            refUuid: uuids[index],
            name: `Task ${index + 1}`,
            stationUuid: mission.ids.stationA,
            duration,
            crewAssigned: [...fixture.crews[index]],
            location: { lat: 0.001, lng: 0.001 },
          });
        });
        doc.stations[mission.ids.stationA].actionOrderUuids = uuids;
        for (const station of Object.values(doc.stations)) station.duration = 0;
        doc.stations[mission.ids.stationA].duration = null;
        for (const traverse of Object.values(doc.traverses)) traverse.duration = 0;
      });
      const before = await mission.read();
      await mission.open();
      await selectPlanningStationActions(page, "Alpha station");
      await expect
        .element(total(page, "Total Action Time (mins):"))
        .toHaveTextContent(exactText(String(fixture.work)));
      await expect
        .element(total(page, "EV1 Action Time (mins):"))
        .toHaveTextContent(exactText(String(fixture.ev1)));
      await expect
        .element(total(page, "EV2 Action Time (mins):"))
        .toHaveTextContent(exactText(String(fixture.ev2)));
      await expect
        .element(total(page, "Dwell Time (mins):"))
        .toHaveTextContent(exactText(String(fixture.dwell)));
      if (fixture.warning)
        await expect
          .element(total(page, "Dwell Time (mins):"))
          .toHaveAttribute("data-tooltip-content", "Crew assignments incomplete");
      else
        await expect
          .element(total(page, "Dwell Time (mins):"))
          .not.toHaveAttribute("data-tooltip-content");
      await selectPlanningEva(page, "Survey Alpha");
      await page.getByLabelText("info_panel", { exact: true }).click();
      await expect
        .element(total(page, "Action Time (mins):"))
        .toHaveTextContent(exactText(String(fixture.work)));
      await expect
        .element(total(page, "EV1 Action Time (mins):"))
        .toHaveTextContent(exactText(String(fixture.ev1)));
      await expect
        .element(total(page, "EV2 Action Time (mins):"))
        .toHaveTextContent(exactText(String(fixture.ev2)));
      await expect
        .element(total(page, "Station Time (mins):"))
        .toHaveTextContent(exactText(String(fixture.dwell)));
      await expect
        .element(total(page, "EVA Duration (mins):"))
        .toHaveTextContent(exactText(String(fixture.dwell)));
      expect(await mission.read()).toEqual(before);
    });
  }

  test("500 meter travel uses traverse then EVA then mission rate and zero restores inherited calculations", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.traverseRate = 3;
      doc.evas[mission.ids.evaA].traverseRate = null;
      doc.traverses[mission.ids.traverseA].traverseRate = null;
      doc.traverses[mission.ids.traverseA].duration = null;
      doc.traverses[mission.ids.traverseA].pathSegmentDistances = [250, 250];
      for (const station of Object.values(doc.stations)) station.duration = 0;
      doc.traverses[mission.ids.traverseOutbound].duration = 0;
      doc.traverses[mission.ids.traverseReturn].duration = 0;
    });
    await mission.open();
    await enablePlanningEditMode(page);
    const check = async (minutes: number) => {
      await openTraverse(page);
      await expect
        .element(total(page, "Movement Time (mins):"))
        .toHaveTextContent(exactText(String(minutes)));
      const sequence = page
        .getByLabelText("evaList-item", { exact: true })
        .filter({ hasText: "Survey Alpha" });
      const row = sequence
        .getByText("Alpha to Bravo", { exact: true })
        .getBySelector("xpath=ancestor::div[./div[contains(@class,'evaTraverseIndicator')]][1]");
      await expect
        .element(row.getBySelector('[data-tooltip-content="Est traverse time"]'))
        .toHaveTextContent(exactText(`0:${String(minutes).padStart(2, "0")}`));
      await selectPlanningEva(page, "Survey Alpha");
      await page.getByLabelText("info_panel", { exact: true }).click();
      await expect
        .element(total(page, "Traverse Time (mins):"))
        .toHaveTextContent(exactText(String(minutes)));
      await expect
        .element(total(page, "EVA Duration (mins):"))
        .toHaveTextContent(exactText(String(minutes)));
    };
    await check(10);
    await setNumber(page, "Average Traverse Rate", "6");
    await check(5);
    await openTraverse(page);
    await setNumber(page, "Average Traverse Rate", "1.5");
    await check(20);
    await openPlanningSection(page, "mission");
    await page.getByLabelText("prefs_panel", { exact: true }).click();
    await setNumber(page, "Average traverse rate", "2");
    await check(20);
    await openTraverse(page);
    await setNumber(page, "Average Traverse Rate", "0");
    await check(5);
    await setNumber(page, "Average Traverse Rate", "0");
    await check(15);
    await openTraverse(page);
    await setNumber(page, "Average Traverse Rate", "");
    await check(15);
    await setNumber(page, "Average Traverse Rate", "");
    await check(15);
    await expect
      .poll(async () => (await mission.read()).traverses[mission.ids.traverseA].traverseRate)
      .toBeNull();
    await mission.open();
    await check(15);
    await openPlanningSection(page, "mission");
    await page.getByLabelText("export_panel", { exact: true }).click();
    await setChecked(page.getBySelector("#export-traverses"), true);
    const download = await mission.captureDownload(async () => {
      await page.getByLabelText("Export JSON File", { exact: true }).click();
    });
    const report: { traverses: ExportTraverse[] } = JSON.parse(await download.blob.text());
    expect(
      report.traverses.find((traverse) => traverse.uuid === mission.ids.traverseA).calculatedFields
    ).toMatchObject({ movementDurationMinutes: 15, durationMinutes: 15 });
  }, 30000);
});
