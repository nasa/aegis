import { readFile } from "node:fs/promises";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  selectPlanningEva,
  selectPlanningStation,
  selectPlanningStationActions,
} from "./planningHelpers";

const ids = {
  bag: "40000000-0000-4000-8000-000000000091",
  drill: "40000000-0000-4000-8000-000000000092",
  highland: "40000000-0000-4000-8000-000000000093",
  crater: "40000000-0000-4000-8000-000000000094",
};

test("multiple equipment and geographic assignments toggle independently and renamed references refresh totals and exported geography", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.equipmentItems = {
      [ids.bag]: { name: "Sample bag", quantity: 10, singleUse: true },
      [ids.drill]: { name: "Drill", quantity: 2, singleUse: false },
    };
    doc.geographicUnits = {
      [ids.highland]: { name: "Highland", abbr: "H" },
      [ids.crater]: { name: "Crater", abbr: "C" },
    };
  });
  const initial = await mission.read();
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPlanningStationActions(page, "Alpha station");
  const action = page.getByRole("listitem");
  await action.locator('svg[data-icon="caret-right"]').click();
  for (const label of ["Sample bag", "Drill", "Highland", "Crater"]) {
    const target = action.getByText(label, { exact: true });
    const id = await target.evaluate((element) => element.closest("label")!.htmlFor);
    await page.locator(`input[id="${id}"]`).check();
  }
  for (const label of ["Drill", "Crater"]) {
    const id = await action
      .getByText(label, { exact: true })
      .evaluate((element) => element.closest("label")!.htmlFor);
    await page.locator(`input[id="${id}"]`).uncheck();
    await page.locator(`input[id="${id}"]`).check();
  }
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA])
    .toMatchObject({
      equipmentItemsUsage: { [ids.bag]: { quantityUsed: 1 }, [ids.drill]: { quantityUsed: 1 } },
      geographicUnitsUsage: [ids.highland, ids.crater],
    });
  await page.getByLabel("mission Section", { exact: true }).click();
  await page.getByLabel("equipment_panel", { exact: true }).click();
  const bag = page
    .getByLabel("equipmentList-item", { exact: true })
    .filter({ hasText: "Sample bag" });
  await bag.locator('div[aria-label="Equipment item name"]').click();
  await page
    .locator("dialog[open]")
    .getByLabel("Equipment item name", { exact: true })
    .fill("Renamed sample bag");
  await page.locator("dialog[open]").getByText("Save", { exact: true }).click();
  await page.getByLabel("geographicUnit_panel", { exact: true }).click();
  const unit = page.getByLabel("geoUnitList-item", { exact: true }).filter({ hasText: "Highland" });
  await unit.locator('div[aria-label="Geographic unit name"]').click();
  await page
    .locator("dialog[open]")
    .getByLabel("Geographic unit name", { exact: true })
    .fill("Renamed highland");
  await page.locator("dialog[open]").getByText("Save", { exact: true }).click();
  await mission.open(page);
  await selectPlanningStationActions(page, "Alpha station");
  await page.getByRole("listitem").locator('svg[data-icon="caret-right"]').click();
  for (const label of ["Renamed sample bag", "Drill", "Renamed highland", "Crater"])
    await expect(page.getByRole("listitem").getByText(label, { exact: true })).toBeVisible();
  for (const scope of ["station", "eva"]) {
    if (scope === "station") await selectPlanningStation(page, "Alpha station");
    else await selectPlanningEva(page, "Survey Alpha");
    await page.getByLabel("info_panel", { exact: true }).click();
    const totals = page
      .getByText("Consumable Equipment Totals", { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"panelSection")]')
      .first();
    await expect(
      totals
        .getByText("Renamed sample bag", { exact: true })
        .locator("../..")
        .getByText("1", { exact: true })
    ).toBeVisible();
    await expect(totals.getByText("Drill", { exact: true })).toHaveCount(0);
  }
  await page.getByLabel("mission Section", { exact: true }).click();
  await page.getByLabel("export_panel", { exact: true }).click();
  await page.locator("#export-all-evas").uncheck();
  await page.locator("#export-actions").check();
  const pending = page.waitForEvent("download");
  await page.getByLabel("Export JSON File", { exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(
    exported.actions.find((a: { uuid: string }) => a.uuid === mission.ids.actionA)
      .geographicalUnitsReadable
  ).toEqual(["Renamed highland", "Crater"]);
  const after = await mission.read();
  expect(after.actions[mission.ids.actionA].equipmentItemsUsage).toEqual({
    [ids.bag]: { quantityUsed: 1 },
    [ids.drill]: { quantityUsed: 1 },
  });
  expect(after.actions[mission.ids.actionA].geographicUnitsUsage).toEqual([
    ids.highland,
    ids.crater,
  ]);
  expect(after.stations).toEqual(initial.stations);
  expect(after.evas).toEqual(initial.evas);
  expect(after.traverses).toEqual(initial.traverses);
});
