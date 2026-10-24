import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  planningField,
  savePlanningField,
  selectPlanningStation,
  selectPlanningEva,
  selectPlanningStationActions,
} from "./planningHelpers";
import { openExecutionInfo } from "./executionHelpers";

test("deleting a station while a peer has a selected draft does not resurrect it", async ({
  page,
  browser,
  context,
  baseURL,
  mission,
}) => {
  const before = await mission.read();
  await mission.open(page);
  await enablePlanningEditMode(page);
  await openPlanningSection(page, "station");
  await page.getByLabel("addStation", { exact: true }).click();
  await savePlanningField(page, "Station", "Disposable collaborative site");
  const created = Object.values((await mission.read()).stations).find(
    (station) => station.name === "Disposable collaborative site"
  );
  expect(created).toBeDefined();

  const peerContext: BrowserContext = await browser.newContext({
    storageState: await context.storageState(),
    baseURL,
    viewport: { width: 1960, height: 1080 },
  });
  const peer: Page = await peerContext.newPage();
  try {
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await selectPlanningStation(peer, "Disposable collaborative site");
    const draft = await openPlanningField(peer, "Station");
    await draft.getByLabel("Station", { exact: true }).fill("Stale peer draft");
    await expect(planningField(peer, "Station")).toHaveText("Disposable collaborative site");
    expect((await mission.read()).stations[created!.uuid].name).toBe(
      "Disposable collaborative site"
    );

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("deleteStation", { exact: true }).click();
    await expect.poll(async () => (await mission.read()).stations[created!.uuid]).toBeUndefined();
    await expect(
      peer.getByLabel("stationList-item", { exact: true }).filter({
        hasText: "Disposable collaborative site",
      })
    ).toHaveCount(0);

    if (await draft.count()) await draft.getByText("Cancel", { exact: true }).click();
    await peer.reload();
    await openPlanningSection(peer, "station");
    await expect(peer.locator("dialog[open]")).toHaveCount(0);
    await expect(
      peer.getByLabel("stationList-item", { exact: true }).filter({ hasText: "Stale peer draft" })
    ).toHaveCount(0);
    const after = await mission.read();
    expect(after.stations[created!.uuid]).toBeUndefined();
    expect(after.stations[mission.ids.stationA]).toEqual(before.stations[mission.ids.stationA]);
    expect(after.stations[mission.ids.stationB]).toEqual(before.stations[mission.ids.stationB]);
    expect(after.evas[mission.ids.evaA]).toEqual(before.evas[mission.ids.evaA]);
    expect(after.evas[mission.ids.evaB]).toEqual(before.evas[mission.ids.evaB]);
  } finally {
    await peerContext.close();
  }
});

test("deleting a planned EVA while a peer edits its title removes only that plan graph", async ({
  page,
  browser,
  context,
  baseURL,
  mission,
}) => {
  const before = await mission.read();
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPlanningEva(page, "Survey Alpha");
  const peerContext = await browser.newContext({
    storageState: await context.storageState(),
    baseURL,
    viewport: { width: 1960, height: 1080 },
  });
  const peer = await peerContext.newPage();
  try {
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await selectPlanningEva(peer, "Survey Alpha");
    const draft = await openPlanningField(peer, "EVA Title");
    await draft.getByLabel("EVA Title", { exact: true }).fill("Deleted plan draft");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("deleteEva", { exact: true }).click();
    await expect.poll(async () => (await mission.read()).evas[mission.ids.evaA]).toBeUndefined();
    await expect(
      peer.getByLabel("evaList-item", { exact: true }).filter({ hasText: "Survey Alpha" })
    ).toHaveCount(0);
    if (await draft.count()) await draft.getByText("Cancel", { exact: true }).click();
    await peer.reload();
    await openPlanningSection(peer, "evas");
    const after = await mission.read();
    expect(after.evas[mission.ids.evaA]).toBeUndefined();
    expect(after.evas[mission.ids.evaB]).toEqual(before.evas[mission.ids.evaB]);
    expect(after.stations[mission.ids.stationA]).toEqual(before.stations[mission.ids.stationA]);
    expect(after.stations[mission.ids.stationB]).toEqual(before.stations[mission.ids.stationB]);
    expect(after.actions[mission.ids.actionA]).toEqual(before.actions[mission.ids.actionA]);
    await expect(
      peer.getByLabel("evaList-item", { exact: true }).filter({ hasText: "Deleted plan draft" })
    ).toHaveCount(0);
  } finally {
    await peerContext.close();
  }
});

test("deleting an action while a peer has its name draft removes the parent reference", async ({
  page,
  browser,
  context,
  baseURL,
  mission,
}) => {
  const before = await mission.read();
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPlanningStationActions(page, "Alpha station");
  const peerContext = await browser.newContext({
    storageState: await context.storageState(),
    baseURL,
    viewport: { width: 1960, height: 1080 },
  });
  const peer = await peerContext.newPage();
  try {
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await selectPlanningStationActions(peer, "Alpha station");
    const draft = await openPlanningField(peer, "Action Name");
    await draft.getByLabel("Action Name", { exact: true }).fill("Deleted action draft");

    const actionRow = page.getByRole("listitem").filter({
      has: page.locator('div[aria-label="Action Name"]').filter({ hasText: "Sample regolith" }),
    });
    await actionRow.locator('svg[data-icon="ellipsis-vertical"]').click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("dialog[open]").getByText("Delete Action", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA])
      .toBeUndefined();
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].actionOrderUuids)
      .toEqual([]);
    if (await draft.count()) await draft.getByText("Cancel", { exact: true }).click();
    await peer.reload();
    await selectPlanningStationActions(peer, "Alpha station");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    const after = await mission.read();
    expect(after.actions[mission.ids.actionA]).toBeUndefined();
    expect(after.stations[mission.ids.stationA].actionOrderUuids).toEqual([]);
    expect(after.stations[mission.ids.stationB]).toEqual(before.stations[mission.ids.stationB]);
    expect(after.evas[mission.ids.evaA]).toEqual(before.evas[mission.ids.evaA]);
    expect(after.evas[mission.ids.evaB]).toEqual(before.evas[mission.ids.evaB]);
    await expect(peer.getByText("Deleted action draft", { exact: true })).toHaveCount(0);
  } finally {
    await peerContext.close();
  }
});

test.describe("REX deletion with an open peer draft", () => {
  test.use({ scenario: "execution" });

  test("deleting a REX while its title draft is open does not restore execution-owned data", async ({
    page,
    browser,
    context,
    baseURL,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
    const peerContext = await browser.newContext({
      storageState: await context.storageState(),
      baseURL,
      viewport: { width: 1960, height: 1080 },
    });
    const peer = await peerContext.newPage();
    try {
      await mission.open(peer);
      await enablePlanningEditMode(peer);
      await openExecutionInfo(peer, "Survey Alpha", mission.ids.rexEvaA);
      const draft = await openPlanningField(peer, "REX Title");
      await draft.getByLabel("REX Title", { exact: true }).fill("Deleted REX draft");

      page.once("dialog", (dialog) => dialog.accept());
      await page.getByLabel("deleteEva", { exact: true }).click();
      await expect.poll(async () => (await mission.read()).rexes[mission.ids.rexA]).toBeUndefined();
      await expect
        .poll(async () => (await mission.read()).evas[mission.ids.rexEvaA])
        .toBeUndefined();
      if (await draft.count()) await draft.getByText("Cancel", { exact: true }).click();
      await peer.reload();
      await expect(peer.locator("dialog[open]")).toHaveCount(0);
      await expect(peer.locator('div[aria-label="REX Title"]')).toHaveCount(0);
      await expect(peer.getByText("Stopped Alpha", { exact: true })).toHaveCount(0);
      const after = await mission.read();
      expect(after.rexes[mission.ids.rexA]).toBeUndefined();
      expect(after.evas[mission.ids.rexEvaA]).toBeUndefined();
      expect(after.evas[mission.ids.evaA]).toEqual(before.evas[mission.ids.evaA]);
      expect(after.rexes[mission.ids.rexB]).toEqual(before.rexes[mission.ids.rexB]);
      expect(after.evas[mission.ids.rexEvaB]).toEqual(before.evas[mission.ids.rexEvaB]);
    } finally {
      await peerContext.close();
    }
  });
});
