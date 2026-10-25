import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { BrowserContext } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";

test("unavailable mission links redirect scoped users without exposing or editing stale mission data", async ({
  browser,
  baseURL,
  request,
  mission,
}) => {
  const database = new DB();
  const username = `Unavailable mission viewer ${randomUUID()}`;
  const password = "unavailable-mission-password";
  const now = new Date().toISOString();
  let inaccessibleMissionId: number | undefined;
  let deletedMissionId: number | undefined;
  let deletedMissionCleaned = false;
  let viewer: BrowserContext | undefined;
  const originalAllowedMission = await mission.read();

  try {
    const inaccessibleCreate = await request.post("/api/v1/missionAutomerge", { data: {} });
    expect(inaccessibleCreate.ok()).toBe(true);
    inaccessibleMissionId = (
      (await inaccessibleCreate.json()) as WrappedResponse<AutomergeDocListing>
    ).data.missionId;
    const deletedCreate = await request.post("/api/v1/missionAutomerge", { data: {} });
    expect(deletedCreate.ok()).toBe(true);
    deletedMissionId = ((await deletedCreate.json()) as WrappedResponse<AutomergeDocListing>).data
      .missionId;

    await database.executeQuery(
      "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,false,$3,$4,$4)",
      [
        username,
        await bcrypt.hash(password, 4),
        JSON.stringify([{ missionId: mission.id, permissions: { view: true, edit: false } }]),
        now,
      ]
    );
    viewer = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const login = await viewer.request.post("/api/v1/auth/login", {
      data: { username, password },
    });
    expect(login.ok()).toBe(true);
    expect(await login.json()).toMatchObject({
      status: "success",
      data: { isSuperAdmin: false, permissionList: [{ missionId: mission.id }] },
    });

    const inaccessibleWrite = await viewer.request.post("/api/v1/missionAutomerge/fields", {
      data: {
        missionId: inaccessibleMissionId,
        fields: { name: "Must not expose inaccessible mission" },
      },
    });
    expect(inaccessibleWrite.status()).toBe(401);
    expect(await inaccessibleWrite.json()).toMatchObject({
      status: "failure",
      message: "Unauthorized",
    });
    const inaccessibleRead = await viewer.request.get(
      `/api/v1/all?missionId=${inaccessibleMissionId}`
    );
    expect(inaccessibleRead.status()).toBe(401);

    const deleted = await request.delete("/api/v1/missionAutomerge", {
      data: { missionIds: [deletedMissionId] },
    });
    expect(deleted.ok()).toBe(true);
    expect((await deleted.json()).status).toBe("success");
    deletedMissionCleaned = true;

    const page = await viewer.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const staleLink = (id: number) =>
      `/mission/${id}?evaRefUuid=${mission.ids.evaA}&actionRefUuid=${mission.ids.actionA}&rexUuid=${mission.ids.rexA}`;
    const attemptedLinks = [
      `/mission/${inaccessibleMissionId}`,
      "/mission/2147483647",
      `/mission/${deletedMissionId}`,
      staleLink(deletedMissionId),
    ];

    for (const [index, link] of attemptedLinks.entries()) {
      await page.goto(link);
      await expect(page).toHaveURL(new URL("/", baseURL).toString());
      await expect(page.getByText("Select a Mission", { exact: true })).toBeVisible();
      await expect(page.locator("tr")).toHaveCount(1);
      const allowedRow = page
        .locator("tr")
        .filter({ has: page.getByText(mission.name, { exact: true }) });
      await expect(allowedRow).toHaveCount(1);
      await expect(allowedRow.getByRole("button", { name: "Select", exact: true })).toBeVisible();
      await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
      await expect(page.locator(".ol-viewport")).toHaveCount(0);
      if (index === 0) {
        const list = await viewer.request.get("/api/v1/missionHomepageItems");
        expect(list.ok()).toBe(true);
        const visible = (await list.json()).data as MissionHomepageItem[];
        expect(visible.map((item) => item.id)).toEqual([mission.id]);
      }
    }

    expect(pageErrors).toEqual([]);
    expect(await mission.read()).toEqual(originalAllowedMission);
  } finally {
    await viewer?.close();
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
    if (inaccessibleMissionId !== undefined) {
      const deleted = await request.delete("/api/v1/missionAutomerge", {
        data: { missionIds: [inaccessibleMissionId] },
      });
      expect(deleted.ok()).toBe(true);
    }
    if (deletedMissionId !== undefined && !deletedMissionCleaned) {
      const deleted = await request.delete("/api/v1/missionAutomerge", {
        data: { missionIds: [deletedMissionId] },
      });
      expect(deleted.ok()).toBe(true);
    }
  }
});
