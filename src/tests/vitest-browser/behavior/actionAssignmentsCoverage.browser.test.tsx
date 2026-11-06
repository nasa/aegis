import { test, expect } from "./missionHarness";
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
  await mission.open();
  await enablePlanningEditMode(page);
  await selectPlanningStationActions(page, "Alpha station");
  const action = page.getByRole("listitem");
  await action.getBySelector('svg[data-icon="caret-right"]').click();
  for (const label of ["Sample bag", "Drill", "Highland", "Crater"]) {
    const target = action.getByText(label, { exact: true });
    const id = await ((element) => element.closest("label")!.htmlFor)(target.element());
    await page.getBySelector(`input[id="${id}"]`).click();
  }
  for (const label of ["Drill", "Crater"]) {
    const id = await ((element) => element.closest("label")!.htmlFor)(
      action.getByText(label, { exact: true }).element()
    );
    await page.getBySelector(`input[id="${id}"]`).click();
    await page.getBySelector(`input[id="${id}"]`).click();
  }
  await expect
    .poll(async () => (await mission.read()).actions[mission.ids.actionA])
    .toMatchObject({
      equipmentItemsUsage: { [ids.bag]: { quantityUsed: 1 }, [ids.drill]: { quantityUsed: 1 } },
      geographicUnitsUsage: [ids.highland, ids.crater],
    });
  await page.getByLabelText("mission Section", { exact: true }).click();
  await page.getByLabelText("equipment_panel", { exact: true }).click();
  const bag = page
    .getByLabelText("equipmentList-item", { exact: true })
    .filter({ hasText: "Sample bag" });
  await bag.getBySelector('div[aria-label="Equipment item name"]').click();
  await page
    .getBySelector("dialog[open]")
    .getByLabelText("Equipment item name", { exact: true })
    .fill("Renamed sample bag");
  await page.getBySelector("dialog[open]").getByText("Save", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).equipmentItems[ids.bag].name)
    .toBe("Renamed sample bag");
  await page.getByLabelText("geographicUnit_panel", { exact: true }).click();
  const unit = page
    .getByLabelText("geoUnitList-item", { exact: true })
    .filter({ hasText: "Highland" });
  await unit.getBySelector('div[aria-label="Geographic unit name"]').click();
  await page
    .getBySelector("dialog[open]")
    .getByLabelText("Geographic unit name", { exact: true })
    .fill("Renamed highland");
  await page.getBySelector("dialog[open]").getByText("Save", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).geographicUnits[ids.highland].name)
    .toBe("Renamed highland");
  await mission.open();
  await selectPlanningStationActions(page, "Alpha station");
  await page.getByRole("listitem").getBySelector('svg[data-icon="caret-right"]').click();
  for (const label of ["Renamed sample bag", "Drill", "Renamed highland", "Crater"])
    await expect
      .element(page.getByRole("listitem").getByText(label, { exact: true }))
      .toBeVisible();
  for (const scope of ["station", "eva"]) {
    if (scope === "station") await selectPlanningStation(page, "Alpha station");
    else await selectPlanningEva(page, "Survey Alpha");
    await page.getByLabelText("info_panel", { exact: true }).click();
    const totals = page
      .getByText("Consumable Equipment Totals", { exact: true })
      .getBySelector('xpath=ancestor::div[contains(@class,"panelSection")]')
      .first();
    await expect
      .element(
        totals
          .getByText("Renamed sample bag", { exact: true })
          .getBySelector("../..")
          .getByText("1", { exact: true })
      )
      .toBeVisible();
    await expect.poll(() => totals.getByText("Drill", { exact: true }).length).toBe(0);
  }
  await page.getByLabelText("mission Section", { exact: true }).click();
  await page.getByLabelText("export_panel", { exact: true }).click();
  await page.getBySelector("#export-all-evas").click();
  await page.getBySelector("#export-actions").click();
  const download = await mission.captureDownload(() =>
    page.getByLabelText("Export JSON File", { exact: true }).click()
  );

  const exported = JSON.parse(await download.text());
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
