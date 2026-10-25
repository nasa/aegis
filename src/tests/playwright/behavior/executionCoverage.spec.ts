import type { Locator, Page, WebSocketRoute } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { readMapFeatures } from "../fixtures/mapAssertions";

const CLOCK_ORIGIN = "2026-10-24T12:00:00.000Z";
const SECOND_POS_TYPE = "30000000-0000-4000-8000-000000000011";
const THIRD_POS_TYPE = "30000000-0000-4000-8000-000000000012";
const SECOND_POS_SOURCE = "30000000-0000-4000-8000-000000000013";
const THIRD_POS_SOURCE = "30000000-0000-4000-8000-000000000014";

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

async function editPet(page: Page, value: string): Promise<Locator> {
  await page.locator('div[aria-label="PET Timer"]').click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeAttached();
  await dialog.getByLabel("PET Timer", { exact: true }).fill(value);
  return dialog;
}

async function expectPositionAge(page: Page, uuid: string, age: string): Promise<void> {
  await expect
    .poll(async () => {
      const label = (await readMapFeatures(page)).find(
        (feature) => feature.id === `pos-${uuid}` && feature.labelType === "pos" && feature.visible
      );
      return label?.name.split(" / ")[0] ?? null;
    })
    .toBe(age);
}

async function stabilizeClock(page: Page): Promise<void> {
  await page.context().addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string): void {
      original.call(this, key, key === "timeOffsetMs" ? "0" : value);
    };
    sessionStorage.setItem("timeOffsetMs", "0");
  });
  await page.clock.setFixedTime(new Date(CLOCK_ORIGIN));
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

  test("first start seeds one egress position per configured source and restart reuses them", async ({
    page,
    mission,
  }) => {
    await mission.change((doc) => {
      const rex = doc.rexes[mission.ids.rexB];
      rex.isRunning = false;
      rex.petRunning = false;
      rex.posEntries = [];
      rex.posTypes.push(
        {
          uuid: SECOND_POS_TYPE,
          name: "EV2",
          abbr: "2",
          icon: "1f469-200d-1f680",
          pathColor: "#0000ff",
        },
        {
          uuid: THIRD_POS_TYPE,
          name: "Cart",
          abbr: "C",
          icon: "1f6d2",
          pathColor: "#00ff00",
        }
      );
      rex.posSources.push(
        { uuid: SECOND_POS_SOURCE, name: "Task", abbr: "T" },
        { uuid: THIRD_POS_SOURCE, name: "Science", abbr: "S" }
      );
    });
    const before = await mission.read();
    const rexBefore = before.rexes[mission.ids.rexB];
    const plannedGraph = {
      evas: before.evas,
      stations: before.stations,
      traverses: before.traverses,
      actions: before.actions,
      rexes: { [mission.ids.rexA]: before.rexes[mission.ids.rexA] },
    };
    const egress = before.stations[mission.ids.egressB];

    await mission.open(page);
    await openRexInfo(page, "Survey Bravo", mission.ids.rexEvaB);
    await enableEditing(page);
    await page.getByLabel("Execute EVA", { exact: true }).click();

    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].posEntries.length)
      .toBe(rexBefore.posSources.length);
    let started = (await mission.read()).rexes[mission.ids.rexB];
    expect(started.isRunning).toBe(true);
    expect(started.posEntries).toHaveLength(3);
    expect(started.posEntries.map((entry) => entry.posSourceUuid).sort()).toEqual(
      rexBefore.posSources.map((source) => source.uuid).sort()
    );
    for (const entry of started.posEntries) {
      expect(entry).toMatchObject({
        location: egress.location,
        petSeconds: 0,
        posTypeUuids: rexBefore.posTypes.map((type) => type.uuid),
      });
      expect(entry.uuid).toBeTruthy();
    }
    expect((await mission.read()).evas).toEqual(plannedGraph.evas);
    expect((await mission.read()).stations).toEqual(plannedGraph.stations);
    expect((await mission.read()).traverses).toEqual(plannedGraph.traverses);
    expect((await mission.read()).actions).toEqual(plannedGraph.actions);
    expect((await mission.read()).rexes[mission.ids.rexA]).toEqual(
      plannedGraph.rexes[mission.ids.rexA]
    );

    await page.getByLabel("Stop Execution", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].isRunning)
      .toBe(false);
    const stoppedEntries = (await mission.read()).rexes[mission.ids.rexB].posEntries;
    await page.getByLabel("Execute EVA", { exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).rexes[mission.ids.rexB].isRunning)
      .toBe(true);
    started = (await mission.read()).rexes[mission.ids.rexB];
    expect(started.posEntries).toEqual(stoppedEntries);
    expect(started.posEntries.map((entry) => entry.uuid)).toHaveLength(3);
    expect(started.posEntries.map((entry) => entry.uuid)).toEqual(
      stoppedEntries.map((entry) => entry.uuid)
    );
    expect((await mission.read()).evas).toEqual(plannedGraph.evas);
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

test.describe("PET manual edit boundaries", () => {
  for (const valueCase of [
    { title: "positive", typed: "+12:34:56", saved: "+12:34:56", seconds: 45_296 },
    { title: "negative", typed: "-12:34:56", saved: "-12:34:56", seconds: -45_296 },
    { title: "zero", typed: "+00:00:00", saved: "+00:00:00", seconds: 0 },
    { title: "maximum two-digit hour", typed: "+99:59:59", saved: "+99:59:59", seconds: 359_999 },
    {
      title: "minute and second values above 59",
      typed: "+00:60:60",
      saved: "+00:60:60",
      seconds: 3_660,
    },
    {
      title: "typing filters non-time characters",
      typed: "+a01:02:03",
      saved: "+01:02:03",
      seconds: 3_723,
    },
  ]) {
    test(`accepts ${valueCase.title} PET according to the field's format and numeric semantics`, async ({
      page,
      mission,
    }) => {
      await stabilizeClock(page);
      const before = await mission.read();
      const untouchedRex = before.rexes[mission.ids.rexA];
      await mission.open(page);
      await openRexInfo(page, "Survey Bravo", mission.ids.rexEvaB);
      await enableEditing(page);
      const dialog = await editPet(page, valueCase.typed);
      await dialog.getByText("Save", { exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId("rex-pet-clock")).toContainText(valueCase.saved);
      await expect(page.getByTestId("header-pet-clock")).toHaveText(valueCase.saved);
      await expectPositionAge(page, mission.ids.posB, petAge(Math.max(0, valueCase.seconds - 120)));
      await expect
        .poll(async () => (await mission.read()).rexes[mission.ids.rexB].petValueAtStartStop)
        .toBe(valueCase.saved);
      expect((await mission.read()).rexes[mission.ids.rexA]).toEqual(untouchedRex);
      expect((await mission.read()).rexes[mission.ids.rexB].posEntries).toEqual(
        before.rexes[mission.ids.rexB].posEntries
      );

      await page.reload();
      await openRexInfo(page, "Survey Bravo", mission.ids.rexEvaB);
      await expect(page.getByTestId("rex-pet-clock")).toContainText(valueCase.saved);
      await expectPositionAge(page, mission.ids.posB, petAge(Math.max(0, valueCase.seconds - 120)));
      expect((await mission.read()).rexes[mission.ids.rexA]).toEqual(untouchedRex);
    });
  }

  for (const invalid of [
    {
      title: "hour exceeds the two-digit maximum",
      value: "+100:00:00",
      error: "Must be at no more than 9 characters",
    },
    {
      title: "value exceeds nine-character input limit",
      value: "+123:45:67",
      error: "Must be at no more than 9 characters",
    },
    { title: "incomplete field", value: "+12:3", error: "Must be in HH:MM:SS format" },
    { title: "empty field", value: "", error: "Required" },
  ]) {
    test(`rejects an invalid PET ${invalid.title} without replacing committed clocks`, async ({
      page,
      mission,
    }) => {
      const before = await mission.read();
      await mission.open(page);
      await openRexInfo(page, "Survey Bravo", mission.ids.rexEvaB);
      await enableEditing(page);
      const dialog = await editPet(page, invalid.value);
      await expect(dialog.getByText(invalid.error, { exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      await expect(dialog).toBeAttached();
      expect((await mission.read()).rexes[mission.ids.rexB].petValueAtStartStop).toBe(
        before.rexes[mission.ids.rexB].petValueAtStartStop
      );
      expect((await mission.read()).rexes[mission.ids.rexA]).toEqual(
        before.rexes[mission.ids.rexA]
      );
      await dialog.getByText("Cancel", { exact: true }).click();
      await expect(page.getByTestId("rex-pet-clock")).toContainText(
        before.rexes[mission.ids.rexB].petValueAtStartStop
      );
      await expectPositionAge(page, mission.ids.posB, "+00:03:00");
      await page.reload();
      await openRexInfo(page, "Survey Bravo", mission.ids.rexEvaB);
      await expect(page.getByTestId("rex-pet-clock")).toContainText(
        before.rexes[mission.ids.rexB].petValueAtStartStop
      );
    });
  }
});

function petAge(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const absolute = Math.abs(seconds);
  const hours = Math.floor(absolute / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((absolute % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (absolute % 60).toString().padStart(2, "0");
  return `${sign}${hours}:${minutes}:${remainder}`;
}
