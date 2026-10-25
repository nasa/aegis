import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as bcrypt from "bcryptjs";
import type { BrowserContext, Page } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";
import { openPlanningSection } from "./planningHelpers";

type MissionDetailsExport = { exportMission: ExportMission };

async function logIn(context: BrowserContext, username: string, password: string) {
  const response = await context.request.post("/api/v1/auth/login", {
    data: { username, password },
  });
  expect(response.ok()).toBe(true);
  return response.json() as Promise<WrappedResponse<AppUser>>;
}

async function openExport(page: Page, missionUrl: string, missionName: string): Promise<void> {
  await page.goto(missionUrl);
  await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(missionName);
  await openPlanningSection(page, "mission");
  await page.getByLabel("export_panel", { exact: true }).click();
  await page.locator("#export-all-evas").uncheck();
  await page.locator("#export-mission").check();
}

async function downloadMissionDetails(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByLabel("Export JSON File", { exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return {
    filename: download.suggestedFilename(),
    data: JSON.parse(
      await readFile((await download.path()) as string, "utf8")
    ) as MissionDetailsExport,
  };
}

test.use({ scenario: "execution" });

test("viewer and editor exports survive failure, repeated clicks, and a delayed mission switch", async ({
  browser,
  baseURL,
  request,
  mission,
}) => {
  const database = new DB();
  const password = `export-recovery-${randomUUID()}`;
  const viewerName = `Export viewer ${randomUUID()}`;
  const editorName = `Export editor ${randomUUID()}`;
  const secondaryName = `Export switch ${randomUUID()}`;
  const secondaryDescription = `Isolated export mission ${randomUUID()}`;
  let secondaryId: number | undefined;
  let viewer: BrowserContext | undefined;
  let editor: BrowserContext | undefined;

  try {
    const sourceBefore = await mission.read();
    const createdMission = await request.post("/api/v1/missionAutomerge", { data: {} });
    expect(createdMission.ok()).toBe(true);
    const createdBody = (await createdMission.json()) as WrappedResponse<AutomergeDocListing>;
    expect(createdBody.status).toBe("success");
    expect(createdBody.data?.missionId).toBeGreaterThan(0);
    secondaryId = createdBody.data.missionId;
    const namedMission = await request.post("/api/v1/missionAutomerge/fields", {
      data: {
        missionId: secondaryId,
        fields: { name: secondaryName, description: secondaryDescription },
      },
    });
    expect(namedMission.ok()).toBe(true);
    const secondaryDumpResponse = await request.get(`/api/v1/missionDump?missionId=${secondaryId}`);
    expect(secondaryDumpResponse.ok()).toBe(true);
    const secondaryDump = (await secondaryDumpResponse.json()) as WrappedResponse<MissionDump>;
    const secondaryBefore = secondaryDump.data?.missionData.mission;
    expect(secondaryBefore).toMatchObject({
      id: secondaryId,
      name: secondaryName,
      description: secondaryDescription,
    });
    const sourcePermissions = [
      { missionId: mission.id, permissions: { view: true, edit: false } },
      { missionId: secondaryId, permissions: { view: true, edit: false } },
    ];
    const editorPermissions = sourcePermissions.map((permission) => ({
      ...permission,
      permissions: { view: true, edit: true },
    }));
    const now = new Date().toISOString();
    await database.executeQuery(
      "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,false,$3,$4,$4),($5,$2,false,false,$6,$4,$4)",
      [
        viewerName,
        await bcrypt.hash(password, 4),
        JSON.stringify(sourcePermissions),
        now,
        editorName,
        JSON.stringify(editorPermissions),
      ]
    );

    viewer = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const viewerLogin = await logIn(viewer, viewerName, password);
    expect(viewerLogin.data).toMatchObject({ isAdmin: false, isSuperAdmin: false });
    const viewerPage = await viewer.newPage();
    await openExport(viewerPage, mission.url, mission.name);
    await expect(viewerPage.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
    const viewerDownload = await downloadMissionDetails(viewerPage);
    expect(viewerDownload.filename).toBe(`${mission.name}_mission_export.json`);
    expect(viewerDownload.data.exportMission).toMatchObject({
      id: mission.id,
      name: mission.name,
      description: sourceBefore.description,
    });

    editor = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const editorLogin = await logIn(editor, editorName, password);
    expect(editorLogin.data).toMatchObject({ isAdmin: false, isSuperAdmin: false });
    const editorPage = await editor.newPage();
    await editor.addInitScript(() => {
      const nativeClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (
          this.download.endsWith("_export.json") &&
          sessionStorage.getItem("delayNextMissionExport") === "1"
        ) {
          sessionStorage.removeItem("delayNextMissionExport");
          window.setTimeout(() => nativeClick.call(this), 5000);
          return;
        }
        nativeClick.call(this);
      };
      const nativeCreateObjectUrl = URL.createObjectURL;
      URL.createObjectURL = function (blob: Blob) {
        if (sessionStorage.getItem("failNextMissionExport") === "1") {
          sessionStorage.removeItem("failNextMissionExport");
          throw new Error("Synthetic export URL creation failure");
        }
        return nativeCreateObjectUrl.call(URL, blob);
      };
    });

    await openExport(editorPage, mission.url, mission.name);
    await expect(editorPage.getByLabel("globalEditToggle", { exact: true })).toBeEnabled();
    const firstEditorDownload = await downloadMissionDetails(editorPage);
    expect(firstEditorDownload.filename).toBe(`${mission.name}_mission_export.json`);
    expect(firstEditorDownload.data.exportMission).toMatchObject({
      id: mission.id,
      name: mission.name,
    });
    const repeatedEditorDownload = await downloadMissionDetails(editorPage);
    expect(repeatedEditorDownload.data).toEqual(firstEditorDownload.data);

    await editorPage.evaluate(() => sessionStorage.setItem("delayNextMissionExport", "1"));
    const delayedDownloadPromise = editorPage.waitForEvent("download");
    await editorPage.getByLabel("Export JSON File", { exact: true }).click();
    await editorPage.locator('svg[data-icon="bars"]').click();
    await expect(editorPage.getByText("Select a Mission", { exact: true })).toBeVisible();
    const secondaryRow = editorPage.getByRole("row").filter({ hasText: secondaryName });
    await expect(secondaryRow).toHaveCount(1);
    await secondaryRow.getByRole("button", { name: "Select", exact: true }).click();
    await expect(editorPage.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      secondaryName
    );
    const delayedDownload = await delayedDownloadPromise;
    expect(delayedDownload.suggestedFilename()).toBe(`${mission.name}_mission_export.json`);
    const delayedData = JSON.parse(
      await readFile((await delayedDownload.path()) as string, "utf8")
    ) as MissionDetailsExport;
    expect(delayedData.exportMission).toMatchObject({ id: mission.id, name: mission.name });

    await editorPage.getByLabel("mission Section", { exact: true }).click();
    await editorPage.getByLabel("export_panel", { exact: true }).click();
    await editorPage.locator("#export-all-evas").uncheck();
    await editorPage.locator("#export-mission").check();
    await editorPage.evaluate(() => sessionStorage.setItem("failNextMissionExport", "1"));
    await editorPage.getByLabel("Export JSON File", { exact: true }).click();
    await expect(editorPage.getByRole("alert").filter({ hasText: "Export failed" })).toBeVisible();

    const recoveredDownload = await downloadMissionDetails(editorPage);
    expect(recoveredDownload.filename).toBe(`${secondaryName}_mission_export.json`);
    expect(recoveredDownload.data.exportMission).toMatchObject({
      id: secondaryId,
      name: secondaryName,
      description: secondaryDescription,
    });

    expect(await mission.read()).toEqual(sourceBefore);
    expect(secondaryDump.data?.missionData.mission).toEqual(secondaryBefore);
  } finally {
    await Promise.all([editor?.close(), viewer?.close()]);
    await database.executeQuery("DELETE FROM app_user_db WHERE username IN ($1,$2)", [
      viewerName,
      editorName,
    ]);
    if (secondaryId !== undefined) {
      const deleted = await request.delete("/api/v1/missionAutomerge", {
        data: { missionIds: [secondaryId] },
      });
      expect(deleted.ok(), `Delete only isolated export mission ${secondaryId}`).toBe(true);
    }
  }
});
