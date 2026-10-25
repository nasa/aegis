import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { Page } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  planningField,
  selectPlanningStationActions,
} from "./planningHelpers";
import { openExecutionInfo, selectExecution } from "./executionHelpers";

test.use({ scenario: "execution" });

async function actionForExecution(page: Page, mission: BehavioralMission) {
  const toggle = page.getByLabel("globalEditToggle", { exact: true });
  if (
    (await toggle.count()) &&
    (await toggle.getAttribute("data-tooltip-content")) === "Turn Off Edit Mode"
  )
    await toggle.click();
  const eva = await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
  await eva.getByText("Alpha station", { exact: true }).click();
  await page.getByLabel("actions_panel", { exact: true }).click();
  return page
    .getByRole("listitem")
    .filter({ has: planningField(page, "Action Name").filter({ hasText: "Sample regolith" }) });
}

test("execution action status requires editor and running ownership, permits Edit off, and rejects disabled and Maestro controlled writes", async ({
  page,
  browser,
  baseURL,
  mission,
}) => {
  const database = new DB();
  const username = `Status viewer ${randomUUID()}`;
  const viewer = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    await mission.change((doc) => {
      doc.rexes[mission.ids.rexB].isRunning = false;
    });
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
    await page.getByLabel("Execute EVA", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexA].isRunning)
      .toBe(true);
    let action = await actionForExecution(page, mission);
    const initial = await mission.read();
    await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveAttribute(
      "data-tooltip-content",
      "Turn On Edit Mode"
    );
    await action.locator('[class*="actionHeadingRexStatusWrapper"]').click();
    await page.locator("dialog[open]").getByText("Complete", { exact: true }).click();
    await expect
      .poll(
        async () =>
          (await mission.read()).rexes[mission.ids.rexA].actionEntries[mission.ids.rexActionA]
            .rexStatus
      )
      .toBe("complete");

    await database.executeQuery(
      "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,false,$3,$4,$4)",
      [
        username,
        await bcrypt.hash("status-viewer-password", 4),
        JSON.stringify([{ missionId: mission.id, permissions: { view: true, edit: false } }]),
        new Date().toISOString(),
      ]
    );
    const login = await viewer.request.post("/api/v1/auth/login", {
      data: { username, password: "status-viewer-password" },
    });
    expect(login.ok()).toBe(true);
    const viewerPage = await viewer.newPage();
    await viewerPage.goto(mission.url);
    await expect(viewerPage.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      mission.name
    );
    await expect(viewerPage.locator(".ol-viewport")).toHaveCount(1);
    const viewerAction = await actionForExecution(viewerPage, mission);
    await expect(viewerAction.locator('[class*="actionHeadingRexStatusWrapper"]')).toHaveAttribute(
      "data-tooltip-content",
      "Complete"
    );
    await viewerAction.locator('[class*="actionHeadingRexStatusWrapper"]').click();
    await expect(viewerPage.locator("dialog[open]")).toHaveCount(0);
    expect(
      (await mission.read()).rexes[mission.ids.rexA].actionEntries[mission.ids.rexActionA].rexStatus
    ).toBe("complete");

    await enablePlanningEditMode(page);
    await action.locator('svg[data-icon="ellipsis-vertical"]').click();
    await page.locator("dialog[open]").getByText("Deactivate Action", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.rexActionA].enabled)
      .toBe(false);
    await expect(action.locator('[class*="actionHeadingRexStatusWrapper"] svg')).toHaveCount(0);
    await expect(action.locator('[class*="actionHeadingRexStatusWrapper"]')).not.toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await action.locator('svg[data-icon="ellipsis-vertical"]').click();
    await page.locator("dialog[open]").getByText("Activate Action", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).actions[mission.ids.rexActionA].enabled)
      .toBe(true);

    await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
    await page.locator("#maestroCheckbox").check();
    action = await actionForExecution(page, mission);
    await action.locator('[class*="actionHeadingRexStatusWrapper"]').click();
    await expect(
      page
        .locator("dialog[open]")
        .getByText("Item status is controlled by Maestro", { exact: false })
    ).toBeVisible();
    await page.keyboard.press("Escape");
    expect(
      (await mission.read()).rexes[mission.ids.rexA].actionEntries[mission.ids.rexActionA].rexStatus
    ).toBe("complete");
    await enablePlanningEditMode(page);
    await openExecutionInfo(page, "Survey Alpha", mission.ids.rexEvaA);
    await page.locator("#maestroCheckbox").uncheck();
    await page.getByLabel("Stop Execution", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexA].isRunning)
      .toBe(false);
    await mission.open(page);
    action = await actionForExecution(page, mission);
    await action.locator('[class*="actionHeadingRexStatusWrapper"]').click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await selectPlanningStationActions(page, "Alpha station");
    await expect(
      page.getByRole("listitem").locator('[class*="actionHeadingRexStatusWrapper"]')
    ).toHaveCount(0);
    const after = await mission.read();
    expect(after.rexes[mission.ids.rexA].actionEntries[mission.ids.rexActionA].rexStatus).toBe(
      "complete"
    );
    expect(after.actions).toEqual({
      ...initial.actions,
      [mission.ids.rexActionA]: {
        ...initial.actions[mission.ids.rexActionA],
        updatedAt: after.actions[mission.ids.rexActionA].updatedAt,
      },
    });
    expect(after.actions[mission.ids.rexActionA].updatedAt).toBeGreaterThanOrEqual(
      initial.actions[mission.ids.rexActionA].updatedAt
    );
    expect(after.rexes[mission.ids.rexB]).toEqual(initial.rexes[mission.ids.rexB]);
  } finally {
    await viewer.close();
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
  }
});
