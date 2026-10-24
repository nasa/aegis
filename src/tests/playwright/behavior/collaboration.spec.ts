import type { Browser, BrowserContext, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import {
  enablePlanningEditMode,
  openPlanningField,
  openPlanningSection,
  planningField,
  savePlanningField,
  selectPlanningStation,
} from "./planningHelpers";

async function withPlanningPeer(
  browser: Browser,
  context: BrowserContext,
  mission: BehavioralMission,
  baseURL: string | undefined,
  run: (peer: Page) => Promise<void>
): Promise<void> {
  const peerContext = await browser.newContext({
    storageState: await context.storageState(),
    baseURL,
    viewport: { width: 1960, height: 1080 },
  });
  const peer = await peerContext.newPage();
  const errors: string[] = [];
  peer.on("pageerror", (error) => errors.push(error.message));
  try {
    await mission.open(peer);
    await run(peer);
    expect(errors, "The collaborating client must not raise an uncaught error").toEqual([]);
  } finally {
    await peerContext.close();
  }
}

test.describe("Collaboration contracts", () => {
  test("a disconnected client catches up without reloading and can publish edits after reconnecting", async ({
    page,
    browser,
    context,
    baseURL,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");

    await withPlanningPeer(browser, context, mission, baseURL, async (peer) => {
      await selectPlanningStation(peer, "Alpha station");
      try {
        await peer.context().setOffline(true);
        await expect(peer.getByLabel("globalEditToggle", { exact: true })).toHaveAttribute(
          "data-tooltip-content",
          "Offline: Editing Disabled"
        );
        await peer.getByLabel("globalEditToggle", { exact: true }).click();
        await planningField(peer, "Station").click();
        await expect(peer.locator("dialog[open]")).toHaveCount(0);
        await savePlanningField(page, "Station", "Changed during disconnection");
        await expect
          .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
          .toBe("Changed during disconnection");
        // Establish that this client really missed the edit before restoring its network.
        await expect(planningField(peer, "Station")).toHaveText("Alpha station");
      } finally {
        await peer.context().setOffline(false);
      }

      await expect(peer.getByLabel("globalEditToggle", { exact: true })).toHaveAttribute(
        "data-tooltip-content",
        "Turn On Edit Mode"
      );
      await expect(planningField(peer, "Station")).toHaveText("Changed during disconnection");
      await expect(
        peer.getByLabel("stationList-item").filter({ hasText: "Changed during disconnection" })
      ).toHaveCount(1);
      await enablePlanningEditMode(peer);
      await savePlanningField(peer, "Station", "Saved after reconnecting");
      await expect(planningField(page, "Station")).toHaveText("Saved after reconnecting");
      await expect
        .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
        .toBe("Saved after reconnecting");
      expect((await mission.read()).stations[mission.ids.stationB].name).toBe("Bravo station");
      await mission.open(peer);
      await selectPlanningStation(peer, "Saved after reconnecting");
    });
  });

  test("a saved edit reaches another client without changing that client's selected station", async ({
    page,
    browser,
    context,
    baseURL,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");

    await withPlanningPeer(browser, context, mission, baseURL, async (peer) => {
      await selectPlanningStation(peer, "Bravo station");
      await savePlanningField(page, "Station", "Shared sampling ridge");

      await expect(
        peer.getByLabel("stationList-item").filter({ hasText: "Shared sampling ridge" })
      ).toHaveCount(1);
      await expect(planningField(peer, "Station")).toHaveText("Bravo station");
      await expect(planningField(page, "Station")).toHaveText("Shared sampling ridge");
      await expect
        .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
        .toBe("Shared sampling ridge");

      await mission.open(peer);
      await selectPlanningStation(peer, "Shared sampling ridge");
      await expect(planningField(peer, "Station")).toHaveText("Shared sampling ridge");
      expect((await mission.read()).stations[mission.ids.stationB].name).toBe("Bravo station");
    });
  });

  test("simultaneous edits to different stations merge and persist in both clients", async ({
    page,
    browser,
    context,
    baseURL,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");

    await withPlanningPeer(browser, context, mission, baseURL, async (peer) => {
      await enablePlanningEditMode(peer);
      await selectPlanningStation(peer, "Bravo station");
      const firstDialog = await openPlanningField(page, "Station");
      const secondDialog = await openPlanningField(peer, "Station");
      await firstDialog.getByLabel("Station", { exact: true }).fill("First client's site");
      await secondDialog.getByLabel("Station", { exact: true }).fill("Second client's site");
      await Promise.all([
        firstDialog.getByText("Save", { exact: true }).click(),
        secondDialog.getByText("Save", { exact: true }).click(),
      ]);
      await expect(planningField(page, "Station")).toHaveText("First client's site");
      await expect(planningField(peer, "Station")).toHaveText("Second client's site");
      await expect(
        peer.getByLabel("stationList-item").filter({ hasText: "First client's site" })
      ).toHaveCount(1);
      await expect(
        page.getByLabel("stationList-item").filter({ hasText: "Second client's site" })
      ).toHaveCount(1);
      await expect
        .poll(async () => {
          const document = await mission.read();
          return [
            document.stations[mission.ids.stationA].name,
            document.stations[mission.ids.stationB].name,
          ];
        })
        .toEqual(["First client's site", "Second client's site"]);

      await mission.open(page);
      await mission.open(peer);
      await selectPlanningStation(page, "Second client's site");
      await selectPlanningStation(peer, "First client's site");
      await expect(planningField(page, "Station")).toHaveText("Second client's site");
      await expect(planningField(peer, "Station")).toHaveText("First client's site");
    });
  });

  test("a canceled dialog draft never replaces the value shown by another client", async ({
    page,
    browser,
    context,
    baseURL,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");

    await withPlanningPeer(browser, context, mission, baseURL, async (peer) => {
      await selectPlanningStation(peer, "Alpha station");
      const dialog = await openPlanningField(page, "Station");
      await dialog.getByLabel("Station", { exact: true }).fill("Uncommitted private draft");
      await expect(planningField(peer, "Station")).toHaveText("Alpha station");
      expect((await mission.read()).stations[mission.ids.stationA].name).toBe("Alpha station");
      await dialog.getByText("Cancel", { exact: true }).click();
      await expect(planningField(page, "Station")).toHaveText("Alpha station");

      await savePlanningField(page, "Station", "Committed shared value");
      await expect(planningField(peer, "Station")).toHaveText("Committed shared value");
      await mission.open(peer);
      await selectPlanningStation(peer, "Committed shared value");
      expect((await mission.read()).stations[mission.ids.stationA].name).toBe(
        "Committed shared value"
      );
      await expect(peer.getByText("Uncommitted private draft", { exact: true })).toHaveCount(0);
    });
  });

  test("a station created by one client can be edited by another and deleted without stale list entries", async ({
    page,
    browser,
    context,
    baseURL,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await openPlanningSection(page, "station");

    await withPlanningPeer(browser, context, mission, baseURL, async (peer) => {
      await enablePlanningEditMode(peer);
      await openPlanningSection(peer, "station");
      await page.getByLabel("addStation", { exact: true }).click();
      await savePlanningField(page, "Station", "Collaborative station");
      await expect(
        peer.getByLabel("stationList-item").filter({ hasText: "Collaborative station" })
      ).toHaveCount(1);
      await selectPlanningStation(peer, "Collaborative station");
      await savePlanningField(peer, "Station", "Peer updated station");
      await expect(planningField(page, "Station")).toHaveText("Peer updated station");
      await expect
        .poll(async () =>
          Object.values((await mission.read()).stations).some(
            (station) => station.name === "Peer updated station"
          )
        )
        .toBe(true);

      const newStation = Object.values((await mission.read()).stations).find(
        (station) => station.name === "Peer updated station"
      );
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByLabel("deleteStation", { exact: true }).click();
      await expect(
        page.getByLabel("stationList-item").filter({ hasText: "Peer updated station" })
      ).toHaveCount(0);
      await expect(
        peer.getByLabel("stationList-item").filter({ hasText: "Peer updated station" })
      ).toHaveCount(0);
      await expect
        .poll(async () => (await mission.read()).stations[newStation.uuid])
        .toBeUndefined();
      await expect(
        peer.getByLabel("stationList-item").filter({ hasText: "Alpha station" })
      ).toHaveCount(1);
      await mission.open(peer);
      await openPlanningSection(peer, "station");
      await expect(
        peer.getByLabel("stationList-item").filter({ hasText: "Peer updated station" })
      ).toHaveCount(0);
    });
  });

  test("a client joining after edits sees persisted state and later changes in both directions", async ({
    page,
    browser,
    context,
    baseURL,
    mission,
  }) => {
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningStation(page, "Alpha station");
    await savePlanningField(page, "Station", "Saved before joining");
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
      .toBe("Saved before joining");

    await withPlanningPeer(browser, context, mission, baseURL, async (peer) => {
      await enablePlanningEditMode(peer);
      await selectPlanningStation(peer, "Saved before joining");
      await expect(planningField(peer, "Station")).toHaveText("Saved before joining");
      await savePlanningField(peer, "Station", "Saved by late arrival");
      await expect(planningField(page, "Station")).toHaveText("Saved by late arrival");
      await savePlanningField(page, "Station", "Acknowledged by original client");
      await expect(planningField(peer, "Station")).toHaveText("Acknowledged by original client");
      await expect
        .poll(async () => (await mission.read()).stations[mission.ids.stationA].name)
        .toBe("Acknowledged by original client");
    });

    await mission.open(page);
    await selectPlanningStation(page, "Acknowledged by original client");
  });
});
