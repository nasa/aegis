import type { WebSocketRoute } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  openPlanningField,
  planningField,
  savePlanningField,
  selectPlanningStation,
} from "./planningHelpers";

for (const failVersion of [false, true]) {
  test(`${failVersion ? "server transport outage keeps polling through failed version requests" : "Automerge-only disconnect gates Edit and an open Save"} before same-epoch recovery`, async ({
    page,
    context,
    mission,
  }) => {
    let transport: WebSocketRoute | undefined;
    let upstream: WebSocketRoute | undefined;
    let attempts = 0;
    let allowReconnect = true;
    let socketIoFrames = 0;
    let socketIo: WebSocketRoute | undefined;
    let socketIoUpstream: WebSocketRoute | undefined;
    let holdReadiness = false;
    const buffered: (string | Buffer)[] = [];
    if (failVersion) {
      await page.routeWebSocket(/\/api\/socket/, (socket) => {
        if (!allowReconnect) {
          socket.close({ code: 1013, reason: "Test server transport outage" });
          return;
        }
        socketIo = socket;
        socketIoUpstream = socket.connectToServer();
      });
    }
    page.on("websocket", (socket) => {
      if (new URL(socket.url()).pathname.startsWith("/api/socket")) {
        socket.on("framereceived", () => socketIoFrames++);
      }
    });
    await page.routeWebSocket(/\/api\/automergeSocket\//, (socket) => {
      attempts++;
      if (!allowReconnect) {
        socket.close({ code: 1013, reason: "Test transport interruption" });
        return;
      }
      transport = socket;
      upstream = socket.connectToServer();
      upstream.onMessage((message) => {
        if (holdReadiness) buffered.push(message);
        else socket.send(message);
      });
    });
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    const peer = await context.newPage();
    await mission.open(peer);
    await enablePlanningEditMode(peer);
    await selectPlanningStation(peer, "Alpha station");
    const original = await mission.read();
    const dialog = await openPlanningField(page, "Station");
    await dialog.getByLabel("Station", { exact: true }).fill("Disconnected draft");
    let versionFailures = 0;
    if (failVersion) {
      await page.route("**/api/v1/version?_=*", async (route) => {
        versionFailures++;
        await route.fulfill({
          status: 503,
          json: { status: "error", message: "Temporarily unavailable" },
        });
      });
    }
    allowReconnect = false;
    expect(transport).toBeDefined();
    expect(upstream).toBeDefined();
    await transport!.close({ code: 1013, reason: "Test transport interruption" });
    await upstream!.close();
    if (failVersion) {
      expect(socketIo).toBeDefined();
      expect(socketIoUpstream).toBeDefined();
      await socketIo!.close({ code: 1013, reason: "Test server transport outage" });
      await socketIoUpstream!.close();
    }
    await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveAttribute(
      "data-tooltip-content",
      "Offline: Editing Disabled"
    );
    const save = dialog.getByText("Save", { exact: true });
    await expect(save).toHaveClass(/saveButtonDisabled/);
    await save.click();
    await expect(dialog.getByLabel("Station", { exact: true })).toBeVisible();
    expect((await mission.read()).stations[mission.ids.stationA]).toEqual(
      original.stations[mission.ids.stationA]
    );
    await dialog.getByText("Cancel", { exact: true }).click();
    await page.getByLabel("globalEditToggle", { exact: true }).click();
    await planningField(page, "Station").locator("..").click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    if (!failVersion) {
      // HTTP and Socket.IO stay live during the isolated document-transport failure.
      expect((await page.request.get(`/api/v1/all?missionId=${mission.id}`)).ok()).toBe(true);
      const framesBefore = socketIoFrames;
      await expect.poll(() => socketIoFrames).toBeGreaterThan(framesBefore);
    }
    await savePlanningField(peer, "Station", "Saved while transport unavailable");
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
      .toBe("Saved while transport unavailable");
    await expect(planningField(page, "Station")).toHaveText("Alpha station");
    if (failVersion) {
      await expect.poll(() => versionFailures, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
      expect(attempts).toBe(1);
      await expect(page).toHaveURL(new RegExp(`${mission.url}$`));
      holdReadiness = true;
      await page.unroute("**/api/v1/version?_=*");
    }
    allowReconnect = true;
    if (failVersion) {
      await expect.poll(() => buffered.length).toBeGreaterThan(0);
      await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveAttribute(
        "data-tooltip-content",
        "Offline: Editing Disabled"
      );
      await expect(planningField(page, "Station")).toHaveText("Alpha station");
      holdReadiness = false;
      for (const message of buffered.splice(0)) transport!.send(message);
    }
    await expect(planningField(page, "Station")).toHaveText("Saved while transport unavailable");
    await expect(page.getByLabel("globalEditToggle", { exact: true })).toHaveAttribute(
      "data-tooltip-content",
      "Turn On Edit Mode"
    );
    expect(attempts).toBeGreaterThan(1);
    await enablePlanningEditMode(page);
    await savePlanningField(page, "Station", "Saved after authoritative catch-up");
    await expect(planningField(peer, "Station")).toHaveText("Saved after authoritative catch-up");
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
      .toBe("Saved after authoritative catch-up");
    expect((await mission.read()).stations[mission.ids.stationB]).toEqual(
      original.stations[mission.ids.stationB]
    );
    await mission.open(page);
    await selectPlanningStation(page, "Saved after authoritative catch-up");
  });
}
