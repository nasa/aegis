import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { BrowserContext } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";

for (const session of ["signed out", "expired cookie"] as const) {
  for (const entry of ["home", "mission", "dashboard", "admin"] as const) {
    test(`${session} ${entry} entry recovers to login without protected controls`, async ({
      browser,
      context,
      baseURL,
      mission,
    }) => {
      const state = await context.storageState();
      const isolated = await browser.newContext({
        baseURL,
        storageState:
          session === "signed out"
            ? { cookies: [], origins: [] }
            : {
                cookies: state.cookies.map((cookie) => ({
                  ...cookie,
                  expires: Math.floor(Date.now() / 1000) - 60,
                })),
                origins: [],
              },
      });
      try {
        // A browser-expired session must not be sent to the local cookie-session backend.
        expect(await isolated.cookies()).toEqual([]);
        const page = await isolated.newPage();
        await page.goto(
          { home: "/", mission: mission.url, dashboard: mission.dashboardUrl, admin: "/admin" }[
            entry
          ]
        );
        await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
        await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
        await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveCount(0);
        await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
        await expect(page.locator(".ol-viewport")).toHaveCount(0);
        const protectedList = await isolated.request.get("/api/v1/missionHomepageItems");
        expect(protectedList.status()).toBe(401);
        expect(await protectedList.json()).toMatchObject({
          status: "failure",
          message: "Unauthorized",
        });
        const protectedWrite = await isolated.request.post("/api/v1/missionAutomerge/fields", {
          data: { missionId: mission.id, fields: { name: "Forbidden signed-out edit" } },
        });
        expect(protectedWrite.status()).toBe(401);
        expect((await mission.read()).name).toBe(mission.name);
      } finally {
        await isolated.close();
      }
    });
  }
}

async function loginScoped(context: BrowserContext, username: string) {
  const response = await context.request.post("/api/v1/auth/login", {
    data: { username, password: "isolated-role-password" },
  });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ status: "success", data: { isSuperAdmin: false } });
}

for (const role of ["viewer", "editor"] as const) {
  test(`${role} mission selector lists only granted missions and switches without prior entities`, async ({
    browser,
    baseURL,
    request,
    mission,
  }) => {
    const database = new DB();
    const username = `Scoped ${role} ${randomUUID()}`;
    const createdIds: number[] = [];
    let scoped: BrowserContext | undefined;
    const before = await mission.read();
    try {
      for (const name of [`Allowed empty ${randomUUID()}`, `Denied empty ${randomUUID()}`]) {
        const create = await request.post("/api/v1/missionAutomerge", { data: {} });
        expect(create.ok()).toBe(true);
        const body = await create.json();
        expect(body.status).toBe("success");
        const id = body.data.missionId as number;
        createdIds.push(id);
        const named = await request.post("/api/v1/missionAutomerge/fields", {
          data: { missionId: id, fields: { name } },
        });
        expect(named.ok()).toBe(true);
      }
      const [allowedId, deniedId] = createdIds;
      const permissions: Permission[] = [mission.id, allowedId].map((missionId) => ({
        missionId,
        permissions: { view: true, edit: role === "editor" },
      }));
      await database.executeQuery(
        "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,false,$3,$4,$4)",
        [
          username,
          await bcrypt.hash("isolated-role-password", 4),
          JSON.stringify(permissions),
          new Date().toISOString(),
        ]
      );
      scoped = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
      await loginScoped(scoped, username);
      const list = await scoped.request.get("/api/v1/missionHomepageItems");
      expect(list.ok()).toBe(true);
      const items = (await list.json()).data as MissionHomepageItem[];
      expect(items.map((item) => item.id).sort((a, b) => a - b)).toEqual(
        [mission.id, allowedId].sort((a, b) => a - b)
      );
      const emptyName = items.find((item) => item.id === allowedId)!.name;
      const page = await scoped.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/");
      await expect(page.locator("tr")).toHaveCount(2);
      await page
        .locator("tr")
        .filter({ has: page.getByText(mission.name, { exact: true }) })
        .getByRole("button", { name: "Select", exact: true })
        .click();
      await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
      await page.getByLabel("station Section", { exact: true }).click();
      await expect(page.getByLabel("stationList-item", { exact: true })).toHaveCount(2);
      await page.goto("/");
      await page
        .locator("tr")
        .filter({ has: page.getByText(emptyName, { exact: true }) })
        .getByRole("button", { name: "Select", exact: true })
        .click();
      await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(emptyName);
      await page.getByLabel("station Section", { exact: true }).click();
      await expect(page.getByLabel("stationList-item", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Alpha station", { exact: true })).toHaveCount(0);
      await page.goto(`/mission/${deniedId}`);
      await expect(page).toHaveURL(new URL("/", baseURL).toString());
      await expect(page.getByText("Select a Mission", { exact: true })).toBeVisible();
      await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveCount(0);
      expect(errors).toEqual([]);
      expect(await mission.read()).toEqual(before);
    } finally {
      await scoped?.close();
      await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
      if (createdIds.length) {
        const removed = await request.delete("/api/v1/missionAutomerge", {
          data: { missionIds: createdIds },
        });
        expect(removed.ok()).toBe(true);
      }
    }
  });
}
