import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { BrowserContext, Page } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  planningField,
  savePlanningField,
  selectPlanningStation,
} from "./planningHelpers";

async function expectPresence(page: Page, editors: number, viewers: number): Promise<void> {
  await expect(
    page.locator('[data-tooltip-id="interface-header-usercount"]').locator(":scope > div")
  ).toHaveText([String(editors), String(viewers)]);
}

test("distinct editor and viewer accounts share presence and edits, retain independent selections and lose HTTP access after revocation", async ({
  browser,
  baseURL,
  mission,
}) => {
  const database = new DB();
  const suffix = randomUUID();
  const password = "collaboration-presence-password";
  const accounts = [
    { username: `Presence editor ${suffix}`, edit: true },
    { username: `Presence viewer ${suffix}`, edit: false },
  ];
  const clients: BrowserContext[] = [];
  try {
    for (const account of accounts) {
      await database.executeQuery(
        "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,false,$3,$4,$4)",
        [
          account.username,
          await bcrypt.hash(password, 4),
          JSON.stringify([
            { missionId: mission.id, permissions: { view: true, edit: account.edit } },
          ]),
          new Date().toISOString(),
        ]
      );
      const client = await browser.newContext({
        baseURL,
        storageState: { cookies: [], origins: [] },
        viewport: { width: 1960, height: 1080 },
      });
      clients.push(client);
      const login = await client.request.post("/api/v1/auth/login", {
        data: { username: account.username, password },
      });
      expect(login.ok()).toBe(true);
      expect(await login.json()).toMatchObject({
        status: "success",
        data: { username: account.username, isSuperAdmin: false },
      });
    }
    const editor = await clients[0].newPage();
    let viewer = await clients[1].newPage();
    for (const page of [editor, viewer]) {
      await page.goto(mission.url);
      await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
    }
    await expectPresence(editor, 1, 1);
    await expectPresence(viewer, 1, 1);
    await expect(viewer.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
    await selectPlanningStation(editor, "Alpha station");
    await selectPlanningStation(viewer, "Bravo station");
    await expect(viewer.getByLabel("addStation", { exact: true })).toHaveCount(0);
    await expect(viewer.getByLabel("duplicateStation", { exact: true })).toHaveCount(0);
    await planningField(viewer, "Station").locator("..").click();
    await expect(viewer.locator("dialog[open]")).toHaveCount(0);
    await enablePlanningEditMode(editor);
    await savePlanningField(editor, "Station", "Distinct editor shared site");
    await expect(
      viewer.getByLabel("stationList-item").filter({ hasText: "Distinct editor shared site" })
    ).toHaveCount(1);
    await expect(planningField(viewer, "Station")).toHaveText("Bravo station");
    await expect(planningField(editor, "Station")).toHaveText("Distinct editor shared site");
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
      .toBe("Distinct editor shared site");
    await viewer.close();
    await expectPresence(editor, 1, 0);
    viewer = await clients[1].newPage();
    await viewer.goto(mission.url);
    await selectPlanningStation(viewer, "Distinct editor shared site");
    await expectPresence(editor, 1, 1);
    await expectPresence(viewer, 1, 1);
    await expect(planningField(editor, "Station")).toHaveText("Distinct editor shared site");

    for (const account of accounts) {
      await database.executeQuery("UPDATE app_user_db SET permission_list='[]' WHERE username=$1", [
        account.username,
      ]);
    }
    for (const client of clients) {
      const read = await client.request.get(`/api/v1/all?missionId=${mission.id}`);
      expect(read.status()).toBe(401);
      const write = await client.request.post("/api/v1/missionAutomerge/fields", {
        data: { missionId: mission.id, fields: { description: "Revoked HTTP mutation" } },
      });
      expect(write.status()).toBe(401);
      expect(await write.json()).toMatchObject({ status: "failure", message: "Unauthorized" });
    }
    // Already-open document transports retain their original grant by the accepted policy.
    await savePlanningField(editor, "Station", "Existing editor connection after revocation");
    await expect(planningField(viewer, "Station")).toHaveText(
      "Existing editor connection after revocation"
    );
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
      .toBe("Existing editor connection after revocation");
    expect((await mission.read()).description).not.toBe("Revoked HTTP mutation");
    await viewer.close();
    await expectPresence(editor, 1, 0);
    await editor.reload();
    await expect(editor).toHaveURL(new URL("/", baseURL).toString());
    await expect(editor.getByLabel("missionNameHeader", { exact: true })).toHaveCount(0);
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    for (const account of accounts) {
      await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [account.username]);
    }
  }
});
