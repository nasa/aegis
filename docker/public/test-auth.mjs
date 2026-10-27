import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { chromium, request } from "@playwright/test";
import { identities } from "./mock-auth/identities.mjs";

if (
  !/^aegis-public-check-\d+-[a-f0-9]{8}$/.test(process.env.PUBLIC_AUTH_TEST_PROJECT || "") ||
  !process.env.PUBLIC_TEST_ORIGIN
) {
  throw new Error("Run npm run test:public; browser fixtures must use the isolated test stack");
}
const env = {
  ...parse(readFileSync(".env.public")),
  PUBLIC_ORIGIN: process.env.PUBLIC_TEST_ORIGIN,
};
const origin = env.PUBLIC_ORIGIN || "https://localhost:8443";
const http = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
const browser = await chromium.launch({ headless: true });
const contexts = [];
let adminContext;
let missionId;
let groupId;
const prefix = `public-auth-check-${Date.now()}`;

async function choose(page, persona) {
  await page.locator(`button[value="${persona}"]`).click();
  await page.waitForURL(`${origin}/login`);
}

async function login(persona) {
  const context = await browser.newContext({ baseURL: origin, ignoreHTTPSErrors: true });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto("/login");
  assert.equal(await page.locator("button[name=persona]").count(), 3);
  assert.equal(await page.locator("input[type=password]").count(), 0);
  await choose(page, persona);
  return context;
}

async function api(context, path, method = "GET", data) {
  let response;
  try {
    response = await context.request.fetch(`/api/v1/${path}`, { method, data });
  } catch (error) {
    throw new Error(`${method} ${path}: ${error.message.split("Call log:")[0]}`);
  }
  assert.equal(response.status(), 200, `${method} ${path}: ${await response.text()}`);
  return response.json();
}

try {
  const forged = `e30.${Buffer.from(
    JSON.stringify({
      iss: `${origin}/identity`,
      exp: Math.floor(Date.now() / 1000) + 300,
      nasa_employeenumber: "forged",
      nasa_auid: `${prefix}-forged`,
      nasa_displayname: "Forged administrator",
      nasa_role: ["AEGIS-Superuser"],
    })
  ).toString("base64url")}.forged`;
  for (const path of [
    "/api/v1/user/current",
    "/api/socket/?EIO=4&transport=websocket",
    "/api/automergeSocket/",
  ]) {
    assert.equal((await http.get(path, { headers: { "X-Access-Token": forged } })).status(), 401);
  }
  assert.equal(
    (await http.get("/api/v1/metrics", { headers: { "X-Access-Token": forged } })).status(),
    401
  );
  assert.equal(
    (
      await http.get("/api/v1/metrics", {
        headers: { "X-Access-Token": forged, "x-api-key": env.PUBLIC_EMSS_TOKEN },
      })
    ).status(),
    200
  );
  console.log(
    "PASS gateway rejects forged identities and unauthenticated sockets; API keys still work"
  );

  const signedIn = {};
  for (const [persona, expected] of Object.entries(identities)) {
    const context = await login(persona);
    signedIn[persona] = context;
    const current = await api(context, "user/current");
    assert.equal(current.launchpadUser.givenname, expected.givenname);
    assert.equal(current.launchpadUser.surname, expected.surname);
    assert.equal(current.launchpadUser.auid, expected.auid);
    assert.equal(current.launchpadUser.uupic, `oidc:${origin}/identity:${expected.id}`);
    assert.deepEqual(current.launchpadUser.roles, expected.roles);
    console.log(`PASS ${persona} button signs in ${expected.givenname} ${expected.surname}`);
  }
  adminContext = signedIn.superadmin;
  const memberContext = signedIn.user;
  const guestContext = signedIn.guest;
  const member = await api(memberContext, "user/current");
  const userId = member.appUser.id;
  const userRows = (await api(adminContext, "appUsers")).data;
  assert.ok(!userRows.some((user) => user.auid === `${prefix}-forged`));
  const publicId = userRows.find((user) => user.uupic === "__public__").id;

  const appPage = adminContext.pages()[0];
  const appErrors = [];
  appPage.on("pageerror", (error) => appErrors.push(error.message));
  const currentUser = appPage.waitForResponse((response) =>
    response.url().endsWith("/api/v1/user/current")
  );
  await appPage.goto("/");
  assert.equal((await currentUser).status(), 200);
  await appPage.waitForFunction(() => document.querySelector("#root")?.children.length > 0);
  assert.deepEqual(appErrors, []);

  const homepage = await api(adminContext, "missionHomepageItems");
  assert.ok(homepage.data.length > 0, "The running demo must contain a selectable mission");
  await appPage.getByRole("button", { name: "Select", exact: true }).first().waitFor();
  await appPage.goto("/admin");
  await appPage.getByRole("heading", { name: "Mission Management", exact: true }).waitFor();
  console.log("PASS Neil sees seeded missions and can open the administration screens");

  missionId = (await api(adminContext, "missionAutomerge", "POST", {})).data.missionId;
  assert.ok(Number.isInteger(missionId));
  const grant = (subject, permLevel) =>
    api(adminContext, "missionPermission", "POST", {
      missionId,
      ...subject,
      permLevel,
      notes: prefix,
    });
  await grant({ userId: publicId }, "viewer");
  assert.equal((await api(guestContext, "user/current")).permissions[missionId], "viewer");
  assert.equal((await api(memberContext, "user/current")).permissions[missionId], "viewer");
  await grant({ userId }, "editPartial");
  assert.equal((await api(memberContext, "user/current")).permissions[missionId], "editPartial");
  groupId = (await api(adminContext, "userGroup", "POST", { name: prefix })).data.id;
  await api(adminContext, "userGroup/member", "POST", { groupId, userId, action: "add" });
  await grant({ groupId }, "edit");
  assert.equal((await api(memberContext, "user/current")).permissions[missionId], "edit");
  assert.equal((await api(guestContext, "user/current")).permissions[missionId], "viewer");
  for (const context of [memberContext, guestContext]) {
    assert.equal(
      (await context.request.post("/api/v1/userGroup", { data: { name: "denied" } })).status(),
      401
    );
  }
  console.log("PASS public viewer baseline, Buzz's direct/group grants, and admin boundaries");

  const page = memberContext.pages()[0];
  await page.goto("/loggedout");
  const epoch = (await api(memberContext, "version")).serverEpochUuid;
  for (const path of [
    "/api/socket/?EIO=4&transport=websocket",
    `/api/automergeSocket/?serverEpochUuid=${epoch}`,
  ]) {
    const opened = await page.evaluate(
      (path) =>
        new Promise((resolve) => {
          const socket = new WebSocket(`wss://${location.host}${path}`);
          socket.onopen = () => {
            socket.close();
            resolve(true);
          };
          socket.onerror = () => resolve(false);
        }),
      path
    );
    assert.equal(opened, true);
  }
  console.log("PASS authenticated Socket.IO and Automerge upgrades");

  await memberContext.clearCookies();
  const source = readFileSync("emss-fallback/packages/oauth2-proxy-frontend/index.js", "utf8");
  await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const helpers = await import(url);
    window.authFetch = helpers.createFetchWithAuthFunctions(
      helpers.webAuthPopup,
      "/login",
      "/oauth2/userinfo"
    );
    URL.revokeObjectURL(url);
  }, source);
  const popupPromise = memberContext.waitForEvent("page");
  await page.evaluate(() => {
    window.pendingAuth = window.authFetch.fetchJsonWithAuth("/api/v1/user/current");
  });
  const popup = await popupPromise;
  await choose(popup, "user");
  const retried = await page.evaluate(() => window.pendingAuth);
  assert.equal(retried.appUser.id, userId);
  assert.equal(retried.permissions[missionId], "edit");
  console.log(
    "PASS missing session opens chooser popup, retries fetch, and preserves Buzz's grants"
  );

  await page.goto("/logout");
  assert.equal((await memberContext.request.get("/api/v1/user/current")).status(), 401);
  await choose(page, "guest");
  assert.equal((await api(memberContext, "user/current")).launchpadUser.givenname, "Michael");
  assert.equal((await api(memberContext, "user/current")).permissions[missionId], "viewer");
  await page.goto("/logout");
  await choose(page, "superadmin");
  assert.equal((await api(memberContext, "user/current")).launchpadUser.givenname, "Neil");
  console.log("PASS logout and switching between guest and superadmin without credentials");
} catch (error) {
  console.error(error.message.split("Call log:")[0]);
  process.exitCode = 1;
} finally {
  // Close live app connections before removing their mission and group fixtures.
  for (const context of contexts) {
    await Promise.allSettled(context.pages().map((page) => page.close()));
  }
  const cleanupClient = adminContext
    ? await request.newContext({
        baseURL: origin,
        ignoreHTTPSErrors: true,
        storageState: await adminContext.storageState(),
      })
    : null;
  const cleanupContext = { request: cleanupClient };
  const cleanup = [];
  if (adminContext && missionId)
    cleanup.push(() =>
      api(cleanupContext, "missionAutomerge", "DELETE", { missionIds: [missionId] })
    );
  if (adminContext && groupId)
    cleanup.push(() => api(cleanupContext, "userGroup", "DELETE", { groupId }));
  for (const action of cleanup) {
    try {
      await action();
    } catch (error) {
      console.error(`Cleanup failed: ${error.message.split("Call log:")[0]}`);
      process.exitCode = 1;
    }
  }
  await cleanupClient?.dispose();
  await Promise.allSettled(contexts.map((context) => context.close()));
  await browser.close();
  await http.dispose();
}
