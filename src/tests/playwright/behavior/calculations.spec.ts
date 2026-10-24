import { readFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedAction } from "../fixtures/entitySeeds";
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
    .locator("../..")
    .locator('[class*="displayFieldValue"]');
}

async function setNumber(page: Page, label: string, value: string): Promise<void> {
  const dialog = await openPlanningField(page, label);
  await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByText("Save", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function openTraverse(page: Page): Promise<void> {
  await selectPlanningEva(page, "Survey Alpha");
  await page
    .getByLabel("evaList-item", { exact: true })
    .filter({ hasText: "Survey Alpha" })
    .getByText("Alpha to Bravo", { exact: true })
    .click();
  await page.getByLabel("info_panel", { exact: true }).click();
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
      await mission.open(page);
      await selectPlanningStationActions(page, "Alpha station");
      await expect(total(page, "Total Action Time (mins):")).toHaveText(String(fixture.work));
      await expect(total(page, "EV1 Action Time (mins):")).toHaveText(String(fixture.ev1));
      await expect(total(page, "EV2 Action Time (mins):")).toHaveText(String(fixture.ev2));
      await expect(total(page, "Dwell Time (mins):")).toHaveText(String(fixture.dwell));
      if (fixture.warning)
        await expect(total(page, "Dwell Time (mins):")).toHaveAttribute(
          "data-tooltip-content",
          "Crew assignments incomplete"
        );
      else
        await expect(total(page, "Dwell Time (mins):")).not.toHaveAttribute("data-tooltip-content");
      await selectPlanningEva(page, "Survey Alpha");
      await page.getByLabel("info_panel", { exact: true }).click();
      await expect(total(page, "Action Time (mins):")).toHaveText(String(fixture.work));
      await expect(total(page, "EV1 Action Time (mins):")).toHaveText(String(fixture.ev1));
      await expect(total(page, "EV2 Action Time (mins):")).toHaveText(String(fixture.ev2));
      await expect(total(page, "Station Time (mins):")).toHaveText(String(fixture.dwell));
      await expect(total(page, "EVA Duration (mins):")).toHaveText(String(fixture.dwell));
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
    await mission.open(page);
    await enablePlanningEditMode(page);
    const check = async (minutes: number) => {
      await openTraverse(page);
      await expect(total(page, "Movement Time (mins):")).toHaveText(String(minutes));
      const sequence = page
        .getByLabel("evaList-item", { exact: true })
        .filter({ hasText: "Survey Alpha" });
      const row = sequence
        .getByText("Alpha to Bravo", { exact: true })
        .locator("xpath=ancestor::div[./div[contains(@class,'evaTraverseIndicator')]][1]");
      await expect(row.locator('[data-tooltip-content="Est traverse time"]')).toHaveText(
        `0:${String(minutes).padStart(2, "0")}`
      );
      await selectPlanningEva(page, "Survey Alpha");
      await page.getByLabel("info_panel", { exact: true }).click();
      await expect(total(page, "Traverse Time (mins):")).toHaveText(String(minutes));
      await expect(total(page, "EVA Duration (mins):")).toHaveText(String(minutes));
    };
    await check(10);
    await setNumber(page, "Average Traverse Rate", "6");
    await check(5);
    await openTraverse(page);
    await setNumber(page, "Average Traverse Rate", "1.5");
    await check(20);
    await openPlanningSection(page, "mission");
    await page.getByLabel("prefs_panel", { exact: true }).click();
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
    await mission.open(page);
    await check(15);
    await openPlanningSection(page, "mission");
    await page.getByLabel("export_panel", { exact: true }).click();
    await page.locator("#export-traverses").check();
    const pending = page.waitForEvent("download");
    await page.getByLabel("Export JSON File", { exact: true }).click();
    const download = await pending;
    const report: { traverses: ExportTraverse[] } = JSON.parse(
      await readFile(await download.path(), "utf8")
    );
    expect(
      report.traverses.find((traverse) => traverse.uuid === mission.ids.traverseA).calculatedFields
    ).toMatchObject({ movementDurationMinutes: 15, durationMinutes: 15 });
  });
});
