import { randomUUID } from "node:crypto";
import type { Page, Locator } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  planningEvaRow,
  planningField,
  selectPlanningEva,
  selectPlanningPoi,
  selectPlanningStationActions,
} from "./planningHelpers";

function row(page: Page, name: string): Locator {
  return page.getByRole("listitem").filter({
    has: page.locator('div[aria-label="Action Name"]').filter({ hasText: name }),
  });
}

async function openParent(page: Page, parent: "poi" | "station" | "traverse") {
  if (parent === "poi") {
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabel("actions_panel", { exact: true }).click();
  } else if (parent === "station") {
    await selectPlanningStationActions(page, "Alpha station");
  } else {
    await selectPlanningEva(page, "Survey Alpha");
    await planningEvaRow(page, "Survey Alpha").getByText("Alpha to Bravo", { exact: true }).click();
    await page.getByLabel("actions_panel", { exact: true }).click();
  }
}

async function editText(page: Page, label: string, text: string, save = true) {
  await planningField(page, label).locator("..").click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByLabel(label, { exact: true }).fill(text);
  await dialog.getByText(save ? "Save" : "Cancel", { exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("Action parent matrix coverage", () => {
  for (const parent of ["poi", "station", "traverse"] as const) {
    test(`${parent} action drag order reaches a peer and reload with stable unique ownership`, async ({
      page,
      context,
      mission,
    }) => {
      const ids = [mission.ids.actionA, randomUUID(), randomUUID()];
      const before = await mission.read();
      await mission.change((doc) => {
        doc.stations[mission.ids.stationA].actionOrderUuids = parent === "station" ? ids : [];
        doc.pois[mission.ids.poiA].actionOrderUuids = parent === "poi" ? ids : [];
        doc.traverses[mission.ids.traverseA].actionOrderUuids = parent === "traverse" ? ids : [];
        ids.forEach((uuid, index) => {
          doc.actions[uuid] = {
            ...before.actions[mission.ids.actionA],
            uuid,
            refUuid: randomUUID(),
            name: `Ordered action ${index + 1}`,
            poiUuid: parent === "poi" ? mission.ids.poiA : null,
            stationUuid: parent === "station" ? mission.ids.stationA : null,
            traverseUuid: parent === "traverse" ? mission.ids.traverseA : null,
          };
        });
      });
      const arranged = await mission.read();
      await mission.open(page);
      await enablePlanningEditMode(page);
      await openParent(page, parent);
      const peer = await context.newPage();
      await mission.open(peer);
      await openParent(peer, parent);
      const source = row(page, "Ordered action 1")
        .locator('svg[data-icon="grip-vertical"]')
        .locator("..");
      const target = row(page, "Ordered action 3");
      await source.dragTo(target);
      const order = (doc: Mission) =>
        parent === "poi"
          ? doc.pois[mission.ids.poiA].actionOrderUuids
          : parent === "station"
            ? doc.stations[mission.ids.stationA].actionOrderUuids
            : doc.traverses[mission.ids.traverseA].actionOrderUuids;
      await expect.poll(async () => order(await mission.read())).toEqual([ids[1], ids[2], ids[0]]);
      await row(page, "Ordered action 2")
        .locator('svg[data-icon="grip-vertical"]')
        .locator("..")
        .dragTo(page.getByLabel("leftPanelTitle", { exact: true }));
      expect(order(await mission.read())).toEqual([ids[1], ids[2], ids[0]]);
      for (const client of [page, peer]) {
        await expect(client.locator('div[aria-label="Action Name"]')).toHaveText([
          "Ordered action 2",
          "Ordered action 3",
          "Ordered action 1",
        ]);
        await mission.open(client);
        await openParent(client, parent);
        await expect(client.locator('div[aria-label="Action Name"]')).toHaveText([
          "Ordered action 2",
          "Ordered action 3",
          "Ordered action 1",
        ]);
      }
      expect((await mission.read()).actions).toEqual(arranged.actions);
      await expect(page.locator('svg[data-icon="grip-vertical"]')).toHaveCount(0);
      expect(new Set(order(await mission.read())).size).toBe(3);
    });

    test(`${parent} action text and icon save, Cancel preserves exact content, and aggregate cards retain supported fields`, async ({
      page,
      context,
      mission,
    }) => {
      await mission.change((doc) => {
        doc.stations[mission.ids.stationA].actionOrderUuids =
          parent === "station" ? [mission.ids.actionA] : [];
        doc.pois[mission.ids.poiA].actionOrderUuids = parent === "poi" ? [mission.ids.actionA] : [];
        doc.traverses[mission.ids.traverseA].actionOrderUuids =
          parent === "traverse" ? [mission.ids.actionA] : [];
        const action = doc.actions[mission.ids.actionA];
        action.poiUuid = parent === "poi" ? mission.ids.poiA : null;
        action.stationUuid = parent === "station" ? mission.ids.stationA : null;
        action.traverseUuid = parent === "traverse" ? mission.ids.traverseA : null;
      });
      await mission.open(page);
      await enablePlanningEditMode(page);
      await openParent(page, parent);
      await row(page, "Sample regolith").locator('svg[data-icon="caret-right"]').click();
      const description = `${parent}: α & <sample>\nSecond line; preserve punctuation.`;
      const task = `${parent} crew instruction\nSeal the bag.`;
      await editText(page, "Action Description", description);
      await editText(page, "Action Description", "Discard description", false);
      if (parent !== "poi") {
        await editText(page, "Task Description", task);
        await editText(page, "Task Description", "Discard task", false);
      } else await expect(planningField(page, "Task Description")).toHaveCount(0);
      await row(page, "Sample regolith").getByText("Pick Icon", { exact: true }).click();
      await page.getByRole("searchbox").fill("rocket");
      await page.getByRole("button", { name: "🚀", exact: true }).click();
      await expect
        .poll(async () => (await mission.read()).actions[mission.ids.actionA].icon)
        .toBe("1f680");
      await row(page, "Sample regolith").getByText("Pick Icon", { exact: true }).click();
      await row(page, "Sample regolith").getByText("Close", { exact: true }).click();
      const saved = (await mission.read()).actions[mission.ids.actionA];
      expect(saved.description).toBe(description);
      expect(saved.descriptionTask).toBe(parent === "poi" ? "" : task);
      for (const client of [page, await context.newPage()]) {
        await mission.open(client);
        if (parent === "poi") await openParent(client, parent);
        else {
          await selectPlanningEva(client, "Survey Alpha");
          await client.getByLabel("actions_panel", { exact: true }).click();
        }
        await row(client, "Sample regolith").locator('svg[data-icon="caret-right"]').click();
        await expect(planningField(client, "Action Description")).toHaveText(description);
        await expect(row(client, "Sample regolith")).toContainText("🚀");
        if (parent !== "poi")
          await expect(planningField(client, "Task Description")).toHaveText(task);
        else await expect(planningField(client, "Task Description")).toHaveCount(0);
      }
      expect((await mission.read()).actions[mission.ids.actionA]).toEqual(saved);
    });
  }
});
