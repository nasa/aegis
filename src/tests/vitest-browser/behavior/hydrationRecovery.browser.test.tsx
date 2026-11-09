import { test as base, expect } from "./missionHarness";

for (const path of ["/api/v1/all", "/api/v1/docListing"]) {
  const handlers: Record<string, BrowserRequestHandler> = {};
  const test = base.extend<{ requestHandlers: Record<string, BrowserRequestHandler> }>({
    requestHandlers: handlers,
  });
  test(`${path} failure hides editable content and Retry recovers exactly once without mutations`, async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    const response = await fetch(`${path}?missionId=${mission.id}`);
    const success = await response.json();
    let requests = 0;
    handlers[path] = () => {
      requests++;
      return requests === 1
        ? Response.json({ status: "error", message: "Temporary fixture outage" }, { status: 503 })
        : Response.json(success);
    };
    try {
      await mission.open({ waitForReady: false });
      await expect
        .element(page.getByRole("alert"))
        .toMatchTextContent("Mission data could not be loaded");
      await expect.element(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
      await expect
        .poll(() => page.getByLabelText("globalEditToggle", { exact: true }).length)
        .toBe(0);
      await expect.poll(() => page.getByTestId("mission-panel-map").length).toBe(0);
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await expect
        .element(page.getByLabelText("missionNameHeader", { exact: true }))
        .toMatchTextContent(mission.name);
      await expect.element(page.getByLabelText("globalEditToggle", { exact: true })).toBeEnabled();
      expect(requests).toBe(2);
      expect(await mission.read()).toEqual(before);
    } finally {
      delete handlers[path];
    }
  });
}

const handlers: Record<string, BrowserRequestHandler> = {};
const gatedTest = base.extend<{ requestHandlers: Record<string, BrowserRequestHandler> }>({
  requestHandlers: handlers,
});
gatedTest(
  "pending document listing hides map and edits until hydration finishes",
  async ({ page, mission }) => {
    const before = await mission.read();
    const success = await (await fetch(`/api/v1/docListing?missionId=${mission.id}`)).json();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    handlers["/api/v1/docListing"] = async () => {
      requested = true;
      await gate;
      return Response.json(success);
    };
    try {
      await mission.open({ waitForReady: false });
      await expect.poll(() => requested).toBe(true);
      await expect.element(page.getByLabelText("loading-overlay", { exact: true })).toBeVisible();
      await expect
        .element(page.getByText("Loading mission data...", { exact: true }))
        .toBeVisible();
      await expect
        .poll(() => page.getByLabelText("globalEditToggle", { exact: true }).length)
        .toBe(0);
      await expect.poll(() => page.getByTestId("mission-panel-map").length).toBe(0);
      release();
      await expect
        .element(page.getByLabelText("missionNameHeader", { exact: true }))
        .toMatchTextContent(mission.name);
      await expect.element(page.getByLabelText("globalEditToggle", { exact: true })).toBeEnabled();
      expect(await mission.read()).toEqual(before);
    } finally {
      release();
      delete handlers["/api/v1/docListing"];
    }
  }
);

gatedTest(
  "a completed stale mission response cannot replace the mission selected while it was pending",
  async ({ page, mission }) => {
    const next = await mission.addMission("Hydration target");
    const before = await mission.read();
    const nextBefore = await next.read();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    let completed = false;
    handlers["/api/v1/all"] = async (url) => {
      if (url.searchParams.get("missionId") === String(mission.id)) {
        requested = true;
        await gate;
        completed = true;
        return Response.json({ status: "success", data: { mission: before } });
      }
      return Response.json({ status: "success", data: { mission: nextBefore } });
    };
    try {
      await mission.open({ waitForReady: false });
      await expect.poll(() => requested).toBe(true);
      await expect.element(page.getByLabelText("loading-overlay", { exact: true })).toBeVisible();
      await expect
        .poll(() => page.getByLabelText("globalEditToggle", { exact: true }).length)
        .toBe(0);
      await mission.navigate(`/mission/${next.id}`);
      await expect
        .element(page.getByLabelText("missionNameHeader", { exact: true }))
        .toMatchTextContent(next.name);
      release();
      await expect.poll(() => completed).toBe(true);
      await expect
        .element(page.getByLabelText("missionNameHeader", { exact: true }))
        .toMatchTextContent(next.name);
      await expect.element(page.getByLabelText("globalEditToggle", { exact: true })).toBeEnabled();
      await expect
        .poll(
          () =>
            page.getByText("Mission data could not be loaded. Please retry.", { exact: true })
              .length
        )
        .toBe(0);
      expect(await mission.read()).toEqual(before);
      expect(await next.read()).toEqual(nextBefore);
    } finally {
      release();
      delete handlers["/api/v1/all"];
    }
  }
);

gatedTest(
  "an export route change hides the previous mission controls throughout lookup and missing-resource feedback",
  async ({ page, mission }) => {
    await mission.open({ path: `/admin/export/${mission.id}`, waitForReady: false });
    const dump = page.getByRole("button", { name: "Dump Mission to JSON File", exact: true });
    await expect.element(dump).toBeVisible();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    handlers["/api/v1/docListing"] = async () => {
      await gate;
      return Response.json({ status: "success", data: [] });
    };
    try {
      await mission.navigate("/admin/export/2147483647");
      await expect
        .element(page.getByRole("status"))
        .toMatchTextContent("Loading mission for export...");
      await expect.poll(() => dump.length).toBe(0);
      release();
      await expect
        .element(page.getByRole("alert"))
        .toMatchTextContent("Mission 2147483647 was not found or is unavailable.");
      await expect.poll(() => dump.length).toBe(0);
    } finally {
      release();
      delete handlers["/api/v1/docListing"];
    }
  }
);
