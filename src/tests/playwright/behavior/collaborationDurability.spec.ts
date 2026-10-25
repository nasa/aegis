import { WebSocket } from "ws";
import { test, expect } from "../fixtures/behavioralTest";
import { startDisposableApi } from "../fixtures/disposableApi";
import {
  enablePlanningEditMode,
  openPlanningField,
  planningField,
  savePlanningField,
  selectPlanningStation,
} from "./planningHelpers";

test("closing every browser client preserves saved changes and discards an unsaved draft", async ({
  browser,
  context,
  baseURL,
  mission,
}) => {
  const storageState = await context.storageState();
  const writer = await browser.newContext({ storageState, baseURL });
  try {
    const page = await writer.newPage();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await savePlanningField(page, "Station", "Saved before closing every tab");
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
      .toBe("Saved before closing every tab");
    const draft = await openPlanningField(page, "Station");
    await draft.getByLabel("Station", { exact: true }).fill("Uncommitted browser draft");
    await writer.close();

    const reopened = await browser.newContext({ storageState, baseURL });
    try {
      const fresh = await reopened.newPage();
      await mission.open(fresh);
      await selectPlanningStation(fresh, "Saved before closing every tab");
      await expect(planningField(fresh, "Station")).toHaveText("Saved before closing every tab");
      await expect(fresh.getByText("Uncommitted browser draft", { exact: true })).toHaveCount(0);
      expect((await mission.read()).stations[mission.ids.stationA].name).toBe(
        "Saved before closing every tab"
      );
    } finally {
      await reopened.close();
    }
  } finally {
    await writer.close();
  }
});

test("a real API restart preserves durable writes and rejects the old epoch and stale client changes", async ({
  browser,
  context,
  baseURL,
  mission,
}) => {
  test.setTimeout(180000);
  const api = await startDisposableApi(baseURL ?? "http://localhost:4000");
  const oldClient = await browser.newContext({
    storageState: await context.storageState(),
    baseURL: api.origin,
    viewport: { width: 1960, height: 1080 },
  });
  let freshClient: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    const page = await oldClient.newPage();
    let allowSocketIo = true;
    await page.routeWebSocket(/\/api\/socket/, (socket) => {
      if (allowSocketIo) socket.connectToServer();
      else socket.close({ code: 1013, reason: "Hold stale tab for epoch-gate assertion" });
    });
    const oldVersion: AppVersion = await (await oldClient.request.get("/api/v1/version")).json();
    await page.goto(mission.url);
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await savePlanningField(page, "Station", "Durable before API restart");
    const read = async (): Promise<Mission> => {
      const response = await oldClient.request.get(`/api/v1/missionDump?missionId=${mission.id}`);
      expect(response.ok()).toBe(true);
      const body: WrappedResponse<MissionDump> = await response.json();
      return body.data.missionData.mission;
    };
    await expect
      .poll(async () => (await read()).stations[mission.ids.stationA].name)
      .toBe("Durable before API restart");
    const draft = await openPlanningField(page, "Station");
    await draft.getByLabel("Station", { exact: true }).fill("Unsaved before API restart");
    // Keep the old tab alive long enough to exercise a stale, locally authored change.
    await page.route("**/api/v1/version?_=*", (route) => route.fulfill({ status: 503, body: "" }));
    allowSocketIo = false;
    await api.restart();
    const newVersion: AppVersion = await (await oldClient.request.get("/api/v1/version")).json();
    expect(newVersion.serverEpochUuid).not.toBe(oldVersion.serverEpochUuid);
    expect((await read()).stations[mission.ids.stationA].name).toBe("Durable before API restart");
    await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveAttribute(
      "data-tooltip-content",
      "Offline: Editing Disabled"
    );
    await expect(draft.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    expect((await read()).stations[mission.ids.stationA].name).toBe("Durable before API restart");

    await page.evaluate(async (stationUuid) => {
      const modulePath = "/client/automergeDocHandles.ts";
      const { withMissionChange } = await import(modulePath);
      withMissionChange((doc: Mission) => {
        doc.stations[stationUuid].name = "Stale in-memory client mutation";
      });
    }, mission.ids.stationA);

    const rejectedStatus = await new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(
        `${api.origin.replace("http:", "ws:")}/api/automergeSocket/?serverEpochUuid=${oldVersion.serverEpochUuid}`
      );
      const timeout = setTimeout(() => {
        socket.terminate();
        reject(new Error("Old-epoch socket did not receive an HTTP rejection"));
      }, 10000);
      socket.on("unexpected-response", (_request, response) => {
        clearTimeout(timeout);
        response.resume();
        socket.terminate();
        resolve(response.statusCode ?? 0);
      });
      socket.on("error", () => undefined);
      socket.on("open", () => {
        clearTimeout(timeout);
        socket.close();
        reject(new Error("Server accepted the stale epoch"));
      });
    });
    expect(rejectedStatus).toBe(426);
    await page.unroute("**/api/v1/version?_=*");
    await expect(page).toHaveURL(/\/versionCheck\?returnUrl=/, { timeout: 20000 });
    await expect(
      page.getByRole("heading", { name: "✓ Version Updated", exact: true })
    ).toBeVisible();
    expect((await read()).stations[mission.ids.stationA].name).toBe("Durable before API restart");
    allowSocketIo = true;
    await page.getByLabel("Redirect Now", { exact: true }).click();
    await selectPlanningStation(page, "Durable before API restart");
    await expect(page.getByLabel("globalEditToggle", { exact: true })).toBeEnabled();
    await expect(page.getByText("Unsaved before API restart", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Stale in-memory client mutation", { exact: true })).toHaveCount(0);

    freshClient = await browser.newContext({
      storageState: await context.storageState(),
      baseURL: api.origin,
    });
    const fresh = await freshClient.newPage();
    await fresh.goto(mission.url);
    await selectPlanningStation(fresh, "Durable before API restart");
    await enablePlanningEditMode(fresh);
    await savePlanningField(fresh, "Station", "Fresh epoch authoritative edit");
    await expect
      .poll(async () => (await read()).stations[mission.ids.stationA].name)
      .toBe("Fresh epoch authoritative edit");
    await expect(planningField(page, "Station")).toHaveText("Fresh epoch authoritative edit");
    await enablePlanningEditMode(page);
    await savePlanningField(page, "Station", "Recovered with fresh document");
    await expect(planningField(fresh, "Station")).toHaveText("Recovered with fresh document");
    await expect
      .poll(async () => (await read()).stations[mission.ids.stationA].name)
      .toBe("Recovered with fresh document");
  } finally {
    await freshClient?.close();
    await oldClient.close();
    await api.close();
  }
});
