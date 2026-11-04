import { test, expect } from "../fixtures/behavioralTest";
import reference from "../../vitest/fixtures/lunarSky/reference.json" with { type: "json" };
import { enablePlanningEditMode, selectPlanningEva } from "./planningHelpers";
import { selectExecution } from "./executionHelpers";
import { expectAngles, showDirections } from "./celestialHelpers";

for (const polar of [false, true]) {
  test(`EVA calculations match independent SPICE values with ${polar ? "polar" : "Mercator"} map north and preserve manual values`, async ({
    page,
    mission,
  }) => {
    const samples = reference.cases.filter(
      (sample) =>
        sample.site === "lander" &&
        ["2028-08-04T22:00:00Z", "2028-08-05T22:00:00Z"].includes(sample.utc)
    );
    expect(samples).toHaveLength(2);
    await mission.change((doc) => {
      doc.landerLocation = samples[0].point;
      doc.landerElevationMeters = samples[0].heightMeters;
      doc.planetRadius = samples[0].radiusMeters;
      Object.assign(doc.evas[mission.ids.evaA], {
        sunAzimuth: 17,
        earthAzimuth: 263,
        sunEarthFromDate: false,
        datetime: Date.parse(samples[0].utc),
        sequence: [],
      });
      if (polar) {
        Object.assign(doc, {
          projIsCustom: true,
          projEpsg: "AEGIS:CELESTIAL-TEST",
          projProj4String:
            "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m +no_defs",
          projBoundsMinX: -5000000,
          projBoundsMinY: -5000000,
          projBoundsMaxX: 5000000,
          projBoundsMaxY: 5000000,
          projResZoomLevel: 0,
          projResUnitsPerPixel: 1000,
        });
      }
    });
    await mission.open(page);
    await selectPlanningEva(page, "Survey Alpha");
    await page.getByLabel("info_panel", { exact: true }).click();
    await enablePlanningEditMode(page);
    await showDirections(page);
    await expectAngles(page, 17, 263);
    await page.getByRole("radio", { name: "Calculate", exact: true }).check();
    await expect
      .poll(async () => (await mission.read()).evas[mission.ids.evaA].sunEarthFromDate)
      .toBe(true);
    for (const sample of samples) {
      await mission.change((doc) => {
        doc.evas[mission.ids.evaA].datetime = Date.parse(sample.utc);
      });
      const rotation = polar ? sample.point.lng : 0;
      await expectAngles(
        page,
        sample.spice.sun.azimuth + rotation,
        sample.spice.earth.azimuth + rotation
      );
      expect((await mission.read()).evas[mission.ids.evaA]).toMatchObject({
        sunAzimuth: 17,
        earthAzimuth: 263,
        sunEarthFromDate: true,
      });
    }
    await page.getByRole("radio", { name: "Set manually", exact: true }).check();
    await expect
      .poll(async () => (await mission.read()).evas[mission.ids.evaA].sunEarthFromDate)
      .toBe(false);
    await expectAngles(page, 17, 263);
    await page.reload();
    await selectPlanningEva(page, "Survey Alpha");
    await expectAngles(page, 17, 263);
  });
}

test.describe("Execution celestial ownership", () => {
  test.use({ scenario: "execution" });
  test("planned, stopped and running EVAs supply their own directions and execution duplication freezes an independent copy", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.planetRadius = 1737400;
      Object.assign(doc.evas[mission.ids.evaA], { sunAzimuth: 17, earthAzimuth: 263 });
      Object.assign(doc.evas[mission.ids.rexEvaA], { sunAzimuth: 34, earthAzimuth: 278 });
      Object.assign(doc.evas[mission.ids.rexEvaB], { sunAzimuth: 90, earthAzimuth: 180 });
    });
    await mission.open(page);
    await selectExecution(page, "Survey Alpha", mission.ids.evaA);
    await showDirections(page);
    await expectAngles(page, 17, 263);
    await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
    await expectAngles(page, 34, 278);
    await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
    await expectAngles(page, 90, 180);
    await mission.change((doc) => {
      doc.evas[mission.ids.evaA].sunAzimuth = 55;
    });
    await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
    await expectAngles(page, 34, 278);
    await page.reload();
    await selectExecution(page, "Survey Alpha", mission.ids.evaA);
    await expectAngles(page, 55, 263);
  });
});
