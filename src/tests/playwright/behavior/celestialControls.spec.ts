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
