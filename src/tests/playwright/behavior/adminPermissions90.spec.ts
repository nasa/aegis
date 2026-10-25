import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { APIRequestContext, BrowserContext } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";
import { enablePlanningEditMode, openPlanningField, openPlanningSection } from "./planningHelpers";

const rolePassword = "admin-permissions-test-password";

async function logIn(context: BrowserContext, username: string) {
  const response = await context.request.post("/api/v1/auth/login", {
    data: { username, password: rolePassword },
  });
  expect(response.ok()).toBe(true);
  return response.json() as Promise<WrappedResponse<AppUser>>;
}

async function readUserByName(request: APIRequestContext, username: string) {
  const response = await request.get("/api/v1/appUsers");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as WrappedResponse<AppUser[]>;
  expect(body.status).toBe("success");
  const user = body.data?.find((candidate) => candidate.username === username);
  expect(user, `Find only the disposable user ${username}`).toBeTruthy();
  return user as AppUser;
}

test("admin projection and action-version changes persist to live and fresh editor clients", async ({
  browser,
  baseURL,
  page,
  mission,
}) => {
  const database = new DB();
  const username = `Config editor ${randomUUID()}`;
  let editor: BrowserContext | undefined;
  await mission.change((doc) => {
    doc.actionDefinitions = { verbs: {}, nouns: {}, adjectives: {} };
  });
  const original = await mission.read();

  try {
    await database.executeQuery(
      "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,false,$3,$4,$4)",
      [
        username,
        await bcrypt.hash(rolePassword, 4),
        JSON.stringify([{ missionId: mission.id, permissions: { view: true, edit: true } }]),
        new Date().toISOString(),
      ]
    );
    editor = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const login = await logIn(editor, username);
    expect(login.data).toMatchObject({ isAdmin: false, isSuperAdmin: false });
    const editorPage = await editor.newPage();
    const editorErrors: string[] = [];
    editorPage.on("pageerror", (error) => editorErrors.push(error.message));
    await installMapObserver(editorPage);
    await editorPage.goto(mission.url);
    await expect(editorPage.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      original.name
    );
    await expect(editorPage.getByLabel("stmViewer Section", { exact: true })).toHaveCount(1);
    await expect(editorPage.getByLabel("stmRules Section", { exact: true })).toHaveCount(0);
    const editorMapProjection = async () =>
      editorPage.evaluate(() =>
        window.__aegisMaps
          ?.find((entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected)
          ?.map.getView()
          .getProjection()
          .getCode()
      );
    const editorMapSnapshot = async () =>
      editorPage.evaluate(() => {
        const maps = window.__aegisMaps ?? [];
        const entry = maps.find(
          (candidate) =>
            candidate.mode === "editor" && candidate.map.getTargetElement()?.isConnected
        );
        return entry
          ? {
              projection: entry.map.getView().getProjection().getCode(),
              center: entry.map.getView().getCenter(),
              zoom: entry.map.getView().getZoom(),
              observedMapCount: maps.length,
            }
          : null;
      });
    const stationFeature = async () =>
      (await readMapFeatures(editorPage)).find((feature) => feature.id === mission.ids.stationA);
    await expect.poll(editorMapProjection).toBe("EPSG:3857");
    await expect.poll(stationFeature).toMatchObject({
      geometryType: "Point",
      coordinates: [expect.closeTo(111.31949, 4), expect.closeTo(111.31949, 4)],
    });
    await editorPage.evaluate(() => {
      const map = window.__aegisMaps?.find(
        (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
      )?.map;
      map?.getView().setCenter([400, 500]);
      map?.getView().setZoom(8);
    });
    const viewBeforeLocationEdit = await editorMapSnapshot();
    await mission.change((doc) => {
      doc.landerLocation = { lat: 0.005, lng: 0.006 };
      doc.initialZoom = 6;
    });
    await expect.poll(editorMapSnapshot).toEqual(viewBeforeLocationEdit);

    await editorPage.goto(`/admin/mission/${mission.id}/${mission.docUrl}`);
    await expect(editorPage).toHaveURL(new URL("/", baseURL).toString());
    await expect(editorPage.getByLabel("Action System Version", { exact: true })).toHaveCount(0);
    await editorPage.goto(mission.url);
    await expect(editorPage.getByLabel("stmViewer Section", { exact: true })).toHaveCount(1);
    await expect(editorPage.getByLabel("stmRules Section", { exact: true })).toHaveCount(0);
    await expect(editorPage.getByLabel("reports Section", { exact: true })).toHaveCount(0);

    await page.goto(`/admin/mission/${mission.id}/${mission.docUrl}`);
    await expect(page.getByRole("heading", { name: "Edit Mission", exact: true })).toBeVisible();
    await page.getByLabel("Action System Version", { exact: true }).fill("2");
    await page.getByLabel("Custom: EPSG (or similar code)", { exact: true }).fill("EPSG:4326");
    await page
      .getByLabel("Custom: Proj4 v2.3.14 String", { exact: true })
      .fill("+proj=longlat +datum=WGS84 +no_defs +type=crs");
    await page.getByLabel("Bounds MinX", { exact: true }).fill("-180");
    await page.getByLabel("Bounds MinY", { exact: true }).fill("-90");
    await page.getByLabel("Bounds MaxX", { exact: true }).fill("180");
    await page.getByLabel("Bounds MaxY", { exact: true }).fill("90");
    await page.getByLabel("Units per Pixel", { exact: true }).fill("0.1");
    await page.getByLabel("Using Custom Projection", { exact: true }).check();
    await expect
      .poll(async () => {
        const doc = await mission.read();
        return {
          actionSystemVersion: doc.actionSystemVersion,
          projEpsg: doc.projEpsg,
          projIsCustom: doc.projIsCustom,
          projProj4String: doc.projProj4String,
          projBoundsMinX: doc.projBoundsMinX,
          projBoundsMinY: doc.projBoundsMinY,
          projBoundsMaxX: doc.projBoundsMaxX,
          projBoundsMaxY: doc.projBoundsMaxY,
          projResUnitsPerPixel: doc.projResUnitsPerPixel,
        };
      })
      .toEqual({
        actionSystemVersion: 2,
        projEpsg: "EPSG:4326",
        projIsCustom: true,
        projProj4String: "+proj=longlat +datum=WGS84 +no_defs +type=crs",
        projBoundsMinX: -180,
        projBoundsMinY: -90,
        projBoundsMaxX: 180,
        projBoundsMaxY: 90,
        projResUnitsPerPixel: 0.1,
      });

    const normalEditorAdminFields = await editor.request.post("/api/v1/missionAutomerge/fields", {
      data: {
        missionId: mission.id,
        fields: { actionSystemVersion: 1, projEpsg: "EPSG:4326" },
      },
    });
    const fieldsAfterNormalEditorAttempt = await mission.read();
    expect(
      normalEditorAdminFields.status(),
      `Authoritative config after editor attempt: ${JSON.stringify({
        actionSystemVersion: fieldsAfterNormalEditorAttempt.actionSystemVersion,
        projEpsg: fieldsAfterNormalEditorAttempt.projEpsg,
      })}`
    ).toBe(401);
    expect(await normalEditorAdminFields.json()).toMatchObject({
      status: "failure",
      message: "Unauthorized",
    });
    await expect.poll(async () => (await mission.read()).actionSystemVersion).toBe(2);
    await expect.poll(async () => (await mission.read()).projEpsg).toBe("EPSG:4326");

    await expect(editorPage.getByLabel("stmViewer Section", { exact: true })).toHaveCount(0);
    expect(editorErrors, "Changing action-system settings must not crash the live editor").toEqual(
      []
    );
    await expect(editorPage.getByLabel("stmRules Section", { exact: true })).toHaveCount(1);
    await expect(editorPage.getByLabel("reports Section", { exact: true })).toHaveCount(1);
    await expect(editorPage.locator(".ol-viewport")).toHaveCount(1);
    await expect.poll(editorMapProjection).toBe("EPSG:4326");
    await expect.poll(stationFeature).toMatchObject({
      geometryType: "Point",
      coordinates: [expect.closeTo(0.001, 8), expect.closeTo(0.001, 8)],
    });
    await expect.poll(editorMapSnapshot).toMatchObject({ center: [0.006, 0.005], zoom: 6 });
    await editorPage.reload();
    await expect(editorPage.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      original.name
    );
    await expect(editorPage.getByLabel("stmViewer Section", { exact: true })).toHaveCount(0);
    await expect(editorPage.getByLabel("stmRules Section", { exact: true })).toHaveCount(1);
    await expect(editorPage.getByLabel("reports Section", { exact: true })).toHaveCount(1);
    await expect(editorPage.locator(".ol-viewport")).toHaveCount(1);
    await expect.poll(editorMapProjection).toBe("EPSG:4326");
    await expect.poll(stationFeature).toMatchObject({
      geometryType: "Point",
      coordinates: [expect.closeTo(0.001, 8), expect.closeTo(0.001, 8)],
    });
    await expect.poll(editorMapSnapshot).toMatchObject({ center: [0.006, 0.005], zoom: 6 });
    expect(editorErrors).toEqual([]);
  } finally {
    await editor?.close();
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
  }
});

test("super-admin grant changes deny HTTP access and capture existing Automerge writes", async ({
  browser,
  baseURL,
  page,
  request,
  mission,
}, testInfo) => {
  const database = new DB();
  const username = `Permission target ${randomUUID().slice(0, 8)}`;
  let viewer: BrowserContext | undefined;
  let editorAdmin: BrowserContext | undefined;
  let revoked: BrowserContext | undefined;
  let targetId: number | undefined;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let markDocListingRequested: () => void = () => {};
  let releaseDocListing: () => void = () => {};
  const docListingRequested = new Promise<void>((resolve) => {
    markDocListingRequested = resolve;
  });
  const docListingGate = new Promise<void>((resolve) => {
    releaseDocListing = resolve;
  });

  try {
    const docListingResponse = await request.get("/api/v1/docListing");
    expect(docListingResponse.ok()).toBe(true);
    const docListingBody = (await docListingResponse.json()) as WrappedResponse<
      AutomergeDocListing[]
    >;
    expect(docListingBody.status).toBe("success");
    const missionListing = docListingBody.data?.find((entry) => entry.missionId === mission.id);
    expect(missionListing).toMatchObject({ missionId: mission.id, automergeUrl: mission.docUrl });

    await page.route("**/api/v1/docListing", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      markDocListingRequested();
      await docListingGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...docListingBody, data: [missionListing] }),
      });
    });

    await page.goto("/admin/user");
    await expect(page.getByRole("heading", { name: "User Management", exact: true })).toBeVisible();
    await docListingRequested;
    const addUserButton = page.getByRole("button", { name: "+ Add User", exact: true });
    await expect(addUserButton).toBeDisabled();
    releaseDocListing();
    await expect(addUserButton).toBeEnabled();
    await addUserButton.click();
    const createModal = page
      .getByRole("heading", { name: "Create User", exact: true })
      .locator("../..");
    const missionRow = createModal.locator("tbody tr").filter({ hasText: mission.name });
    await expect(missionRow).toHaveCount(1, { timeout: 60000 });
    await createModal.getByLabel("Username", { exact: true }).fill(username);
    await createModal.getByLabel("Password", { exact: true }).fill(rolePassword);
    const initialViewGrant = missionRow.getByRole("checkbox").nth(0);
    try {
      await initialViewGrant.check();
    } catch (error) {
      const checkboxState = await initialViewGrant.evaluate((input) => {
        const checkbox = input as HTMLInputElement;
        type Fiber = {
          type?: { name?: string } | string;
          memoizedState?: { memoizedState: unknown; next: Fiber["memoizedState"] } | null;
          return?: Fiber | null;
        };
        const properties = checkbox as unknown as Record<string, unknown>;
        const fiberKey = Object.keys(checkbox).find((key) => key.startsWith("__reactFiber$"));
        let fiber = fiberKey ? (properties[fiberKey] as Fiber | undefined) : undefined;
        while (fiber) {
          const typeName = typeof fiber.type === "function" ? fiber.type.name : fiber.type;
          if (typeName === "User") break;
          fiber = fiber.return ?? undefined;
        }
        const hooks: unknown[] = [];
        for (let hook = fiber?.memoizedState; hook; hook = hook.next) {
          hooks.push(hook.memoizedState);
        }
        const userState = hooks.find(
          (value): value is { id?: number; username?: string; permissionList?: Permission[] } =>
            typeof value === "object" &&
            value !== null &&
            "username" in value &&
            "permissionList" in value
        );
        return {
          checked: checkbox.checked,
          disabled: checkbox.disabled,
          reactCheckedProp: Object.keys(checkbox)
            .filter((key) => key.startsWith("__reactProps$"))
            .map((key) => (properties[key] as { checked?: boolean }).checked)[0],
          userId: userState?.id,
          userName: userState?.username,
          permissionList: userState?.permissionList?.map((permission) => ({
            missionId: permission.missionId,
            view: permission.permissions.view,
            edit: permission.permissions.edit,
          })),
        };
      });
      await testInfo.attach("create-user-view-grant-failure", {
        body: JSON.stringify(
          {
            expectedMissionId: mission.id,
            displayedMissionName: await missionRow.innerText(),
            checkboxState,
            pageErrors,
          },
          null,
          2
        ),
        contentType: "application/json",
      });
      throw error;
    }
    await createModal.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText("User created successfully", { exact: true })).toBeVisible();
    const createdUser = await readUserByName(request, username);
    targetId = createdUser.id;
    expect(createdUser).toMatchObject({ isAdmin: false, isSuperAdmin: false });
    expect(createdUser.permissionList).toEqual([
      { missionId: mission.id, permissions: { view: true, edit: false } },
    ]);
    await page.getByTitle("Close").click();

    viewer = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const viewerLogin = await logIn(viewer, username);
    expect(viewerLogin.data).toMatchObject({
      isAdmin: false,
      isSuperAdmin: false,
      permissionList: [{ missionId: mission.id, permissions: { view: true, edit: false } }],
    });
    const viewerPage = await viewer.newPage();
    await viewerPage.goto(mission.url);
    await expect(viewerPage.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      mission.name
    );
    const viewerWrite = await viewer.request.post("/api/v1/missionAutomerge/fields", {
      data: { missionId: mission.id, fields: { description: "viewer must not edit" } },
    });
    expect(viewerWrite.status()).toBe(401);

    const userRow = page.locator("tbody tr").filter({ hasText: username });
    await expect(userRow).toHaveCount(1);
    await userRow.getByRole("button", { name: "Edit", exact: true }).click();
    let editModal = page.getByRole("heading", { name: "Edit User", exact: true }).locator("../..");
    let accessRow = editModal.locator("tbody tr").filter({ hasText: mission.name });
    await expect(accessRow.getByRole("checkbox").nth(0)).toBeChecked();
    await expect(accessRow.getByRole("checkbox").nth(1)).not.toBeChecked();
    await editModal.getByRole("checkbox").first().check();
    await accessRow.getByRole("checkbox").nth(1).check();
    await editModal.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("User updated successfully", { exact: true })).toBeVisible();
    const promotedUser = await readUserByName(request, username);
    expect(promotedUser).toMatchObject({ isAdmin: true, isSuperAdmin: false });
    expect(promotedUser.permissionList).toEqual([
      { missionId: mission.id, permissions: { view: true, edit: true } },
    ]);
    await page.getByTitle("Close").click();

    editorAdmin = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const editorAdminLogin = await logIn(editorAdmin, username);
    expect(editorAdminLogin.data).toMatchObject({ isAdmin: true, isSuperAdmin: false });
    const editorAdminPage = await editorAdmin.newPage();
    await editorAdminPage.goto(mission.url);
    await expect(editorAdminPage.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      mission.name
    );
    const adminOnlyUsers = await editorAdmin.request.get("/api/v1/appUsers");
    expect(adminOnlyUsers.status()).toBe(401);
    expect(await adminOnlyUsers.json()).toMatchObject({
      status: "failure",
      message: "Unauthorized",
    });
    const attemptedElevation = await editorAdmin.request.post("/api/v1/appUsers", {
      data: {
        users: [
          {
            ...promotedUser,
            isAdmin: true,
            isSuperAdmin: true,
            permissionList: null,
          },
        ],
      },
    });
    expect(attemptedElevation.status()).toBe(401);
    expect(await attemptedElevation.json()).toMatchObject({
      status: "failure",
      message: "Unauthorized",
    });
    const stillAdminOnly = await readUserByName(request, username);
    expect(stillAdminOnly).toMatchObject({ isAdmin: true, isSuperAdmin: false });

    const editorUpdate = await editorAdmin.request.post("/api/v1/missionAutomerge/fields", {
      data: {
        missionId: mission.id,
        fields: { description: `Editor write ${randomUUID()}` },
      },
    });
    expect(editorUpdate.ok()).toBe(true);
    expect(((await editorUpdate.json()) as WrappedResponse<Mission>).status).toBe("success");
    expect((await mission.read()).description).toContain("Editor write");

    const editableUserRow = page.locator("tbody tr").filter({ hasText: username });
    await editableUserRow.getByRole("button", { name: "Edit", exact: true }).click();
    editModal = page.getByRole("heading", { name: "Edit User", exact: true }).locator("../..");
    accessRow = editModal.locator("tbody tr").filter({ hasText: mission.name });
    await editModal.getByRole("checkbox").first().uncheck();
    await accessRow.getByRole("checkbox").nth(1).uncheck();
    await accessRow.getByRole("checkbox").nth(0).uncheck();
    await editModal.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("User updated successfully", { exact: true })).toBeVisible();
    const revokedUser = await readUserByName(request, username);
    expect(revokedUser).toMatchObject({ isAdmin: false, isSuperAdmin: false, permissionList: [] });
    await expect(editorAdminPage.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      mission.name
    );
    const onlineEditorRead = await editorAdmin.request.get(`/api/v1/all?missionId=${mission.id}`);
    expect(onlineEditorRead.status()).toBe(401);
    const onlineEditorWrite = await editorAdmin.request.post("/api/v1/missionAutomerge/fields", {
      data: {
        missionId: mission.id,
        fields: { description: "revoked online editor write" },
      },
    });
    expect(onlineEditorWrite.status()).toBe(401);
    expect((await mission.read()).description).toContain("Editor write");
    const descriptionBeforeRevokedUiWrite = (await mission.read()).description;
    const revokedUiDescription = `Revoked UI write ${randomUUID()}`;
    await enablePlanningEditMode(editorAdminPage);
    await openPlanningSection(editorAdminPage, "mission");
    await editorAdminPage.getByLabel("prefs_panel", { exact: true }).click();
    const descriptionDialog = await openPlanningField(editorAdminPage, "Mission Description");
    await descriptionDialog
      .getByLabel("Mission Description", { exact: true })
      .fill(revokedUiDescription);
    await descriptionDialog.getByText("Save", { exact: true }).click();
    await expect(editorAdminPage.locator('div[aria-label="Mission Description"]')).toHaveText(
      revokedUiDescription
    );
    await editorAdminPage.waitForTimeout(1000);
    const descriptionAfterRevokedUiWrite = (await mission.read()).description;
    await testInfo.attach("revoked-online-ui-write", {
      body: JSON.stringify(
        {
          before: descriptionBeforeRevokedUiWrite,
          attempted: revokedUiDescription,
          authoritativeAfter: descriptionAfterRevokedUiWrite,
        },
        null,
        2
      ),
      contentType: "application/json",
    });
    expect(descriptionBeforeRevokedUiWrite).toContain("Editor write");
    await page.getByTitle("Close").click();

    revoked = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const revokedLogin = await logIn(revoked, username);
    expect(revokedLogin.data).toMatchObject({
      isAdmin: false,
      isSuperAdmin: false,
      permissionList: [],
    });
    expect((await revoked.request.get("/api/v1/missionHomepageItems")).status()).toBe(401);
    expect((await revoked.request.get(`/api/v1/all?missionId=${mission.id}`)).status()).toBe(401);
    expect(
      (
        await revoked.request.post("/api/v1/missionAutomerge/fields", {
          data: { missionId: mission.id, fields: { description: "revoked edit" } },
        })
      ).status()
    ).toBe(401);

    const revokedPage = await revoked.newPage();
    await revokedPage.goto(`/admin/user`);
    await expect(revokedPage).toHaveURL(new URL("/", baseURL).toString());
  } finally {
    releaseDocListing();
    await Promise.all([revoked?.close(), editorAdmin?.close(), viewer?.close()]);
    if (targetId !== undefined) {
      const deleted = await request.delete("/api/v1/appUsers", { data: { userIds: [targetId] } });
      expect(deleted.ok(), `Delete only the disposable permission user ${targetId}`).toBe(true);
    }
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
  }
});
