import { test, expect } from "../fixtures/behavioralTest";
import { seedPoi } from "../fixtures/entitySeeds";
import {
  enablePlanningEditMode,
  selectPlanningPoi,
  confirmPlanningDelete,
} from "./planningHelpers";

test("a peer POI deletion reaches an open traceability report and survives reload", async ({
  page,
  context,
  mission,
}) => {
  const surviving = "90000000-0000-4000-8000-000000000099";
  await mission.change((doc) => {
    doc.actionSystemVersion = 2;
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
    doc.pois[surviving] = seedPoi({ uuid: surviving, name: "Surviving outcrop" });
  });
  await mission.open(page);
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("POI Traceability", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Reference POI action trace" })).toBeVisible();
  const peer = await context.newPage();
  await mission.open(peer);
  await enablePlanningEditMode(peer);
  await selectPlanningPoi(peer, "Reference POI");
  await confirmPlanningDelete(peer, "deletePoi");
  await expect(page.getByRole("region", { name: "Reference POI action trace" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Surviving outcrop action trace" })).toBeVisible();
  const after = await mission.read();
  expect(after.pois[mission.ids.poiA]).toBeUndefined();
  await page.reload();
  await page.getByLabel("reports Section", { exact: true }).click();
  await page.getByText("POI Traceability", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Surviving outcrop action trace" })).toBeVisible();
  expect(await mission.read()).toEqual(after);
});
