import { randomUUID } from "node:crypto";
import type { Page, Locator } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  planningField,
  selectPlanningEva,
  selectPlanningStationActions,
} from "./planningHelpers";

function row(page: Page, name: string): Locator {
  return page.getByRole("listitem").filter({
    has: page.locator('div[aria-label="Action Name"]').filter({ hasText: name }),
  });
}

async function editText(page: Page, label: string, text: string, save = true) {
  await planningField(page, label).locator("..").click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel(label, { exact: true }).fill(text);
  await dialog.getByText(save ? "Save" : "Cancel", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("Action parent matrix coverage", () => {
  test("station action drag order reaches a peer and reload with stable unique ownership", async ({
    page,
    context,
    mission,
  }) => {
    const ids = [mission.ids.actionA, randomUUID(), randomUUID()];
    const before = await mission.read();
    await mission.change((doc) => {
      doc.stations[mission.ids.stationA].actionOrderUuids = ids;
      doc.pois[mission.ids.poiA].actionOrderUuids = [];
      doc.traverses[mission.ids.traverseA].actionOrderUuids = [];
      ids.forEach((uuid, index) => {
        doc.actions[uuid] = {
          ...before.actions[mission.ids.actionA],
          uuid,
          refUuid: randomUUID(),
          name: `Ordered action ${index + 1}`,
          poiUuid: null,
          stationUuid: mission.ids.stationA,
          traverseUuid: null,
        };
      });
    });
    const arranged = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    const peer = await context.newPage();
    await mission.open(peer);
    await selectPlanningStationActions(peer, "Alpha station");
    const source = row(page, "Ordered action 1")
      .locator('svg[data-icon="grip-vertical"]')
      .locator("..");
    const target = row(page, "Ordered action 3");
    await source.dragTo(target);
    const order = (doc: Mission) => doc.stations[mission.ids.stationA].actionOrderUuids;
    await expect.poll(async () => order(await mission.read())).toEqual([ids[1], ids[2], ids[0]]);
    for (const client of [page, peer]) {
      await expect(client.locator('div[aria-label="Action Name"]')).toHaveText([
        "Ordered action 2",
        "Ordered action 3",
        "Ordered action 1",
      ]);
      await mission.open(client);
      await selectPlanningStationActions(client, "Alpha station");
      await expect(client.locator('div[aria-label="Action Name"]')).toHaveText([
        "Ordered action 2",
        "Ordered action 3",
        "Ordered action 1",
      ]);
    }
    expect((await mission.read()).actions).toEqual(arranged.actions);
    expect(new Set(order(await mission.read())).size).toBe(3);
  });

  test("station action text and icon survive a fresh server-backed page with aggregate fields", async ({
    page,
    context,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.stations[mission.ids.stationA].actionOrderUuids = [mission.ids.actionA];
      doc.pois[mission.ids.poiA].actionOrderUuids = [];
      doc.traverses[mission.ids.traverseA].actionOrderUuids = [];
      const action = doc.actions[mission.ids.actionA];
      action.poiUuid = null;
      action.stationUuid = mission.ids.stationA;
      action.traverseUuid = null;
    });
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStationActions(page, "Alpha station");
    await row(page, "Sample regolith").locator('svg[data-icon="caret-right"]').click();
    const description = `station: α & <sample>\nSecond line; preserve punctuation.`;
    const task = "station crew instruction\nSeal the bag.";
    await editText(page, "Action Description", description);
    await editText(page, "Task Description", task);
    await row(page, "Sample regolith").getByText("Pick Icon", { exact: true }).click();
    await page.getByRole("searchbox").fill("rocket");
    await page.getByRole("button", { name: "🚀", exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.actionA].icon)
      .toBe("1f680");
    const saved = (await mission.read()).actions[mission.ids.actionA];
    expect(saved.description).toBe(description);
    expect(saved.descriptionTask).toBe(task);
    for (const client of [page, await context.newPage()]) {
      await mission.open(client);
      await selectPlanningEva(client, "Survey Alpha");
      await client.getByLabel("actions_panel", { exact: true }).click();
      await row(client, "Sample regolith").locator('svg[data-icon="caret-right"]').click();
      await expect(planningField(client, "Action Description")).toHaveText(description);
      await expect(row(client, "Sample regolith")).toContainText("🚀");
      await expect(planningField(client, "Task Description")).toHaveText(task);
    }
    expect((await mission.read()).actions[mission.ids.actionA]).toEqual(saved);
  });
});
