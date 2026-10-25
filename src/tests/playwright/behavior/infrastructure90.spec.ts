import { test, expect } from "@playwright/test";
import "../../../utils/loadEnv";

test("health, version, time, and permitted diagnostics follow their service policies", async ({
  request,
  browser,
}) => {
  const health = await request.get("/api/v1/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  expect(health.headers()["cache-control"]).toContain("no-store");

  const versionResponse = await request.get("/api/v1/version");
  expect(versionResponse.status()).toBe(200);
  expect(versionResponse.headers()["cache-control"]).toBe(
    "no-store, no-cache, must-revalidate, max-age=0"
  );
  expect(versionResponse.headers().pragma).toBe("no-cache");
  expect(versionResponse.headers().expires).toBe("0");
  const version = (await versionResponse.json()) as AppVersion;
  expect(version.version).toEqual(expect.any(String));
  expect(version.gitCommit).toEqual(expect.any(String));
  expect(version.serverEpochUuid).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
  expect(Object.keys(version).sort()).toEqual(["gitCommit", "serverEpochUuid", "version"]);
  const secondVersion = (await (await request.get("/api/v1/version")).json()) as AppVersion;
  expect(secondVersion).toEqual(version);

  const beforeTimeRequest = Date.now();
  const timeResponse = await request.get("/api/v1/time");
  const afterTimeRequest = Date.now();
  expect(timeResponse.status()).toBe(200);
  const timeBody = (await timeResponse.json()) as { time: string };
  const serverTime = Date.parse(timeBody.time);
  expect(timeBody.time).toBe(new Date(serverTime).toISOString());
  expect(serverTime).toBeGreaterThanOrEqual(beforeTimeRequest - 1000);
  expect(serverTime).toBeLessThanOrEqual(afterTimeRequest + 1000);

  const unauthorizedMetrics = await request.get("/api/v1/metrics");
  expect(unauthorizedMetrics.status()).toBe(401);
  expect(await unauthorizedMetrics.json()).toEqual({ error: "missing API key" });
  const invalidMetrics = await request.get("/api/v1/metrics", {
    headers: { "X-API-Key": "invalid-test-key" },
  });
  expect(invalidMetrics.status()).toBe(403);
  expect(await invalidMetrics.json()).toEqual({ error: "invalid API key" });
  const emssToken = process.env.EMSS_TOKEN;
  expect(
    emssToken,
    "The local API key configuration is loaded for this integration test"
  ).toBeTruthy();
  const authorizedMetrics = await request.get("/api/v1/metrics", {
    headers: { "X-API-Key": emssToken as string },
  });
  expect(authorizedMetrics.status()).toBe(200);
  expect(authorizedMetrics.headers()["content-type"]).toContain("text/plain");
  const metrics = await authorizedMetrics.text();
  expect(metrics).toContain("# HELP process_cpu_user_seconds_total");
  expect(metrics).not.toContain(emssToken as string);
  expect(metrics).not.toMatch(/(?:SESSION_PASSWORD|DB_PASS|OAUTH2_PROXY_CLIENT_SECRET)=/);

  const permittedDiagnostics = await request.get("/api/v1/socket/serverSocketStatus");
  expect(permittedDiagnostics.status()).toBe(200);
  const diagnosticBody = (await permittedDiagnostics.json()) as {
    visitorsData: unknown[];
  };
  expect(diagnosticBody.visitorsData).toEqual(expect.any(Array));
  expect(JSON.stringify(diagnosticBody)).not.toMatch(
    /(?:SESSION_PASSWORD|DB_PASS|OAUTH2_PROXY_CLIENT_SECRET)=/
  );

  const anonymousContext = await browser.newContext({
    baseURL: "http://localhost:4000",
    storageState: { cookies: [], origins: [] },
  });
  try {
    const publicHealth = await anonymousContext.request.get("/api/v1/health");
    expect(publicHealth.status()).toBe(200);
    expect(await publicHealth.json()).toEqual({ status: "ok" });
    const publicVersion = await anonymousContext.request.get("/api/v1/version");
    expect(publicVersion.status()).toBe(200);
    expect(((await publicVersion.json()) as AppVersion).serverEpochUuid).toBe(
      version.serverEpochUuid
    );
    const publicTime = await anonymousContext.request.get("/api/v1/time");
    expect(publicTime.status()).toBe(200);
    expect(Date.parse(((await publicTime.json()) as { time: string }).time)).toBeGreaterThan(0);

    const restrictedDiagnostics = await anonymousContext.request.get(
      "/api/v1/socket/serverSocketStatus"
    );
    expect(restrictedDiagnostics.status()).toBe(401);
    expect(await restrictedDiagnostics.json()).toMatchObject({
      status: "failure",
      message: "Unauthorized",
    });
  } finally {
    await anonymousContext.close();
  }

  const clientLog = await request.put("/api/v1/log/from-client", {
    data: {
      logLevel: "info",
      logId: "playwright-infrastructure90",
      logValue: "Reviewed client log delivery",
    },
  });
  expect(clientLog.status()).toBe(200);
  expect(await clientLog.json()).toEqual({ done: true });
});

test("server version dependency failure shows a safe startup diagnostic", async ({ page }) => {
  const restrictedConfiguration = "RESTRICTED_CONFIG_SENTINEL";
  await page.route("**/api/v1/version**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "version dependency unavailable",
        diagnostic: restrictedConfiguration,
      }),
    });
  });

  await page.goto("/");
  const startupFailure = page.getByText(
    "Unable to reach the AEGIS server. Please refresh to try again.",
    { exact: true }
  );
  await expect(startupFailure).toBeVisible();
  await expect(page.locator("body")).not.toContainText(restrictedConfiguration);
  await expect(page.locator("body")).not.toContainText("version dependency unavailable");
});
