import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { createMockAuthServer } from "./server.mjs";
import { getUserFromJWT } from "../../../emss-fallback/packages/oauth2-proxy-backend/index.js";

test("mock chooser, fixed identities, signed sessions, renewal, logout and expiry", async () => {
  let clock = Date.now();
  const origin = "https://demo.test";
  const server = createMockAuthServer({ origin, secret: "x".repeat(43), now: () => clock });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, options) => fetch(base + path, { redirect: "manual", ...options });
  const choose = (persona, extra = {}) =>
    call("/oauth2/sign_in", {
      method: "POST",
      headers: { Origin: origin },
      body: new URLSearchParams({ persona, rd: "/login", ...extra }),
    });
  try {
    const chooser = await call("/oauth2/start?rd=%22%3E%3Cscript%3E");
    const html = await chooser.text();
    for (const name of [
      "Superadmin",
      "Neil Armstrong",
      "User",
      "Buzz Aldrin",
      "Guest",
      "Michael Collins",
    ])
      assert.ok(html.includes(name));
    assert.ok(!html.includes('<input type="password"'));
    assert.ok(chooser.headers.get("content-security-policy").includes("frame-ancestors 'none'"));
    assert.equal(
      (await call("/oauth2/auth", { headers: { "X-Access-Token": "forged" } })).status,
      401
    );
    let superadminCookie;
    for (const [persona, firstName, elevated] of [
      ["superadmin", "Neil", true],
      ["user", "Buzz", false],
      ["guest", "Michael", false],
    ]) {
      const response = await choose(persona);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("location"), "/login");
      const setCookie = response.headers.get("set-cookie");
      for (const flag of ["HttpOnly", "Secure", "SameSite=Lax"])
        assert.ok(setCookie.includes(flag));
      const cookie = setCookie.split(";")[0];
      if (elevated) superadminCookie = cookie;
      const auth = await call("/oauth2/auth", { headers: { cookie } });
      assert.equal(auth.status, 202);
      const token = auth.headers.get("x-auth-request-access-token");
      const user = getUserFromJWT({ headers: { "x-access-token": token } });
      assert.equal(user.givenname, firstName);
      assert.equal(user.roles.includes("AEGIS-Superuser"), elevated);
      if (persona === "guest") assert.deepEqual(user.roles, []);
      assert.equal(
        (await (await call("/oauth2/userinfo", { headers: { cookie } })).json()).email,
        user.email
      );
      const firstClaims = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
      clock += 301000;
      const renewed = await call("/oauth2/auth", { headers: { cookie } });
      const secondClaims = JSON.parse(
        Buffer.from(renewed.headers.get("x-auth-request-access-token").split(".")[1], "base64url")
      );
      assert.equal(secondClaims.nasa_employeenumber, firstClaims.nasa_employeenumber);
      assert.ok(secondClaims.exp > firstClaims.exp);
    }
    assert.equal((await choose("__proto__")).status, 400);
    const external = await choose("guest", { rd: "https://evil.test" });
    assert.equal(external.headers.get("location"), "/");
    const foreign = await call("/oauth2/sign_in", {
      method: "POST",
      headers: { Origin: "https://evil.test" },
      body: "persona=superadmin",
    });
    assert.equal(foreign.status, 403);
    assert.equal(
      (await call("/oauth2/auth", { headers: { cookie: superadminCookie + "x" } })).status,
      401
    );
    assert.equal(
      (
        await call("/oauth2/auth", {
          headers: { cookie: `${superadminCookie}; ${superadminCookie}` },
        })
      ).status,
      401
    );
    const logout = await call("/oauth2/sign_out");
    assert.equal(logout.status, 303);
    assert.ok(logout.headers.get("set-cookie").includes("Max-Age=0"));
    clock += 8 * 60 * 60 * 1000;
    assert.equal(
      (await call("/oauth2/auth", { headers: { cookie: superadminCookie } })).status,
      401
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
