import { test, expect } from "../fixtures/behavioralTest";
import { selectPlanningStation } from "./planningHelpers";

test.describe("Navigation contracts", () => {
  test("editor and dashboard direct links restore through home, back and forward without stale maps", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open(page);
    await selectPlanningStation(page, "Alpha station");
    await page.goto(mission.dashboardUrl);
    await expect(page.getByText("No EVA is currently running.", { exact: true })).toBeVisible();
    await expect(page.locator(".ol-viewport")).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByText(mission.name, { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${mission.dashboardUrl}$`));
    await expect(page.getByText("No EVA is currently running.", { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${mission.url}$`));
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
    await expect(page.locator(".ol-viewport")).toHaveCount(1);
    await selectPlanningStation(page, "Bravo station");
    await page.goForward();
    await expect(page.getByText("No EVA is currently running.", { exact: true })).toBeVisible();
    await expect(page.locator(".ol-viewport")).toHaveCount(0);
    await page.goForward();
    await expect(page.getByText(mission.name, { exact: true })).toBeVisible();
    expect(await mission.read()).toEqual(before);
  });

  test("version check explains a deployment mismatch and refreshes the requested mission with the current version", async ({
    page,
    mission,
  }) => {
    await page.route("**/api/v1/version?_=*", async (route) => {
      const response = await route.fetch();
      const version = await response.json();
      await route.fulfill({ response, json: { ...version, version: "deployment-changed" } });
    });
    await page.goto(`/versionCheck?returnUrl=${encodeURIComponent(mission.url)}`);
    await expect(page.getByRole("heading", { name: "Refresh Required" })).toBeVisible();
    await expect(page.getByText(/Required Version: deployment-changed/)).toBeVisible();
    await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
    await page.unroute("**/api/v1/version?_=*");
    await page.getByLabel("Get Latest Version", { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${mission.url}\\?_revalidate=\\d+$`));
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
    await expect(page.getByLabel("globalEditToggle", { exact: true })).toBeEnabled();
    await page.goto(`/versionCheck?returnUrl=${encodeURIComponent(mission.url)}`);
    await expect(page.getByRole("heading", { name: "✓ Version Updated" })).toBeVisible();
    await page.getByLabel("Redirect Now", { exact: true }).click();
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
    await expect(page.locator(".ol-viewport")).toHaveCount(1);
  });
});
