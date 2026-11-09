import { userEvent } from "vitest/browser";
import { exactText } from "./browserAssertions";
import { v4 as randomUUID } from "uuid";
import type { BrowserPage as Page, Locator } from "vitest/browser";
import { test, expect } from "./missionHarness";
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
    has: page.getBySelector('div[aria-label="Action Name"]').filter({ hasText: name }),
  });
}

async function openParent(page: Page, parent: "poi" | "station" | "traverse") {
  if (parent === "poi") {
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabelText("actions_panel", { exact: true }).click();
  } else if (parent === "station") {
    await selectPlanningStationActions(page, "Alpha station");
  } else {
    await selectPlanningEva(page, "Survey Alpha");
    await planningEvaRow(page, "Survey Alpha").getByText("Alpha to Bravo", { exact: true }).click();
    await page.getByLabelText("actions_panel", { exact: true }).click();
  }
}

async function editText(page: Page, label: string, text: string, save = true) {
  await planningField(page, label).getBySelector("..").click();
  const dialog = page.getBySelector("dialog[open]");
  await dialog.getByLabelText(label, { exact: true }).fill(text);
  await dialog.getByText(save ? "Save" : "Cancel", { exact: true }).click();
  await expect.poll(() => dialog.length).toBe(0);
}

test.describe("Action parent matrix coverage", () => {
  for (const parent of ["poi", "station", "traverse"] as const) {
    test(`${parent} action drag order survives remount with stable unique ownership`, async ({
      page,
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
      await mission.open();
      await enablePlanningEditMode(page);
      await openParent(page, parent);
      const source = row(page, "Ordered action 1")
        .getBySelector('svg[data-icon="grip-vertical"]')
        .getBySelector("..");
      const target = row(page, "Ordered action 3");
      await userEvent.dragAndDrop(source, target);
      const order = (doc: Mission) =>
        parent === "poi"
          ? doc.pois[mission.ids.poiA].actionOrderUuids
          : parent === "station"
            ? doc.stations[mission.ids.stationA].actionOrderUuids
            : doc.traverses[mission.ids.traverseA].actionOrderUuids;
      await expect.poll(async () => order(await mission.read())).toEqual([ids[1], ids[2], ids[0]]);
      await userEvent.dragAndDrop(
        row(page, "Ordered action 2")
          .getBySelector('svg[data-icon="grip-vertical"]')
          .getBySelector(".."),
        page.getByLabelText("leftPanelTitle", { exact: true })
      );
      expect(order(await mission.read())).toEqual([ids[1], ids[2], ids[0]]);

      await expect
        .poll(() =>
          page
            .getBySelector('div[aria-label="Action Name"]')
            .elements()
            .map((element) => element.textContent)
        )
        .toEqual(["Ordered action 2", "Ordered action 3", "Ordered action 1"]);
      await mission.open();
      await openParent(page, parent);
      await expect
        .poll(() =>
          page
            .getBySelector('div[aria-label="Action Name"]')
            .elements()
            .map((element) => element.textContent)
        )
        .toEqual(["Ordered action 2", "Ordered action 3", "Ordered action 1"]);

      expect((await mission.read()).actions).toEqual(arranged.actions);
      await expect.poll(() => page.getBySelector('svg[data-icon="grip-vertical"]').length).toBe(0);
      expect(new Set(order(await mission.read())).size).toBe(3);
    });

    test(`${parent} action text and icon save, Cancel preserves exact content, and aggregate cards retain supported fields`, async ({
      page,
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
      await mission.open();
      await enablePlanningEditMode(page);
      await openParent(page, parent);
      await row(page, "Sample regolith").getBySelector('svg[data-icon="caret-right"]').click();
      const description = `${parent}: α & <sample>\nSecond line; preserve punctuation.`;
      const task = `${parent} crew instruction\nSeal the bag.`;
      await editText(page, "Action Description", description);
      await editText(page, "Action Description", "Discard description", false);
      if (parent !== "poi") {
        await editText(page, "Task Description", task);
        await editText(page, "Task Description", "Discard task", false);
      } else await expect.poll(() => planningField(page, "Task Description").length).toBe(0);
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

      await mission.open();
      if (parent === "poi") await openParent(page, parent);
      else {
        await selectPlanningEva(page, "Survey Alpha");
        await page.getByLabelText("actions_panel", { exact: true }).click();
      }
      await row(page, "Sample regolith").getBySelector('svg[data-icon="caret-right"]').click();
      await expect
        .element(planningField(page, "Action Description"))
        .toMatchTextContent(exactText(description));
      await expect.element(row(page, "Sample regolith")).toMatchTextContent("🚀");
      if (parent !== "poi")
        await expect
          .element(planningField(page, "Task Description"))
          .toMatchTextContent(exactText(task));
      else await expect.poll(() => planningField(page, "Task Description").length).toBe(0);

      expect((await mission.read()).actions[mission.ids.actionA]).toEqual(saved);
    });
  }
});
