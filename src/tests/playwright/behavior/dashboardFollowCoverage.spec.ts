import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { selectExecution } from "./executionHelpers";
import { enablePlanningEditMode } from "./planningHelpers";

test.use({ scenario: "execution" });
const extraType = "30000000-0000-4000-8000-000000009006";
const project = (point: AEGISPoint) => [
  (point.lng * Math.PI * 6378137) / 180,
  Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * 6378137,
];

async function dashboardView(page: Page, mode: "dashboard" | "minimap" = "dashboard") {
  return page.evaluate((mode) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === mode && entry.map.getTargetElement()?.isConnected
    )?.map;
    return {
      center: map?.getView().getCenter(),
      animating: map?.getView().getAnimating(),
      extent: map?.getView().calculateExtent(map.getSize()),
    };
  }, mode);
}

async function followOptions(page: Page) {
  const map = page.locator('[data-map-mode="dashboard"]');
  await map.hover();
  await map.getByText("Select Items to Follow", { exact: true }).click();
  return map.locator('[class*="multiselectDropdownItems_"]');
}

async function followChoice(page: Page, label: string, selected: boolean) {
  const options = await followOptions(page);
  const row = options
    .locator('[class*="multiselectDropdownItem_"]')
    .filter({ has: page.getByText(label, { exact: true }) });
  await expect(row).toBeVisible();
  const checked = (await row.locator('svg[data-icon="square-check"]').count()) > 0;
  if (checked !== selected) await row.click();
  await page.getByText("Select Items to Follow", { exact: true }).click();
}

async function expectCenter(page: Page, point: AEGISPoint) {
  await expect.poll(async () => (await dashboardView(page)).animating).toBe(false);
  await expect
    .poll(async () => (await dashboardView(page)).center)
    .toEqual(project(point).map((value) => expect.closeTo(value, 3)));
}

test("peer marker-type edits preserve disabled follow choices and deleting the last position leaves no stale recentering", async ({
  page,
  context,
  mission,
}) => {
  await mission.change((doc) => {
    doc.rexes[mission.ids.rexB].posTypes.push({
      uuid: extraType,
      name: "EV2",
      abbr: "2",
      icon: "1f469-200d-1f680",
      pathColor: "#0000ff",
    });
  });
  await page.goto(mission.dashboardUrl);
  await expect(page.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
  await followChoice(page, "Stations", false);
  await followChoice(page, "Traverses", false);
  await followChoice(page, "EV1", false);
  await followChoice(page, "EV2", false);
  await expect.poll(async () => (await dashboardView(page)).animating).toBe(false);
  const fixed = await dashboardView(page);
  const peer = await context.newPage();
  await mission.open(peer);
  await selectExecution(peer, "Survey Bravo", mission.ids.rexEvaB);
  await enablePlanningEditMode(peer);
  await peer.getByLabel("rex_positions_panel", { exact: true }).click();
  const row = peer.locator('div[aria-label="Position Marker Name"]').filter({ hasText: "EV2" });
  await row.click();
  const dialog = peer.locator("dialog[open]");
  await dialog.getByLabel("Position Marker Name", { exact: true }).fill("Survey rover");
  await dialog.getByText("Save", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posTypes[1].name)
    .toBe("Survey rover");
  const options = await followOptions(page);
  for (const name of ["Stations", "Traverses", "EV1", "Survey rover"]) {
    const choice = options
      .locator('[class*="multiselectDropdownItem_"]')
      .filter({ has: page.getByText(name, { exact: true }) });
    await expect(choice.locator('svg[data-icon="square"]')).toHaveCount(1);
  }
  await page.getByText("Select Items to Follow", { exact: true }).click();
  expect((await dashboardView(page)).center).toEqual(fixed.center);
  const positions = peer.getByTestId("positions-menu");
  await positions.getByText("All Positions", { exact: true }).click();
  const position = positions
    .locator("table")
    .last()
    .getByRole("row")
    .filter({ has: peer.getByRole("cell", { name: "+00:02:00", exact: true }) });
  await position.locator('svg[data-icon="ellipsis-vertical"]').click();
  peer.once("dialog", (dialog) => dialog.accept());
  await peer.locator("dialog[open]").getByText("Delete Entry", { exact: true }).click();
  await expect
    .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries)
    .toEqual([]);
  await followChoice(page, "EV1", true);
  expect((await dashboardView(page)).center).toEqual(fixed.center);
  await followChoice(page, "Stations", true);
  await expectCenter(page, (await mission.read()).stations[mission.ids.rexStationB].location);
});
