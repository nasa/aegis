import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedAction } from "../fixtures/entitySeeds";
import {
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  planningEvaRow,
  selectPlanningEva,
  selectPlanningStation,
  selectPlanningStationActions,
} from "./planningHelpers";

const equipment = "82000000-0000-4000-8000-000000000001";
const otherAction = "82000000-0000-4000-8000-000000000002";
const disabledAction = "82000000-0000-4000-8000-000000000003";

function total(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .locator("../..")
    .locator('[class*="displayFieldValue"]');
}

async function exportEvas(page: Page): Promise<ExportEva[]> {
  await openPlanningSection(page, "mission");
  await page.getByLabel("export_panel", { exact: true }).click();
  await page.locator("#export-all-evas").check();
  const pending = page.waitForEvent("download");
  await page.getByLabel("Export JSON File", { exact: true }).click();
  const download = await pending;
  return JSON.parse(await readFile(await download.path(), "utf8")).evas;
}

async function openEvaInfo(page: Page) {
  await selectPlanningEva(page, "Survey Alpha");
  await page.getByLabel("info_panel", { exact: true }).click();
}

async function openTraverse(page: Page) {
  await selectPlanningEva(page, "Survey Alpha");
  await planningEvaRow(page, "Survey Alpha").getByText("Alpha to Bravo", { exact: true }).click();
  await page.getByLabel("info_panel", { exact: true }).click();
}

function actionRow(page: Page, name: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.locator('div[aria-label="Action Name"]').filter({ hasText: name }) });
}

async function toggleAction(page: Page, name: string, command: string) {
  await actionRow(page, name).locator('svg[data-icon="ellipsis-vertical"]').click();
  await page.locator("dialog[open]").getByText(command, { exact: true }).click();
}

test("enabled station and traverse work controls EVA resources, timeline and report totals through deactivation and reactivation", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    doc.equipmentItems = { [equipment]: { name: "Sample bags", singleUse: true, quantity: 99 } };
    for (const station of Object.values(doc.stations)) station.duration = 0;
    for (const traverse of Object.values(doc.traverses)) {
      traverse.duration = 0;
      traverse.pathSegmentDistances = [];
      traverse.path = [];
      traverse.pathSegmentElevations = [];
    }
    doc.stations[mission.ids.stationA].duration = null;
    doc.traverses[mission.ids.traverseA].duration = null;
    doc.traverses[mission.ids.traverseA].traverseRate = 3;
    doc.traverses[mission.ids.traverseA].pathSegmentDistances = [500];
    doc.traverses[mission.ids.traverseA].path = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: ((500 / 6378137) * 180) / Math.PI },
    ];
    doc.traverses[mission.ids.traverseA].pathSegmentElevations = [[0, 0]];
    doc.actions[mission.ids.actionA] = seedAction({
      uuid: mission.ids.actionA,
      refUuid: mission.ids.actionA,
      name: "Station work",
      stationUuid: mission.ids.stationA,
      duration: 6,
      crewAssigned: ["EV1"],
      mass: 1500,
      equipmentItemsUsage: { [equipment]: { quantityUsed: 2 } },
    });
    doc.actions[otherAction] = seedAction({
      uuid: otherAction,
      refUuid: otherAction,
      name: "Traverse work",
      traverseUuid: mission.ids.traverseA,
      duration: 5,
      crewAssigned: ["EV2"],
      mass: 250,
      equipmentItemsUsage: { [equipment]: { quantityUsed: 3 } },
    });
    doc.actions[disabledAction] = seedAction({
      uuid: disabledAction,
      refUuid: disabledAction,
      name: "Excluded work",
      stationUuid: mission.ids.stationA,
      duration: 99,
      crewAssigned: ["EV1", "EV2"],
      mass: 99000,
      enabled: false,
      equipmentItemsUsage: { [equipment]: { quantityUsed: 99 } },
    });
    doc.stations[mission.ids.stationA].actionOrderUuids = [mission.ids.actionA, disabledAction];
    doc.traverses[mission.ids.traverseA].actionOrderUuids = [otherAction];
  });
  await mission.open(page);
  await enablePlanningEditMode(page);
  const check = async (enabled: boolean) => {
    await selectPlanningStationActions(page, "Alpha station");
    await expect(total(page, "Total Action Time (mins):")).toHaveText(enabled ? "6" : "0");
    await expect(total(page, "Total Planned Mass (g):")).toHaveText(enabled ? "1500" : "0");
    await expect(actionRow(page, "Excluded work")).toBeVisible();
    await openEvaInfo(page);
    for (const [label, value] of Object.entries({
      "Number of Actions:": enabled ? "2" : "1",
      "Action Time (mins):": enabled ? "11" : "5",
      "EV1 Action Time (mins):": enabled ? "6" : "0",
      "EV2 Action Time (mins):": "5",
      "Total Mass (g):": enabled ? "1750" : "250",
      "Station Time (mins):": enabled ? "6" : "0",
      "Traverse Time (mins):": "15",
      "EVA Duration (mins):": enabled ? "21" : "15",
    }))
      await expect(total(page, label)).toHaveText(value);
    const consumable = page.getByText("Sample bags", { exact: true }).locator("../..");
    await expect(consumable).toContainText(enabled ? "5" : "3");
    await page.getByLabel("actions_panel", { exact: true }).click();
    await expect(actionRow(page, "Station work")).toBeVisible();
    await expect(actionRow(page, "Traverse work")).toBeVisible();
    await expect(actionRow(page, "Excluded work")).toBeVisible();
    const exported = (await exportEvas(page)).find((eva) => eva.uuid === mission.ids.evaA)!;
    expect(exported.calculatedFields).toMatchObject({
      actionCount: enabled ? 2 : 1,
      totalMass: enabled ? 1750 : 250,
      totalEquipmentItems: { [equipment]: { quantityUsed: enabled ? 5 : 3 } },
      totalResolvedEvaTime: enabled ? 21 : 15,
    });
    const station = exported.calculatedFields.sequenceItemsCalculatedData.find(
      (item) => item.uuid === mission.ids.stationA
    )!;
    expect(station.endSeconds - station.startSeconds).toBe(enabled ? 360 : 0);
    await page.getByLabel("reports Section", { exact: true }).click();
    await page.getByText("EVA Comparison", { exact: true }).click();
    const reportCell = (label: string) =>
      page
        .locator(`div[data-tooltip-html="${label}"]`)
        .locator("..")
        .locator('[class*="tableRowCells"] > [data-tooltip-id="aegis-tooltip"]')
        .first();
    await expect(reportCell("Action count")).toHaveText(enabled ? "2" : "1");
    await expect(reportCell("Planned sample mass")).toHaveText(enabled ? "1.8" : "0.3");
    await expect(reportCell("Single-use consumables")).toHaveText(enabled ? "5" : "3");
  };
  await check(true);
  await selectPlanningStationActions(page, "Alpha station");
  await toggleAction(page, "Station work", "Deactivate Action");
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA].enabled)
    .toBe(false);
  await check(false);
  await mission.open(page);
  await enablePlanningEditMode(page);
  await check(false);
  await selectPlanningStationActions(page, "Alpha station");
  await toggleAction(page, "Station work", "Activate Action");
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA].enabled)
    .toBe(true);
  await check(true);
  const final = await mission.read();
  expect(final.actions[disabledAction].enabled).toBe(false);
  expect(final.stations[mission.ids.stationA].actionOrderUuids).toEqual([
    mission.ids.actionA,
    disabledAction,
  ]);
});

test("fractional sequence estimates retain raw seconds while displayed totals ceil each item and manual overrides preserve zero and negative data", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    for (const station of Object.values(doc.stations)) station.duration = 0;
    for (const traverse of Object.values(doc.traverses)) {
      traverse.duration = 0;
      traverse.pathSegmentDistances = [];
      traverse.path = [];
      traverse.pathSegmentElevations = [];
    }
    doc.actions[mission.ids.actionA].duration = 1.2;
    doc.stations[mission.ids.stationA].duration = null;
    doc.actions[otherAction] = seedAction({
      uuid: otherAction,
      refUuid: otherAction,
      stationUuid: mission.ids.stationB,
      duration: 1.2,
      crewAssigned: ["EV2"],
      name: "Fractional second item",
    });
    doc.stations[mission.ids.stationB].actionOrderUuids = [otherAction];
    doc.stations[mission.ids.stationB].duration = null;
  });
  await mission.open(page);
  await openEvaInfo(page);
  await expect(total(page, "Station Time (mins):")).toHaveText("4");
  await expect(total(page, "Action Time (mins):")).toHaveText("3");
  let exported = (await exportEvas(page)).find((eva) => eva.uuid === mission.ids.evaA)!;
  expect(
    exported.calculatedFields.sequenceItemsCalculatedData
      .filter((item) =>
        [mission.ids.stationA, mission.ids.stationB].includes(
          item.uuid as typeof mission.ids.stationA
        )
      )
      .map((item) => ({ start: item.manualStartSeconds, end: item.manualEndSeconds }))
  ).toEqual([
    { start: 0, end: 72 },
    { start: 72, end: 144 },
  ]);
  for (const [value, totalMinutes] of [
    [0, "2"],
    [-1, "1"],
    [7, "9"],
  ] as const) {
    await mission.change((doc) => {
      doc.stations[mission.ids.stationA].duration = value;
    });
    await openEvaInfo(page);
    await expect(total(page, "Station Time (mins):")).toHaveText(totalMinutes);
    exported = (await exportEvas(page)).find((eva) => eva.uuid === mission.ids.evaA)!;
    expect(
      exported.calculatedFields.sequenceItemsCalculatedData.find(
        (item) => item.uuid === mission.ids.stationA
      )
    ).toMatchObject({
      startSeconds: 0,
      endSeconds: 72,
      manualStartSeconds: 0,
      manualEndSeconds: value * 60,
      resolvedDurationMins: value,
    });
  }
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabel("info_panel", { exact: true }).click();
  await enablePlanningEditMode(page);
  for (const invalid of ["0", "-1"]) {
    const dialog = await openPlanningField(page, "Time in minutes");
    await dialog.getByLabel("Time in minutes", { exact: true }).fill(invalid);
    await expect(dialog.getByText("Save", { exact: true })).toBeDisabled();
    await expect(dialog.getByLabel("Time in minutes", { exact: true })).toBeVisible();
    await dialog.getByText("Cancel", { exact: true }).click();
    expect((await mission.read()).stations[mission.ids.stationA].duration).toBe(7);
  }
  const decimal = await openPlanningField(page, "Time in minutes");
  await decimal.getByLabel("Time in minutes", { exact: true }).fill("1.2");
  await expect(decimal.getByLabel("Time in minutes", { exact: true })).toHaveValue("12");
  await decimal.getByText("Cancel", { exact: true }).click();
  expect((await mission.read()).stations[mission.ids.stationA].duration).toBe(7);
});

test("ten minutes movement plus five minutes traverse work exposes combined durations and distinct calculated and resolved clocks", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    for (const station of Object.values(doc.stations)) station.duration = 0;
    for (const traverse of Object.values(doc.traverses)) {
      traverse.duration = 0;
      traverse.pathSegmentDistances = [];
      traverse.path = [];
      traverse.pathSegmentElevations = [];
    }
    doc.actions[mission.ids.actionA].enabled = false;
    doc.traverses[mission.ids.traverseA].duration = null;
    doc.traverses[mission.ids.traverseA].pathSegmentDistances = [500];
    doc.traverses[mission.ids.traverseA].path = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: ((500 / 6378137) * 180) / Math.PI },
    ];
    doc.traverses[mission.ids.traverseA].pathSegmentElevations = [[0, 0]];
    doc.traverses[mission.ids.traverseA].traverseRate = 3;
    doc.actions[otherAction] = seedAction({
      uuid: otherAction,
      refUuid: otherAction,
      name: "Traverse dwell",
      traverseUuid: mission.ids.traverseA,
      crewAssigned: ["EV1"],
      duration: 5,
    });
    doc.traverses[mission.ids.traverseA].actionOrderUuids = [otherAction];
  });
  await mission.open(page);
  await openTraverse(page);
  await expect(total(page, "Movement Time (mins):")).toHaveText("10");
  await expect(total(page, "Dwell Time (mins):")).toHaveText("5");
  await expect(page.getByText("Using Calculated Total: 15", { exact: true })).toBeVisible();
  await expect(
    planningEvaRow(page, "Survey Alpha")
      .locator('[data-tooltip-content="Est traverse time"]')
      .nth(1)
  ).toHaveText("0:15");
  await openEvaInfo(page);
  await expect(total(page, "Traverse Time (mins):")).toHaveText("15");
  await expect(total(page, "EVA Duration (mins):")).toHaveText("15");
  const exported = (await exportEvas(page)).find((eva) => eva.uuid === mission.ids.evaA)!;
  expect(
    exported.calculatedFields.sequenceItemsCalculatedData.find(
      (item) => item.uuid === mission.ids.traverseA
    )
  ).toMatchObject({
    startSeconds: 0,
    endSeconds: 900,
    manualStartSeconds: 0,
    manualEndSeconds: 900,
    resolvedDurationMins: 15,
  });
  expect(
    exported.sequenceReadable
      .filter((item): item is ExportTraverse => item._itemType === "Traverse")
      .find((item) => item.uuid === mission.ids.traverseA).calculatedFields
  ).toMatchObject({ movementDurationMinutes: 10, durationMinutes: 10, totalDwellTime: 5 });
});

test("station override warnings use strict ratio boundaries and retain exact severity independently of rounded totals", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actions[mission.ids.actionA].duration = 100;
    doc.stations[mission.ids.stationA].duration = 100;
  });
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPlanningStation(page, "Alpha station");
  for (const fixture of [
    { value: 74, text: "is significantly less", severity: "warning" },
    { value: 75, text: "is less", severity: "error" },
    { value: 89, text: "is less", severity: "error" },
    { value: 90, text: null, severity: null },
    { value: 110, text: null, severity: null },
    { value: 111, text: "is greater", severity: "error" },
    { value: 125, text: "is greater", severity: "error" },
    { value: 126, text: "is significantly greater", severity: "warning" },
  ]) {
    await page.getByLabel("info_panel", { exact: true }).click();
    const dialog = await openPlanningField(page, "Time in minutes");
    await dialog.getByLabel("Time in minutes", { exact: true }).fill(String(fixture.value));
    await dialog.getByText("Save", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].duration)
      .toBe(fixture.value);
    await page.getByLabel("report_panel", { exact: true }).click();
    const messages = page
      .locator('[class*="reportItem"]')
      .filter({ hasText: "Estimated station dwell time" });
    if (fixture.text) {
      const message = page.getByText(new RegExp(`Estimated station dwell time ${fixture.text}`));
      await expect(message).toBeVisible();
      await expect(message.locator("..").locator('[class*="reportItemIcon"]')).toHaveClass(
        new RegExp(fixture.severity!)
      );
    } else await expect(messages).toHaveCount(0);
  }
});

test("empty graphs and large valid durations display finite totals and independent zero states without mutating data", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.actions = {};
    for (const station of Object.values(doc.stations)) {
      station.actionOrderUuids = [];
      station.duration = null;
      station.location = null;
      station.walkbackPath = null;
    }
    for (const traverse of Object.values(doc.traverses)) {
      traverse.actionOrderUuids = [];
      traverse.duration = null;
      traverse.path = [];
      traverse.pathSegmentDistances = [];
      traverse.pathSegmentElevations = [];
    }
    doc.evas[mission.ids.evaB].sequence = [];
  });
  await mission.open(page);
  const before = await mission.read();
  await selectPlanningStationActions(page, "Alpha station");
  for (const label of [
    "Number of Actions:",
    "Total Action Time (mins):",
    "Total Planned Mass (g):",
    "EV1 Action Time (mins):",
    "EV2 Action Time (mins):",
    "Dwell Time (mins):",
  ])
    await expect(total(page, label)).toHaveText("0");
  await openEvaInfo(page);
  for (const label of [
    "EVA Duration (mins):",
    "Traverse Time (mins):",
    "Station Time (mins):",
    "Traverse Distance (m):",
    "Total Mass (g):",
  ])
    await expect(total(page, label)).toHaveText("0");
  await selectPlanningEva(page, "Survey Bravo");
  await page.getByLabel("info_panel", { exact: true }).click();
  await expect(total(page, "EVA Duration (mins):")).toHaveText("0");
  await page.getByLabel("report_panel", { exact: true }).click();
  await expect(page.getByText("EVA has no stations or traverses", { exact: true })).toBeVisible();
  const exported = await exportEvas(page);
  expect(exported.every((eva) => eva.calculatedFields.totalResolvedEvaTime === 0)).toBe(true);
  expect(await mission.read()).toEqual(before);
  await mission.change((doc) => {
    doc.stations[mission.ids.stationA].duration = 9999;
    doc.traverses[mission.ids.traverseA].duration = 9999;
    doc.traverses[mission.ids.traverseA].pathSegmentDistances = [1000000000];
  });
  await openEvaInfo(page);
  await expect(total(page, "EVA Duration (mins):")).toHaveText("19998");
  await expect(total(page, "Traverse Distance (m):")).toHaveText("1,000,000,000");
  await mission.open(page);
  await openEvaInfo(page);
  await expect(total(page, "EVA Duration (mins):")).toHaveText("19998");
});

test("a traverse with geometry and zero cached distances keeps the EVA responsive and preserves its original points", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    for (const traverse of Object.values(doc.traverses)) traverse.pathSegmentDistances = [0];
  });
  const before = await mission.read();
  await mission.open(page);
  await openEvaInfo(page);
  await expect(total(page, "Traverse Distance (m):")).toHaveText("0");
  await expect(total(page, "EVA Duration (mins):")).toHaveText("65");
  await page.getByLabel("actions_panel", { exact: true }).click();
  await expect(actionRow(page, "Sample regolith")).toBeVisible();
  await selectPlanningStation(page, "Alpha station");
  await expect(page.locator('div[aria-label="Station"]')).toHaveText("Alpha station");
  expect((await mission.read()).traverses).toEqual(before.traverses);
});
