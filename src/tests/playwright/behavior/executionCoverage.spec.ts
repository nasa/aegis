import type { Page, WebSocketRoute } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";

test.use({ scenario: "execution" });

async function selectExecution(page: Page, plannedName: string, evaUuid: string): Promise<void> {
  await page.getByLabel("evas Section", { exact: true }).click();
  const showAll = page.getByLabel("Show All EVAs", { exact: true });
  if (await showAll.isVisible()) await showAll.click();
  const eva = page.getByLabel("evaList-item", { exact: true }).filter({ hasText: plannedName });
  await expect(eva).toHaveCount(1);
  await eva.locator("select").selectOption(evaUuid);
}

async function openRexInfo(page: Page, plannedName: string, evaUuid: string): Promise<void> {
  await selectExecution(page, plannedName, evaUuid);
  await page.getByLabel("rex_info_panel", { exact: true }).click();
  await expect(page.getByText("REX Information", { exact: true })).toBeVisible();
}

async function enableEditing(page: Page): Promise<void> {
  const toggle = page.getByLabel("globalEditToggle", { exact: true });
  if ((await toggle.getAttribute("data-tooltip-content")) === "Turn On Edit Mode") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("data-tooltip-content", "Turn Off Edit Mode");
}

test.describe("Execution creation and view state", () => {
  test("two clients starting different stopped REXes concurrently converge and apply the observed running-state gate", async ({
    page,
    browser,
    context,
    baseURL,
    mission,
  }) => {
    await mission.change((doc) => {
      for (const rex of Object.values(doc.rexes)) {
        rex.isRunning = false;
        rex.petRunning = false;
      }
    });
    const before = await mission.read();
    let holdMessages = false;
    const pending: { socket: WebSocketRoute; message: string | Buffer }[] = [];
    const route = (socket: WebSocketRoute): void => {
      const server = socket.connectToServer();
      server.onMessage((message) => {
        if (holdMessages) pending.push({ socket, message });
        else socket.send(message);
      });
    };
    await page.routeWebSocket(/\/api\/automergeSocket\//, route);
    const peerContext = await browser.newContext({
      storageState: await context.storageState(),
      baseURL,
      viewport: { width: 1960, height: 1080 },
    });
    const peer = await peerContext.newPage();
    await peer.routeWebSocket(/\/api\/automergeSocket\//, route);
    const clientRexes = async (client: Page): Promise<Record<string, Rex>> =>
      client.evaluate(async () => {
        const modulePath = "/client/automergeDocHandles.ts";
        const { getMissionDocHandle } = await import(modulePath);
        return JSON.parse(JSON.stringify(getMissionDocHandle().doc().rexes));
      });
    try {
      await mission.open(page);
      await mission.open(peer);
      await openRexInfo(page, "Survey Alpha", mission.ids.rexEvaA);
      await openRexInfo(peer, "Survey Bravo", mission.ids.rexEvaB);
      await enableEditing(page);
      await enableEditing(peer);
      await expect(page.getByLabel("Execute EVA", { exact: true })).toBeVisible();
      await expect(peer.getByLabel("Execute EVA", { exact: true })).toBeVisible();
      holdMessages = true;
      await Promise.all([
        page.getByLabel("Execute EVA", { exact: true }).click(),
        peer.getByLabel("Execute EVA", { exact: true }).click(),
      ]);
      // Each start is authored before that client can receive the other start.
      await expect(page.getByLabel("Stop Execution", { exact: true })).toBeVisible();
      await expect(peer.getByLabel("Stop Execution", { exact: true })).toBeVisible();
      holdMessages = false;
      for (const entry of pending.splice(0)) entry.socket.send(entry.message);
      await expect
        .poll(async () => Object.values((await mission.read()).rexes).map((rex) => rex.isRunning))
        .toEqual([true, true]);
      const persisted = await mission.read();
      for (const rex of Object.values(persisted.rexes)) {
        expect(rex.petRunning).toBe(false);
        expect(rex.petValueAtStartStop).toBe(before.rexes[rex.uuid].petValueAtStartStop);
        expect(rex.posEntries).toEqual(before.rexes[rex.uuid].posEntries);
        expect(rex.executeEditState).toBeDefined();
        expect(persisted.evas[rex.evaUuid]).toEqual(before.evas[rex.evaUuid]);
        for (const item of persisted.evas[rex.evaUuid].sequence) {
          if (!item.uuid) continue;
          expect(
            item.type === "station" ? persisted.stations[item.uuid] : persisted.traverses[item.uuid]
          ).toBeDefined();
        }
      }
      expect(persisted.actions).toEqual(before.actions);
      expect(persisted.stations).toEqual(before.stations);
      expect(persisted.traverses).toEqual(before.traverses);
      for (const client of [page, peer]) {
        await expect.poll(() => clientRexes(client)).toEqual(persisted.rexes);
        await expect(
          client.getByText("Cannot start execution of this rex while another rex is running", {
            exact: true,
          })
        ).toBeVisible();
        await expect(client.getByLabel("Execute EVA", { exact: true })).toHaveCount(0);
        await mission.open(client);
      }
      await openRexInfo(page, "Survey Alpha", mission.ids.rexEvaA);
      await openRexInfo(peer, "Survey Bravo", mission.ids.rexEvaB);
      for (const client of [page, peer]) {
        await enableEditing(client);
        await expect.poll(() => clientRexes(client)).toEqual(persisted.rexes);
        await expect(
          client.getByText("Cannot start execution of this rex while another rex is running", {
            exact: true,
          })
        ).toBeVisible();
        await expect(client.getByLabel("Execute EVA", { exact: true })).toHaveCount(0);
      }
      expect((await mission.read()).rexes).toEqual(persisted.rexes);
    } finally {
      holdMessages = false;
      await peerContext.close();
    }
  });

  test("remote stop exits running-only mode, restores the list and removes stale stop controls", async ({
    page,
    browser,
    context,
    baseURL,
    mission,
  }) => {
    await mission.open(page);
    await openRexInfo(page, "Survey Bravo", mission.ids.rexEvaB);
    await enableEditing(page);
    await expect(page.getByLabel("Stop Execution", { exact: true })).toBeVisible();
    const showOnlyExecuting = page.getByLabel("Show only Executing EVA", { exact: true });
    if (await showOnlyExecuting.isVisible()) await showOnlyExecuting.click();
    await expect(page.getByLabel("Show All EVAs", { exact: true })).toBeVisible();
    await expect(page.getByText("Survey Alpha", { exact: true })).toHaveCount(0);

    const peerContext = await browser.newContext({
      storageState: await context.storageState(),
      baseURL,
      viewport: { width: 1960, height: 1080 },
    });
    const peer = await peerContext.newPage();
    try {
      await mission.open(peer);
      await openRexInfo(peer, "Survey Bravo", mission.ids.rexEvaB);
      await enableEditing(peer);
      await peer.getByLabel("Stop Execution", { exact: true }).click();
      await expect
        .poll(async () => (await mission.read()).rexes[mission.ids.rexB].isRunning)
        .toBe(false);
      await expect(page.getByLabel("Show All EVAs", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Show only Executing EVA", { exact: true })).toHaveCount(0);
      await expect(
        page.getByLabel("evaList-item", { exact: true }).filter({ hasText: "Survey Alpha" })
      ).toHaveCount(1);
      await expect(
        page.getByLabel("evaList-item", { exact: true }).filter({ hasText: "Survey Bravo" })
      ).toHaveCount(1);
      await expect(page.getByLabel("Stop Execution", { exact: true })).toHaveCount(0);

      // A different client starts Alpha after the first remote stop.
      await openRexInfo(peer, "Survey Alpha", mission.ids.rexEvaA);
      await enableEditing(peer);
      await peer.getByLabel("Execute EVA", { exact: true }).click();
      await expect
        .poll(async () => (await mission.read()).rexes[mission.ids.rexA].isRunning)
        .toBe(true);
      await expect(page.getByText("EXECUTING EVA", { exact: true })).toBeVisible();
      await expect(
        page.getByLabel("evaList-item", { exact: true }).filter({ hasText: "Survey Alpha" })
      ).toHaveCount(1);
      await expect(page.getByLabel("Show All EVAs", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("Stop Execution", { exact: true })).toHaveCount(0);
      expect((await mission.read()).rexes[mission.ids.rexB].isRunning).toBe(false);
      await mission.open(page);
      await openRexInfo(page, "Survey Alpha", mission.ids.rexEvaA);
      await enableEditing(page);
      await expect(page.getByLabel("Stop Execution", { exact: true })).toBeVisible();
    } finally {
      await peerContext.close();
    }
  });
});
