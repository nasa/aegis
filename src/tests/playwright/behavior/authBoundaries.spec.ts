import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { BrowserContext } from "@playwright/test";
import { Repo, type AutomergeUrl } from "@automerge/automerge-repo";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";
import { authenticatedAutomergeAdapter } from "../fixtures/authenticatedAutomerge";
import {
  expectDocumentOperationDenied,
  expectAutomergeUpgradeDenied,
} from "../fixtures/automergeAuthorizationProbe";
import {
  enablePlanningEditMode,
  planningField,
  savePlanningField,
  selectPlanningEva,
  selectPlanningStation,
} from "./planningHelpers";
import { openExecutionInfo } from "./executionHelpers";

const password = "auth-boundary-playwright-password";

async function createRoleUser(
  database: DB,
  username: string,
  role: "viewer" | "editor" | "admin" | "superAdmin",
  missionId: number
): Promise<void> {
  const grants =
    role !== "superAdmin"
      ? [{ missionId, permissions: { view: true, edit: role !== "viewer" } }]
      : [];
  await database.executeQuery(
    "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)",
    [
      username,
      await bcrypt.hash(password, 4),
      role === "superAdmin",
      role === "admin",
      JSON.stringify(grants),
      new Date().toISOString(),
    ]
  );
}

async function login(context: BrowserContext, username: string): Promise<void> {
  const response = await context.request.post("/api/v1/auth/login", {
    data: { username, password },
  });
  expect(response.ok()).toBe(true);
  expect(((await response.json()) as WrappedResponse<AppUser>).status).toBe("success");
}

test.use({ scenario: "execution" });

test("Automerge upgrades reject anonymous and deleted-user sessions with a current epoch", async ({
  browser,
  baseURL,
  mission,
}) => {
  const database = new DB();
  const username = `Deleted socket user ${randomUUID()}`;
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    await expectAutomergeUpgradeDenied(context.request, baseURL);
    await createRoleUser(database, username, "editor", mission.id);
    await login(context, username);
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
    await expectAutomergeUpgradeDenied(context.request, baseURL);
  } finally {
    await context.close();
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
  }
});

test("viewer can read fields, geometry and execution but UI and raw writes leave the mission unchanged", async ({
  browser,
  baseURL,
  mission,
}) => {
  const database = new DB();
  const username = `Read only ${randomUUID()}`;
  let viewer: BrowserContext | undefined;
  let repo: Repo | undefined;
  await createRoleUser(database, username, "viewer", mission.id);

  try {
    viewer = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    await login(viewer, username);
    const page = await viewer.newPage();
    await page.goto(mission.url);
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
    await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("station Section", { exact: true })).toHaveCount(1);

    const before = await mission.read();
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();
    await planningField(page, "Station").locator("..").click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.getByLabel("addStation", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("deleteStation", { exact: true })).toHaveCount(0);
    await selectPlanningEva(page, "Survey Alpha");
    await page
      .getByLabel("evaList-item")
      .filter({ hasText: "Survey Alpha" })
      .getByText("Alpha to Bravo", { exact: true })
      .click();
    await expect(page.getByLabel("Edit Path on Map", { exact: true })).toHaveCount(0);
    for (const [plan, eva] of [
      ["Survey Alpha", mission.ids.rexEvaA],
      ["Survey Bravo", mission.ids.rexEvaB],
    ]) {
      await openExecutionInfo(page, plan, eva);
      for (const label of [
        "Execute EVA",
        "Stop Execution",
        "Start PET timer",
        "Pause PET timer",
        "Reset PET timer",
      ]) {
        await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
      }
      await planningField(page, "PET Timer").locator("..").click();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
    }
    const write = await viewer.request.post("/api/v1/missionAutomerge/fields", {
      data: { missionId: mission.id, fields: { description: "unauthorized viewer edit" } },
    });
    expect(write.status()).toBe(401);
    expect(await write.json()).toMatchObject({ status: "failure", message: "Unauthorized" });
    await expectDocumentOperationDenied(viewer.request, baseURL, mission.docUrl, true);
    const version: AppVersion = await (await viewer.request.get("/api/v1/version")).json();
    const socketUrl = new URL("/api/automergeSocket/", baseURL);
    socketUrl.protocol = "ws:";
    socketUrl.searchParams.set("serverEpochUuid", version.serverEpochUuid);
    const adapter = await authenticatedAutomergeAdapter(viewer.request, socketUrl.toString());
    repo = new Repo({ network: [adapter] });
    const handle = await repo.find<Mission>(mission.docUrl as AutomergeUrl, {
      signal: AbortSignal.timeout(10000),
    });
    expect(handle.doc().name).toBe(mission.name);
    const rejected = new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Viewer sync write was not rejected")),
        10000
      );
      adapter.socket.once("close", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });
    handle.change((doc) => {
      doc.description = "viewer attempted real sync";
    });
    expect(await rejected).toBe(1008);
    expect(await mission.read()).toEqual(before);
  } finally {
    await repo?.shutdown();
    await viewer?.close();
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
  }
});

test("editor access stays on mission A across direct URLs, REST reads and writes, and known-document sockets", async ({
  browser,
  baseURL,
  request,
  mission,
}) => {
  const database = new DB();
  const username = `Scoped editor ${randomUUID()}`;
  await createRoleUser(database, username, "editor", mission.id);
  const created = await request.post("/api/v1/missionAutomerge", { data: {} });
  expect(created.status()).toBe(200);
  const target = ((await created.json()) as WrappedResponse<AutomergeDocListing>).data;
  let editor: BrowserContext | undefined;
  try {
    const before = (
      await (await request.get(`/api/v1/missionDump?missionId=${target.missionId}`)).json()
    ).data.missionData.mission;
    editor = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    await login(editor, username);
    const page = await editor.newPage();
    await page.goto(`/mission/${target.missionId}`);
    await expect(page).toHaveURL(new URL("/", baseURL).toString());
    await page.goto(`/dashboard/${target.missionId}`);
    await expect(page).toHaveURL(new URL("/", baseURL).toString());
    for (const path of [
      `all?missionId=${target.missionId}`,
      `docListing?missionId=${target.missionId}`,
    ]) {
      const response = await editor.request.get(`/api/v1/${path}`);
      expect(response.status()).toBe(401);
      expect(await response.json()).toMatchObject({ status: "failure", message: "Unauthorized" });
    }
    for (const [method, path, data] of [
      [
        "POST",
        "missionAutomerge/fields",
        { missionId: target.missionId, fields: { description: "cross mission" } },
      ],
      ["DELETE", "missionAutomerge", { missionIds: [target.missionId] }],
    ] as const) {
      const response = await editor.request.fetch(`/api/v1/${path}`, { method, data });
      expect(response.status()).toBe(401);
      expect(await response.json()).toMatchObject({ status: "failure", message: "Unauthorized" });
    }
    await expectDocumentOperationDenied(editor.request, baseURL, target.automergeUrl, false);
    await expectDocumentOperationDenied(editor.request, baseURL, target.automergeUrl, true);
    expect(
      (await (await request.get(`/api/v1/missionDump?missionId=${target.missionId}`)).json()).data
        .missionData.mission
    ).toEqual(before);
    await page.goto(mission.url);
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();
    await savePlanningField(page, "Station", "Editor authorized mission A");
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
      .toBe("Editor authorized mission A");
    await page.reload();
    await selectPlanningStation(page, "Editor authorized mission A");
    expect((await mission.read()).id).toBe(mission.id);
  } finally {
    await editor?.close();
    const deleted = await request.delete("/api/v1/missionAutomerge", {
      data: { missionIds: [target.missionId] },
    });
    expect(deleted.ok()).toBe(true);
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
  }
});

test("declared admin routes and field policies separate editor, admin, and super-admin", async ({
  browser,
  baseURL,
  request,
  mission,
}) => {
  const database = new DB();
  const suffix = randomUUID();
  const users = {
    viewer: `Policy viewer ${suffix}`,
    editor: `Policy editor ${suffix}`,
    admin: `Policy admin ${suffix}`,
    superAdmin: `Policy super ${suffix}`,
  };
  const contexts: BrowserContext[] = [];
  const createdUsers: string[] = [];
  const adminRoutes = [
    ["/admin", "AEGIS"],
    ["/admin/missions", "Missions"],
    [`/admin/mission/${mission.id}/${mission.docUrl}`, "Edit Mission"],
    [`/admin/mission_layers/${mission.id}`, "Mission Layers"],
    [`/admin/mission_stm/${mission.id}`, "Mission STM"],
    [`/admin/export/${mission.id}`, "Export Mission"],
    [`/admin/automerge/${mission.docUrl}`, "Manage Automerge Data"],
  ] as const;
  const superRoutes = [
    [`/admin/mission_duplicate/${mission.id}`, "Duplicate Mission"],
    ["/admin/user", "User Management"],
    ["/admin/serverSocketStatus", "Visitor Connections"],
    ["/admin/maestroV2", "Maegistro v2 Monitor"],
    ["/admin/dustV1", "DUST Monitor"],
    ["/admin/environmentConfig", "Environment Configuration"],
    ["/admin/emss", "EMSS"],
  ] as const;
  // These handlers declare a super-admin session policy independently of mission grants.
  const superApi = [
    ["GET", "/appUsers"],
    ["POST", "/appUsers", { users: [] }],
    ["DELETE", "/appUsers", { userIds: [] }],
    ["GET", "/environmentConfig"],
    ["GET", "/environmentConfig/not-a-config-key"],
    ["POST", "/environmentConfig/not-a-config-key", { value: false }],
    ["GET", "/emss/enableEmssApi"],
    ["POST", "/emss/enableEmssApi", { enable: "invalid" }],
    ["GET", "/socket/serverSocketStatus"],
    ["GET", `/missionDump?missionId=${mission.id}`],
    ["POST", "/missionDup", {}],
  ] as const;

  try {
    for (const role of Object.keys(users) as Array<keyof typeof users>) {
      await createRoleUser(database, users[role], role, mission.id);
      createdUsers.push(users[role]);
      const context = await browser.newContext({
        baseURL,
        storageState: { cookies: [], origins: [] },
      });
      contexts.push(context);
      await login(context, users[role]);
    }
    const [viewer, editor, admin, superAdmin] = contexts;

    const filePath = `missionFiles/${mission.id}`;
    const query = new URLSearchParams({ missionId: String(mission.id), path: filePath });
    for (const context of [viewer, editor]) {
      for (const [method, route] of [
        ["GET", "list"],
        ["POST", "upload"],
        ["GET", "rename"],
        ["DELETE", "delete"],
      ]) {
        const denied = await context.request.fetch(`/api/v1/file/${route}?${query}`, { method });
        expect(denied.status(), `file ${route} needs admin role plus mission grant`).toBe(401);
        expect(await denied.json()).toMatchObject({ status: "failure", message: "Unauthorized" });
      }
    }
    const uploaded = await admin.request.post(`/api/v1/file/upload?${query}`, {
      multipart: {
        path: filePath,
        uploadFile: {
          name: "admin-policy.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("admin file policy"),
        },
      },
    });
    expect(uploaded.status()).toBe(201);
    expect(await uploaded.json()).toBe("File received");
    const files = await admin.request.get(`/api/v1/file/list?${query}`);
    expect(files.status()).toBe(200);
    expect((await files.json()).data).toContainEqual(
      expect.objectContaining({ name: "admin-policy.txt", size: 17, isDir: false })
    );
    const renamed = await admin.request.get(
      `/api/v1/file/rename?${query}&oldname=admin-policy.txt&newname=renamed-policy.txt`
    );
    expect(renamed.status()).toBe(200);
    expect(await renamed.json()).toBe("Success");
    const deletedFile = await admin.request.delete(
      `/api/v1/file/delete?missionId=${mission.id}&path=${filePath}/renamed-policy.txt`
    );
    expect(deletedFile.status()).toBe(200);
    expect(await deletedFile.json()).toBe("Success");

    for (const [index, context] of contexts.entries()) {
      const rolePage = await context.newPage();
      for (const [route, heading] of [...adminRoutes, ...superRoutes]) {
        await rolePage.goto(route);
        const allowed =
          index === 3 || (index === 2 && adminRoutes.some(([path]) => path === route));
        if (allowed) {
          await expect(rolePage.getByRole("heading", { name: heading, exact: true })).toBeVisible();
          await expect(rolePage).toHaveURL(new URL(route, baseURL).toString());
        } else {
          await expect(rolePage).toHaveURL(new URL("/", baseURL).toString());
        }
      }
      await rolePage.close();
    }
    for (const context of [viewer, editor, admin]) {
      for (const [method, path, data] of superApi) {
        const response = await context.request.fetch(`/api/v1${path}`, { method, data });
        expect(response.status(), `${method} ${path} requires super-admin`).toBe(401);
        expect(await response.json()).toMatchObject({ status: "failure", message: "Unauthorized" });
      }
    }

    for (const roleContext of [viewer, editor]) {
      const usersRead = await roleContext.request.get("/api/v1/appUsers");
      expect(usersRead.status()).toBe(401);
      expect(await usersRead.json()).toMatchObject({ status: "failure", message: "Unauthorized" });
      const usersWrite = await roleContext.request.post("/api/v1/appUsers", {
        data: { users: [] },
      });
      expect(usersWrite.status()).toBe(401);
      const usersDelete = await roleContext.request.delete("/api/v1/appUsers", {
        data: { userIds: [] },
      });
      expect(usersDelete.status()).toBe(401);
      const configRead = await roleContext.request.get("/api/v1/environmentConfig");
      expect(configRead.status()).toBe(401);
      expect((await roleContext.request.get("/api/v1/emss/enableEmssApi")).status()).toBe(401);
      const adminMission = await roleContext.request.post("/api/v1/missionAutomerge/fields", {
        data: { missionId: mission.id, fields: { actionSystemVersion: 1 } },
      });
      expect(adminMission.status()).toBe(401);
      const rolePage = await roleContext.newPage();
      await rolePage.goto(`/admin/mission/${mission.id}/${mission.docUrl}`);
      await expect(rolePage).toHaveURL(new URL("/", baseURL).toString());
      await rolePage.close();
    }

    const adminPage = await admin.newPage();
    await adminPage.goto(`/admin/mission/${mission.id}/${mission.docUrl}`);
    await expect(
      adminPage.getByRole("heading", { name: "Edit Mission", exact: true })
    ).toBeVisible();
    await adminPage.close();

    const editorField = await editor.request.post("/api/v1/missionAutomerge/fields", {
      data: { missionId: mission.id, fields: { description: "editor allowed field" } },
    });
    expect(editorField.status()).toBe(200);
    expect(await editorField.json()).toMatchObject({ status: "success" });
    expect((await mission.read()).description).toBe("editor allowed field");

    const adminField = await admin.request.post("/api/v1/missionAutomerge/fields", {
      data: { missionId: mission.id, fields: { actionSystemVersion: 1 } },
    });
    expect(adminField.status()).toBe(200);
    expect((await mission.read()).actionSystemVersion).toBe(1);
    await database.executeQuery("UPDATE app_user_db SET permission_list='[]' WHERE username=$1", [
      users.admin,
    ]);
    const ungrantedAdmin = await admin.request.post("/api/v1/missionAutomerge/fields", {
      data: { missionId: mission.id, fields: { description: "admin without mission grant" } },
    });
    expect(ungrantedAdmin.status()).toBe(401);
    expect((await mission.read()).description).toBe("editor allowed field");
    expect((await admin.request.get("/api/v1/environmentConfig")).status()).toBe(401);
    expect((await admin.request.get("/api/v1/emss/enableEmssApi")).status()).toBe(401);
    const adminUsers = await admin.request.get("/api/v1/appUsers");
    expect(adminUsers.status()).toBe(401);

    const superUsers = await superAdmin.request.get("/api/v1/appUsers");
    expect(superUsers.status()).toBe(200);
    expect(await superUsers.json()).toMatchObject({ status: "success" });
    const superConfig = await superAdmin.request.get("/api/v1/environmentConfig/not-a-config-key");
    expect(superConfig.status()).toBe(404);
    expect(await superConfig.json()).toMatchObject({
      status: "error",
      message: "Unknown environment config key: not-a-config-key",
    });
    const invalidEmssToggle = await superAdmin.request.post("/api/v1/emss/enableEmssApi", {
      data: { enable: "yes" },
    });
    expect(invalidEmssToggle.status()).toBe(400);
    expect(await invalidEmssToggle.json()).toMatchObject({
      status: "failure",
      message: "enable must be a boolean",
    });

    const missingMission = await request.get("/api/v1/missionDump?missionId=2147483647");
    expect(missingMission.status()).toBe(404);
    expect(await missingMission.json()).toMatchObject({ status: "failure" });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    if (createdUsers.length) {
      await database.executeQuery("DELETE FROM app_user_db WHERE username = ANY($1)", [
        createdUsers,
      ]);
    }
  }
});
