import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode, openPlanningField, selectPlanningEva } from "./planningHelpers";
import { expectAngles, showDirections } from "./celestialHelpers";

test("saved EVA direction synchronizes to a live peer and survives a fresh server load independently of presets", async ({
  page,
  context,
  mission,
}) => {
  await mission.change((doc) => {
    doc.planetRadius = 1737400;
    doc.evas[mission.ids.evaA].sunAzimuth = 17;
    doc.evas[mission.ids.evaA].earthAzimuth = 263;
    doc.evas[mission.ids.evaB].sunAzimuth = 211;
  });
  const original = await mission.read();
  const peer = await context.newPage();
  await mission.open(page);
  await mission.open(peer);
  for (const client of [page, peer]) {
    await selectPlanningEva(client, "Survey Alpha");
    await client.getByLabel("info_panel", { exact: true }).click();
    await showDirections(client);
    await expectAngles(client, 17, 263);
  }
  await expect(page.getByRole("radiogroup", { name: "Sun/Earth direction mode" })).toHaveCount(0);
  await enablePlanningEditMode(page);
  const dialog = await openPlanningField(page, "Sun azimuth");
  await dialog.getByLabel("Sun azimuth", { exact: true }).fill("90");
  await dialog.getByText("Save", { exact: true }).click();
  await expectAngles(peer, 90, 263);
  await expect.poll(async () => (await mission.read()).evas[mission.ids.evaA].sunAzimuth).toBe(90);
  await page.getByLabel("preset Section", { exact: true }).click();
  await page.mouse.move(0, 0);
  await expect(page.locator("#aegis-tooltip")).toBeHidden();
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: "Detail" })
    .getByText("Detail", { exact: true })
    .click();
  await expectAngles(page, 90, 263);
  await selectPlanningEva(page, "Survey Bravo");
  await expectAngles(page, 211, 0);
  await selectPlanningEva(page, "Survey Alpha");
  await expectAngles(page, 90, 263);
  await page.reload();
  await selectPlanningEva(page, "Survey Alpha");
  await expectAngles(page, 90, 263);
  const saved = await mission.read();
  expect(saved.presets).toEqual(original.presets);
  expect(saved.evas[mission.ids.evaB]).toEqual(original.evas[mission.ids.evaB]);
});
