import { vi } from "vitest";

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

async function command(page: Page, name: string, command: string) {
  const collapse = row(page, name).getBySelector('svg[data-icon="caret-down"]');
  if (await collapse.length) await collapse.click();
  await ((element) => element.scrollIntoView({ block: "center" }))(
    row(page, name).getBySelector('svg[data-icon="ellipsis-vertical"]').element()
  );
  await row(page, name).getBySelector('svg[data-icon="ellipsis-vertical"]').click();
  await page.getBySelector("dialog[open]").getByText(command, { exact: true }).click();
}

test.describe("Action parent matrix coverage", () => {
  for (const parent of ["poi", "station", "traverse"] as const) {
    test(`${parent} action creation, editing, duplication and deletion preserve exact parent ownership`, async ({
      page,
      mission,
    }) => {
      const initial = await mission.read();
      await mission.open();
      await openParent(page, parent);
      await expect.poll(() => page.getByText("Add Action", { exact: true }).length).toBe(0);
      await enablePlanningEditMode(page);
      await page.getByText("Add Action", { exact: true }).click();
      await expect
        .poll(async () => Object.keys((await mission.read()).actions).length)
        .toBe(Object.keys(initial.actions).length + 1);
      const newAction = Object.values((await mission.read()).actions).find(
        (a) => !initial.actions[a.uuid]
      )!;
      await row(page, newAction.name).getBySelector('div[aria-label="Action Name"]').click();
      await page
        .getBySelector("dialog[open]")
        .getByLabelText("Action Name", { exact: true })
        .fill(`${parent} unique action`);
      await page.getBySelector("dialog[open]").getByText("Save", { exact: true }).click();
      const name = `${parent} unique action`;
      await expect
        .poll(
          async () =>
            Object.values((await mission.read()).actions).find((a) => a.name === name)?.name
        )
        .toBe(name);
      const created = Object.values((await mission.read()).actions).find((a) => a.name === name)!;
      expect(created).toMatchObject({
        poiUuid: parent === "poi" ? mission.ids.poiA : null,
        stationUuid: parent === "station" ? mission.ids.stationA : null,
        traverseUuid: parent === "traverse" ? mission.ids.traverseA : null,
      });
      await row(page, name).getBySelector('svg[data-icon="caret-right"]').click();
      await row(page, name)
        .getBySelector('div[aria-label="Duration in minutes"]')
        .getBySelector("..")
        .click();
      await page
        .getBySelector("dialog[open]")
        .getByLabelText("Duration in minutes", { exact: true })
        .fill("17");
      await page.getBySelector("dialog[open]").getByText("Save", { exact: true }).click();
      await expect
        .poll(() => planningField(page, "Task Description").length)
        .toBe(parent === "poi" ? 0 : 1);
      await command(page, name, "Duplicate Action");
      await expect
        .poll(async () => Object.keys((await mission.read()).actions).length)
        .toBe(Object.keys(initial.actions).length + 2);
      const copy = Object.values((await mission.read()).actions).find(
        (a) => !initial.actions[a.uuid] && a.uuid !== created.uuid
      )!;
      expect(copy).toMatchObject({
        poiUuid: created.poiUuid,
        stationUuid: created.stationUuid,
        traverseUuid: created.traverseUuid,
        duration: 17,
      });
      expect(copy.refUuid).not.toBe(created.refUuid);
      const names = page.getBySelector('div[aria-label="Action Name"]').filter({ hasText: name });
      await names.last().click();
      await page
        .getBySelector("dialog[open]")
        .getByLabelText("Action Name", { exact: true })
        .fill(`${parent} independent copy`);
      await page.getBySelector("dialog[open]").getByText("Save", { exact: true }).click();
      await expect
        .poll(async () => (await mission.read()).actions[copy.uuid].name)
        .toBe(`${parent} independent copy`);
      expect((await mission.read()).actions[created.uuid].name).toBe(name);
      const owner = (doc: Mission) =>
        parent === "poi"
          ? doc.pois[mission.ids.poiA]
          : parent === "station"
            ? doc.stations[mission.ids.stationA]
            : doc.traverses[mission.ids.traverseA];
      expect(owner(await mission.read()).actionOrderUuids).toContain(copy.uuid);
      vi.spyOn(window, "confirm").mockReturnValueOnce(false);
      await command(page, `${parent} independent copy`, "Delete Action");
      expect((await mission.read()).actions[copy.uuid]).toBeDefined();
      for (const [actionName, uuid] of [
        [`${parent} independent copy`, copy.uuid],
        [name, created.uuid],
      ]) {
        vi.spyOn(window, "confirm").mockReturnValueOnce(true);
        await command(page, actionName, "Delete Action");
        await expect.poll(async () => (await mission.read()).actions[uuid]).toBeUndefined();
        expect(owner(await mission.read()).actionOrderUuids).not.toContain(uuid);
      }
      await mission.open();
      await openParent(page, parent);
      expect((await mission.read()).actions).toEqual(initial.actions);
      expect(owner(await mission.read()).actionOrderUuids).toEqual(owner(initial).actionOrderUuids);
      await expect.poll(() => row(page, name).length).toBe(0);
    });
  }
});
