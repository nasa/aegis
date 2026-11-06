import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { Page } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  planningEvaRow,
  selectPlanningEva,
  selectPlanningPoi,
  selectPlanningStationActions,
} from "./planningHelpers";

async function parentActions(page: Page, parent: "poi" | "station" | "traverse") {
  if (parent === "poi") {
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabel("actions_panel", { exact: true }).click();
  } else if (parent === "station") await selectPlanningStationActions(page, "Alpha station");
  else {
    await selectPlanningEva(page, "Survey Alpha");
    await planningEvaRow(page, "Survey Alpha").getByText("Alpha to Bravo", { exact: true }).click();
    await page.getByLabel("actions_panel", { exact: true }).click();
  }
}

for (const role of ["viewer", "editor", "admin"] as const) {
  test(`${role} template creation observes the real account permission while action reads remain available`, async ({
    browser,
    baseURL,
    mission,
  }) => {
    const database = new DB();
    const username = `Template ${role} ${randomUUID()}`;
    const scoped = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const initial = await mission.read();
    try {
      await database.executeQuery(
        "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,$3,$4,$5,$5)",
        [
          username,
          await bcrypt.hash("template-role-password", 4),
          role === "admin",
          JSON.stringify([
            { missionId: mission.id, permissions: { view: true, edit: role !== "viewer" } },
          ]),
          new Date().toISOString(),
        ]
      );
      const login = await scoped.request.post("/api/v1/auth/login", {
        data: { username, password: "template-role-password" },
      });
      expect(login.ok()).toBe(true);
      const page = await scoped.newPage();
      await page.goto(mission.url);
      await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
      await expect(page.locator(".ol-viewport")).toHaveCount(1);
      await parentActions(page, "station");
      await expect(page.locator('div[aria-label="Action Name"]')).toHaveText("Sample regolith");
      if (role === "viewer") {
        await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
        await expect(
          page.getByRole("listitem").locator('svg[data-icon="ellipsis-vertical"]')
        ).toHaveCount(0);
      } else {
        await enablePlanningEditMode(page);
        await page.getByRole("listitem").locator('svg[data-icon="ellipsis-vertical"]').click();
        if (role === "editor") {
          await expect(
            page.locator("dialog[open]").getByText("Save as Template", { exact: true })
          ).toHaveCount(0);
          await page.keyboard.press("Escape");
        } else {
          page.once("dialog", (d) => d.accept());
          await page.locator("dialog[open]").getByText("Save as Template", { exact: true }).click();
          await expect
            .poll(async () => Object.keys((await mission.read()).actionTemplates).length)
            .toBe(1);
        }
      }
      expect((await mission.read()).actions).toEqual(initial.actions);
      if (role !== "admin")
        expect((await mission.read()).actionTemplates).toEqual(initial.actionTemplates);
    } finally {
      await scoped.close();
      await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
    }
  });
}
