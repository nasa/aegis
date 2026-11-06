import { setChecked } from "./dashboardBrowserActions";
import { isVisible } from "./browserAssertions";
import { test, expect } from "./missionHarness";
import { enablePlanningEditMode, selectPlanningEva } from "./planningHelpers";
import { expectAngles, showDirections } from "./celestialHelpers";

test("calculated EVA directions show missing prerequisites and Earth missions use the Moon indicator", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.planetRadius = 1737400;
    doc.evas[mission.ids.evaA].sunEarthFromDate = true;
    doc.evas[mission.ids.evaA].datetime = null;
  });
  await mission.open();
  await selectPlanningEva(page, "Survey Alpha");
  await page.getByLabelText("info_panel", { exact: true }).click();
  await showDirections(page);
  const source = page.getByRole("group", { name: "Sun/Earth value source", exact: true });
  await expect
    .element(source)
    .toHaveAttribute("aria-description", "The selected EVA has no valid start date.");
  await expect
    .poll(() =>
      source
        .getBySelector('[class*="azimuthText_"]')
        .elements()
        .map((element) => element.textContent.trim().replace(/\s+/g, " "))
    )
    .toEqual(["\u2014", "\u2014"]);
  await mission.change((doc) => {
    doc.evas[mission.ids.evaA].datetime = Date.parse("2028-08-04T22:00:00Z");
    doc.landerLocation = { lat: null, lng: null };
  });
  await expect
    .element(source)
    .toHaveAttribute("aria-description", "Lander location is unavailable.");
  await mission.change((doc) => {
    doc.planetRadius = 6378137;
  });
  const earthSource = page.getByRole("group", { name: "Sun/Moon value source", exact: true });
  await expect
    .poll(() => earthSource.element().getAttribute("aria-description"))
    .toMatch(/not on the Moon/);
  await expect
    .poll(() => isVisible(earthSource.getBySelector('svg[data-icon="moon"]')))
    .toBe(false);
  await enablePlanningEditMode(page);
  await setChecked(page.getByRole("radio", { name: "Set manually", exact: true }), true);
  await expectAngles(page, 0, 0);
  await expect.element(earthSource.getBySelector('svg[data-icon="moon"]')).toBeVisible();
  await expect
    .poll(async () => (await mission.read()).evas[mission.ids.evaA].sunEarthFromDate)
    .toBe(false);
});
