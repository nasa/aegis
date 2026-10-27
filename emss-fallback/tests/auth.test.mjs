import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getUserFromJWT } from "../packages/oauth2-proxy-backend/index.js";
import {
  createFetchWithAuthFunctions,
  webAuthPopup,
} from "../packages/oauth2-proxy-frontend/index.js";

const claims = {
  iss: "https://example.test/identity/realms/aegis",
  exp: Math.floor(Date.now() / 1000) + 300,
  nasa_employeenumber: "immutable-user-id",
  nasa_auid: "alice",
  nasa_displayname: "Alice",
  nasa_email: "alice@example.test",
  nasa_givenname: "Alice",
  nasa_surname: "Example",
  nasa_role: ["AEGIS-Superuser"],
};
const request = (payload) => ({
  headers: {
    "x-access-token": `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`,
    "x-real-ip": "192.0.2.1",
  },
});
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
});

test("maps Launchpad claims and keeps identity stable across username changes", () => {
  const user = getUserFromJWT(request(claims));
  assert.equal(user.uupic, `oidc:${claims.iss}:immutable-user-id`);
  assert.equal(user.auid, "alice");
  assert.deepEqual(user.roles, ["AEGIS-Superuser"]);
  assert.equal(user.uscitizen, false);
  assert.equal(user.ip_address, "192.0.2.1");
  assert.equal(getUserFromJWT(request({ ...claims, nasa_auid: "renamed" })).uupic, user.uupic);
  assert.notEqual(getUserFromJWT(request({ ...claims, iss: "other-issuer" })).uupic, user.uupic);
  assert.equal(
    getUserFromJWT(request({ ...claims, nasa_role: "AEGIS-Editor" })).roles,
    "AEGIS-Editor"
  );
});

test("rejects missing, duplicate, malformed, expired and incomplete identities", () => {
  assert.match(getUserFromJWT({ headers: {} }).message, /not found/);
  assert.ok(getUserFromJWT({ headers: { "x-access-token": ["a", "b"] } }) instanceof Error);
  assert.ok(getUserFromJWT({ headers: { "x-access-token": "bad" } }) instanceof Error);
  for (const overrides of [
    { exp: 0 },
    { exp: undefined },
    { nasa_employeenumber: "" },
    { nasa_auid: null },
    { nasa_displayname: {} },
    { nasa_role: ["AEGIS-Superuser", {}] },
  ]) {
    assert.ok(getUserFromJWT(request({ ...claims, ...overrides })) instanceof Error);
  }
});

test("preserves Launchpad citizenship value semantics", () => {
  const user = getUserFromJWT(
    request({
      ...claims,
      nasa_uscitizen: "us_citizen",
      nasa_uslpr: "us_lpr",
      nasa_usperson: "us_person",
    })
  );
  assert.equal(user.uscitizen, true);
  assert.equal(user.legal_permanent_resident, true);
  assert.equal(user.usperson, true);
});

test("redirect failure retries a Request body after a single shared login", async () => {
  let calls = 0;
  let logins = 0;
  const bodies = [];
  globalThis.fetch = async (input, options) => {
    assert.equal(options.redirect, "error");
    bodies.push(await input.text());
    if (++calls <= 2) throw new TypeError("Redirect blocked");
    return Response.json({ ok: true });
  };
  const { fetchWithAuth } = createFetchWithAuthFunctions(
    async (urls) => {
      logins++;
      assert.equal(urls.loginURL, "/login");
      await new Promise((resolve) => setTimeout(resolve, 10));
    },
    "/login",
    "/oauth2/userinfo"
  );
  await Promise.all(
    [1, 2].map(() =>
      fetchWithAuth(
        new Request("https://example.test/api", {
          method: "POST",
          body: "payload",
        })
      )
    )
  );
  assert.equal(logins, 1);
  assert.deepEqual(bodies, ["payload", "payload", "payload", "payload"]);
});

test("401 retries once; permission denials and server errors retain their response", async () => {
  let logins = 0;
  let status = 401;
  globalThis.fetch = async () => new Response("{}", { status });
  const { fetchWithAuth, fetchJsonWithAuth } = createFetchWithAuthFunctions(
    async () => {
      logins++;
    },
    "/login",
    "/oauth2/userinfo"
  );
  assert.equal((await fetchWithAuth("/api")).status, 401);
  assert.equal(logins, 1);
  for (status of [403, 500]) {
    assert.deepEqual(await fetchJsonWithAuth("/api"), {});
  }
  assert.equal(logins, 1);
});

test("an application's 401 permission denial does not open login for a valid session", async () => {
  globalThis.fetch = async (input) =>
    input === "/oauth2/userinfo"
      ? Response.json({ email: "alice@example.test" })
      : new Response("Unauthorized", { status: 401 });
  const { fetchWithAuth } = createFetchWithAuthFunctions(
    () => {
      throw new Error("Unexpected login");
    },
    "/login",
    "/oauth2/userinfo"
  );
  assert.equal((await fetchWithAuth("/api")).status, 401);
});

test("aborted fetches do not open login; JSON helper returns transport errors", async () => {
  let logins = 0;
  globalThis.fetch = async () => {
    throw new DOMException("Aborted", "AbortError");
  };
  const { fetchJsonWithAuth } = createFetchWithAuthFunctions(async () => {
    logins++;
  });
  assert.ok((await fetchJsonWithAuth("/api")) instanceof Error);
  assert.equal(logins, 0);
});

test("popup polls userinfo and closes on success, timeout, cancellation or failure", async () => {
  let closed = false;
  const popup = {
    get closed() {
      return closed;
    },
    close() {
      closed = true;
    },
  };
  globalThis.window = { open: () => popup };
  globalThis.fetch = async () => Response.json({ email: "alice@example.test" });
  await webAuthPopup({ loginURL: "/login", userInfoURL: "/userinfo", period: 1 });
  assert.equal(closed, true);
  closed = false;
  globalThis.fetch = async () => new Response("", { status: 401 });
  await assert.rejects(webAuthPopup({ retry: 1, period: 1 }), /Timed out/);
  assert.equal(closed, true);
  await assert.rejects(webAuthPopup({}), /closed/);
  globalThis.window = { open: () => null };
  await assert.rejects(webAuthPopup({}), /Unable to open/);
});
