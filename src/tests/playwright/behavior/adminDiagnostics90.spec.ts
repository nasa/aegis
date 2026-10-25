import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { BrowserContext } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";

async function logInViewer(context: BrowserContext, username: string) {
  const response = await context.request.post("/api/v1/auth/login", {
    data: { username, password: "admin-diagnostics-viewer-password" },
  });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ status: "success", data: { isSuperAdmin: false } });
}

test("admin export and Automerge diagnostics address their mission and reject missing or unauthorized data", async ({
  browser,
  baseURL,
  page,
  request,
  mission,
}) => {
  const database = new DB();
  const username = `Admin diagnostics viewer ${randomUUID()}`;
  const password = "admin-diagnostics-viewer-password";
  const missingMissionId = 2147483647;
  let viewer: BrowserContext | undefined;

  try {
    const listingResponse = await request.get(`/api/v1/docListing?missionId=${mission.id}`);
    expect(listingResponse.ok()).toBe(true);
    const listingBody = (await listingResponse.json()) as WrappedResponse<AutomergeDocListing[]>;
    expect(listingBody.status).toBe("success");
    expect(listingBody.data).toHaveLength(1);
    expect(listingBody.data?.[0]).toMatchObject({
      missionId: mission.id,
      automergeUrl: mission.docUrl,
    });

    const missingListing = await request.get(`/api/v1/docListing?missionId=${missingMissionId}`);
    expect(missingListing.ok()).toBe(true);
    expect(await missingListing.json()).toMatchObject({ status: "success", data: [] });

    const dumpResponse = await request.get(`/api/v1/missionDump?missionId=${mission.id}`);
    expect(dumpResponse.ok()).toBe(true);
    const dumpBody = (await dumpResponse.json()) as WrappedResponse<MissionDump>;
    expect(dumpBody.data?.missionData.mission).toMatchObject({
      id: mission.id,
      name: mission.name,
    });

    const missingDump = await request.get(`/api/v1/missionDump?missionId=${missingMissionId}`);
    expect(
      missingDump.status(),
      "A missing mission dump must return an explicit not-found status"
    ).toBe(404);
    expect(await missingDump.json()).toMatchObject({
      status: "failure",
      message: `Mission ${missingMissionId} not found`,
    });

    await page.goto(`/admin/export/${missingMissionId}`);
    await expect(page.getByRole("heading", { name: "Export Mission", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(
      `Mission ${missingMissionId} was not found or is unavailable.`
    );
    await expect(
      page.getByRole("button", { name: "Dump Mission to JSON File", exact: true })
    ).toHaveCount(0);

    await page.goto(`/admin/export/${mission.id}`);
    await expect(page.getByRole("heading", { name: "Export Mission", exact: true })).toBeVisible();
    await expect(page.getByText(mission.name, { exact: true })).toBeVisible();
    await page.getByLabel("Mission Details", { exact: true }).check();
    await page.getByRole("button", { name: "Export JSON to Text Field", exact: true }).click();
    const exported = await page.locator("textarea").inputValue();
    expect(exported).toContain(mission.name);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Dump Mission to JSON File", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^mission_${mission.id}_dump_.*\\.json$`)
    );
    const downloadedDump = JSON.parse(
      await readFile((await download.path()) as string, "utf8")
    ) as MissionDump;
    expect(downloadedDump.missionData.mission).toMatchObject({
      id: mission.id,
      name: mission.name,
    });

    await page.goto(`/admin/automerge/${mission.docUrl}`);
    await expect(
      page.getByRole("heading", { name: "Manage Automerge Data", exact: true })
    ).toBeVisible();
    await expect(page.getByText(mission.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(mission.docUrl, { exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export Automerge Document as JSON", exact: true })
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Import JSON as New Version", exact: true })
    ).toBeEnabled();

    await database.executeQuery(
      "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,false,$3,$4,$4)",
      [
        username,
        await bcrypt.hash(password, 4),
        JSON.stringify([{ missionId: mission.id, permissions: { view: true, edit: false } }]),
        new Date().toISOString(),
      ]
    );
    viewer = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    await logInViewer(viewer, username);
    const viewerAllowedListing = await viewer.request.get(
      `/api/v1/docListing?missionId=${mission.id}`
    );
    expect(viewerAllowedListing.ok()).toBe(true);
    expect(
      ((await viewerAllowedListing.json()) as WrappedResponse<AutomergeDocListing[]>).data
    ).toEqual(listingBody.data);
    const deniedListing = await viewer.request.get(
      `/api/v1/docListing?missionId=${missingMissionId}`
    );
    expect(deniedListing.status()).toBe(401);
    expect(await deniedListing.json()).toMatchObject({
      status: "failure",
      message: "Unauthorized",
    });
    const deniedDump = await viewer.request.get(`/api/v1/missionDump?missionId=${mission.id}`);
    expect(deniedDump.status()).toBe(401);
    expect(await deniedDump.json()).toMatchObject({ status: "failure", message: "Unauthorized" });

    const viewerPage = await viewer.newPage();
    for (const route of [`/admin/export/${mission.id}`, `/admin/automerge/${mission.docUrl}`]) {
      await viewerPage.goto(route);
      await expect(viewerPage).toHaveURL(new URL("/", baseURL).toString());
      await expect(viewerPage.getByText("Select a Mission", { exact: true })).toBeVisible();
      await expect(
        viewerPage.getByRole("button", { name: "Import JSON as New Version", exact: true })
      ).toHaveCount(0);
    }
  } finally {
    await viewer?.close();
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
  }
});

test("export route hides prior mission controls while a changed mission ID is loading", async ({
  page,
  mission,
}) => {
  const missingMissionId = 2147483647;
  await page.goto(`/admin/export/${mission.id}`);
  await expect(page.getByRole("heading", { name: "Export Mission", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Dump Mission to JSON File", exact: true })
  ).toBeVisible();

  let releaseLookup: (() => void) | undefined;
  const lookupGate = new Promise<void>((resolve) => {
    releaseLookup = resolve;
  });
  const missingListingRoute = `**/api/v1/docListing?missionId=${missingMissionId}`;
  await page.route(missingListingRoute, async (route) => {
    await lookupGate;
    await route.continue();
  });

  try {
    await page.evaluate((id) => {
      window.history.pushState({}, "", `/admin/export/${id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, missingMissionId);
    await expect(page).toHaveURL(new RegExp(`/admin/export/${missingMissionId}$`));
    await expect(page.getByRole("status")).toHaveText("Loading mission…");
    await expect(
      page.getByRole("button", { name: "Dump Mission to JSON File", exact: true })
    ).toHaveCount(0);

    releaseLookup?.();
    await expect(page.getByRole("alert")).toContainText(
      `Mission ${missingMissionId} was not found or is unavailable.`
    );
  } finally {
    releaseLookup?.();
    await page.unroute(missingListingRoute);
  }
});

test("super-admin connection monitors follow isolated visitors, refresh, leave, and role limits", async ({
  browser,
  baseURL,
  page,
  request,
  mission,
}) => {
  const database = new DB();
  const username = `Monitor viewer ${randomUUID()}`;
  const password = "admin-diagnostics-viewer-password";
  let viewer: BrowserContext | undefined;
  const emssToken = process.env.EMSS_TOKEN;
  const dustToken = process.env.DUST_TOKEN;

  try {
    expect(emssToken, "The configured local EMSS token is available to the monitor").toBeTruthy();
    expect(dustToken, "The configured local DUST token is available to the monitor").toBeTruthy();
    const isEmssApiEnabledResponse = await request.get("/api/v1/emss/enableEmssApi");
    expect(isEmssApiEnabledResponse.ok()).toBe(true);
    const isEmssApiEnabled = ((await isEmssApiEnabledResponse.json()) as WrappedResponse<boolean>)
      .data;

    await database.executeQuery(
      "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,false,$3,$4,$4)",
      [
        username,
        await bcrypt.hash(password, 4),
        JSON.stringify([{ missionId: mission.id, permissions: { view: true, edit: false } }]),
        new Date().toISOString(),
      ]
    );
    viewer = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    await logInViewer(viewer, username);
    const viewerPage = await viewer.newPage();

    await page.goto("/admin/serverSocketStatus");
    await expect(
      page.getByRole("heading", { name: "Visitor Connections", exact: true })
    ).toBeVisible();
    await expect(page.getByText("connected", { exact: true }).first()).toBeVisible();
    await viewerPage.goto(mission.url);
    await expect(viewerPage.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      mission.name
    );
    await expect(viewerPage.locator(".ol-viewport")).toHaveCount(1);
    await expect(viewerPage.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
    const appSocketStatus = async () => {
      const status = await request.get("/api/v1/socket/serverSocketStatus");
      expect(status.ok()).toBe(true);
      return (await status.json()) as ServerSocketStatus;
    };
    await expect
      .poll(async () =>
        (await appSocketStatus()).visitorsData.some((visitor) => visitor.missionId === mission.id)
      )
      .toBe(true);
    await expect(page.getByRole("heading", { name: new RegExp(mission.name) })).toContainText(
      "1 connection"
    );
    await expect(
      page.getByRole("columnheader", { name: "IP Address", exact: true }).first()
    ).toBeVisible();

    const deniedSocketStatus = await viewer.request.get("/api/v1/socket/serverSocketStatus");
    expect(deniedSocketStatus.status()).toBe(401);
    expect(await deniedSocketStatus.json()).toMatchObject({
      status: "failure",
      message: "Unauthorized",
    });
    await viewerPage.goto("/admin/serverSocketStatus");
    await expect(viewerPage).toHaveURL(new URL("/", baseURL).toString());
    await expect(viewerPage.getByText("Select a Mission", { exact: true })).toBeVisible();

    await page.goto("/admin/maestroV2");
    await expect(
      page.getByRole("heading", { name: "Maegistro v2 Monitor", exact: true })
    ).toBeVisible();
    await page.getByPlaceholder("EMSS Token").fill(emssToken as string);
    await page.getByPlaceholder("Mission ID").nth(0).fill(String(mission.id));
    const maestroName = `Maestro ${randomUUID().slice(0, 8)}`;
    await page.getByPlaceholder("Visitor Name").fill(maestroName);
    await page.getByRole("button", { name: "Connect & Join", exact: true }).click();
    await expect(page.getByText("connected", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText(`success: Joined mission ${mission.id}`, { exact: true })
    ).toBeVisible();
    await expect(page.getByText(maestroName, { exact: true })).toBeVisible();
    await page.getByTitle("Refresh").click();
    await expect(page.getByText(maestroName, { exact: true })).toBeVisible();
    const leaveCard = page
      .getByRole("heading", { name: "missionLeave", exact: true })
      .locator("..");
    await page.getByPlaceholder("Mission ID").nth(1).fill(String(mission.id));
    await leaveCard.getByRole("button", { name: "Emit", exact: true }).click();
    await page.getByTitle("Refresh").click();
    await expect(page.getByText(maestroName, { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("No Maegistro v2 visitors connected.", { exact: true })
    ).toBeVisible();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(page.getByText("disconnected", { exact: true }).first()).toBeVisible();

    await page.goto("/admin/dustV1");
    await expect(page.getByRole("heading", { name: "DUST Monitor", exact: true })).toBeVisible();
    await page.getByPlaceholder("DUST Token").fill(dustToken as string);
    await page.getByPlaceholder("Mission ID").nth(0).fill(String(mission.id));
    const dustName = `DUST ${randomUUID().slice(0, 8)}`;
    await page.getByPlaceholder("Visitor Name").fill(dustName);
    await page.getByRole("button", { name: "Connect & Join", exact: true }).click();
    await expect(page.getByText("connected", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText(`success: Joined mission ${mission.id}`, { exact: true })
    ).toBeVisible();
    await expect(page.getByText(dustName, { exact: true })).toBeVisible();
    await page.getByTitle("Refresh").click();
    await expect(page.getByText(dustName, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(page.getByText("disconnected", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(dustName, { exact: true })).toHaveCount(0);

    await page.goto("/admin/emss");
    await expect(page.getByRole("heading", { name: "EMSS", exact: true })).toBeVisible();
    await expect(page.getByText(isEmssApiEnabled ? "Yes" : "No", { exact: true })).toBeVisible();
    if (isEmssApiEnabled) {
      page.once("dialog", async (dialog) => {
        expect(dialog.type()).toBe("confirm");
        await dialog.dismiss();
      });
      await page.getByRole("button", { name: "Turn Off", exact: true }).click();
      await expect(page.getByText("Yes", { exact: true })).toBeVisible();
      expect(
        (
          (await (
            await request.get("/api/v1/emss/enableEmssApi")
          ).json()) as WrappedResponse<boolean>
        ).data
      ).toBe(true);
    }

    for (const route of ["/admin/maestroV2", "/admin/dustV1", "/admin/emss"]) {
      await viewerPage.goto(route);
      await expect(viewerPage).toHaveURL(new URL("/", baseURL).toString());
      await expect(viewerPage.getByText("Select a Mission", { exact: true })).toBeVisible();
    }
    const deniedEmssStatus = await viewer.request.get("/api/v1/emss/enableEmssApi");
    expect(deniedEmssStatus.status()).toBe(401);
    expect(await deniedEmssStatus.json()).toMatchObject({
      status: "failure",
      message: "Unauthorized",
    });
  } finally {
    await viewer?.close();
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
  }
});
