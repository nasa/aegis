import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode, openPlanningField, selectPlanningEva } from "./planningHelpers";
import { expectAngles, showDirections } from "./celestialHelpers";

test("manual EVA directions validate drafts, cancel locally, synchronize saves and remain independent of presets and other EVAs", async ({
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
  for (const value of ["", "-1", "361", "invalid"]) {
    const dialog = await openPlanningField(page, "Sun azimuth");
    await dialog.getByLabel("Sun azimuth", { exact: true }).fill(value);
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await dialog.getByText("Cancel", { exact: true }).click();
    expect((await mission.read()).evas[mission.ids.evaA].sunAzimuth).toBe(17);
  }
  const cancel = await openPlanningField(page, "Sun azimuth");
  await cancel.getByLabel("Sun azimuth", { exact: true }).fill("75");
  await expectAngles(peer, 17, 263);
  await cancel.getByText("Cancel", { exact: true }).click();
  for (const degrees of [0, 90, 359, 360]) {
    for (const label of ["Sun azimuth", "Earth azimuth"]) {
      const dialog = await openPlanningField(page, label);
      await dialog.getByLabel(label, { exact: true }).fill(String(degrees));
      await dialog.getByText("Save", { exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    await expectAngles(peer, degrees % 360, degrees % 360);
    await expect
      .poll(async () => (await mission.read()).evas[mission.ids.evaA])
      .toMatchObject({ sunAzimuth: degrees % 360, earthAzimuth: degrees % 360 });
  }
  await page.getByLabel("preset Section", { exact: true }).click();
  await page.mouse.move(0, 0);
  await expect(page.locator("#aegis-tooltip")).toBeHidden();
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: "Detail" })
    .getByText("Detail", { exact: true })
    .click();
  await expectAngles(page, 0, 0);
  await selectPlanningEva(page, "Survey Bravo");
  await expectAngles(page, 211, 0);
  await selectPlanningEva(page, "Survey Alpha");
  await expectAngles(page, 0, 0);
  await page.reload();
  await selectPlanningEva(page, "Survey Alpha");
  await expectAngles(page, 0, 0);
  const saved = await mission.read();
  expect(saved.presets).toEqual(original.presets);
  expect(saved.evas[mission.ids.evaB]).toEqual(original.evas[mission.ids.evaB]);
});

test("calculated EVA directions show missing prerequisites and Earth missions use the Moon indicator", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.planetRadius = 1737400;
    doc.evas[mission.ids.evaA].sunEarthFromDate = true;
    doc.evas[mission.ids.evaA].datetime = null;
  });
  await mission.open(page);
  await selectPlanningEva(page, "Survey Alpha");
  await page.getByLabel("info_panel", { exact: true }).click();
  await showDirections(page);
  const source = page.getByRole("group", { name: "Sun/Earth value source", exact: true });
  await expect(source).toHaveAttribute(
    "aria-description",
    "The selected EVA has no valid start date."
  );
  await expect(source.locator('[class*="azimuthText_"]')).toHaveText(["\u2014", "\u2014"]);
  await mission.change((doc) => {
    doc.evas[mission.ids.evaA].datetime = Date.parse("2028-08-04T22:00:00Z");
    doc.landerLocation = { lat: null, lng: null };
  });
  await expect(source).toHaveAttribute("aria-description", "Lander location is unavailable.");
  await mission.change((doc) => {
    doc.planetRadius = 6378137;
  });
  const earthSource = page.getByRole("group", { name: "Sun/Moon value source", exact: true });
  await expect(earthSource).toHaveAttribute("aria-description", /not on the Moon/);
  await expect(earthSource.locator('svg[data-icon="moon"]')).toBeHidden();
  await enablePlanningEditMode(page);
  await page.getByRole("radio", { name: "Set manually", exact: true }).check();
  await expectAngles(page, 0, 0);
  await expect(earthSource.locator('svg[data-icon="moon"]')).toBeVisible();
  await expect
    .poll(async () => (await mission.read()).evas[mission.ids.evaA].sunEarthFromDate)
    .toBe(false);
});
