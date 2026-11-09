import { vi } from "vitest";
import { test as base, expect } from "./missionHarness";

for (const mismatch of ["version", "gitCommit", "serverEpochUuid"] as const) {
  const serverVersion: AppVersion = {
    version: __APP_VERSION__,
    gitCommit: __GIT_COMMIT__,
    serverEpochUuid: "browser-test-epoch",
    [mismatch]: "deployment-changed",
  };
  const request = vi.fn((_url: URL, _init: RequestInit) => Response.json(serverVersion));
  const test = base.extend({ requestHandlers: { "/api/v1/version": request } });

  test(`${mismatch} mismatch explains refresh recovery and hides protected mission controls`, async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open({ path: "/versionCheck?returnUrl=%2Fmission%2F1", waitForReady: false });
    await expect.element(page.getByRole("heading", { name: "Refresh Required" })).toBeVisible();
    await expect
      .element(page.getByText(/Your version of AEGIS is out of date/))
      .toMatchTextContent("AEGIS server has been restarted");
    await expect
      .element(page.getByText(/^Your Version:/))
      .toMatchTextContent(`${__APP_VERSION__}/${__GIT_COMMIT__}`);
    await expect
      .element(page.getByText(/^Required Version:/))
      .toMatchTextContent(`${serverVersion.version}/${serverVersion.gitCommit}`);
    await expect.element(page.getByLabelText("Get Latest Version", { exact: true })).toBeEnabled();
    await expect.poll(() => page.getByLabelText("Redirect Now", { exact: true }).length).toBe(0);
    await expect
      .poll(() => page.getByLabelText("globalEditToggle", { exact: true }).length)
      .toBe(0);
    await expect
      .poll(() => page.getByLabelText("missionNameHeader", { exact: true }).length)
      .toBe(0);
    await expect.poll(() => page.getBySelector(".ol-viewport").length).toBe(0);
    expect(request).toHaveBeenCalledOnce();
    const [url, options] = request.mock.calls[0];
    expect(url.searchParams.get("_")).toMatch(/^\d+$/);
    expect(options).toMatchObject({ cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    expect(await mission.read()).toEqual(before);
  });
}

let releaseVersion: () => void;
const matchingVersion = {
  version: __APP_VERSION__,
  gitCommit: __GIT_COMMIT__,
  serverEpochUuid: "browser-test-epoch",
};
const test = base.extend({
  requestHandlers: {
    "/api/v1/version": async () => {
      await new Promise<void>((resolve) => {
        releaseVersion = resolve;
      });
      return Response.json(matchingVersion);
    },
  },
});

test("matching build and server epoch replace loading feedback with the successful redirect explanation", async ({
  page,
  mission,
}) => {
  const before = await mission.read();
  try {
    await mission.open({ path: "/versionCheck?returnUrl=%2Fmission%2F1", waitForReady: false });
    await expect.element(page.getByText("Checking version...", { exact: true })).toBeVisible();
    await expect.poll(() => page.getByLabelText("Redirect Now", { exact: true }).length).toBe(0);
    releaseVersion();
    await expect.element(page.getByRole("heading", { name: /Version Updated$/ })).toBeVisible();
    await expect
      .element(page.getByText(/An updated version of AEGIS has been loaded/))
      .toMatchTextContent(/Redirecting you back in \d+ seconds/);
    await expect
      .element(page.getByText(/^Current Version:/))
      .toMatchTextContent(`${__APP_VERSION__} (${__GIT_COMMIT__}) | browser-test-epoch`);
    await expect.element(page.getByLabelText("Redirect Now", { exact: true })).toBeEnabled();
    await expect
      .poll(() => page.getByLabelText("Get Latest Version", { exact: true }).length)
      .toBe(0);
    await expect
      .poll(() => page.getByLabelText("globalEditToggle", { exact: true }).length)
      .toBe(0);
    expect(await mission.read()).toEqual(before);
  } finally {
    releaseVersion?.();
  }
});
