import type { BrowserContext, Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { seedFolder } from "../fixtures/entitySeeds";
import {
  confirmPlanningDelete,
  enablePlanningEditMode,
  openPlanningSection,
  selectPlanningPoi,
} from "./planningHelpers";

type BufferedUpdate = {
  message: string | Buffer;
  send: (message: string | Buffer) => void;
};

type ClientBuffer = {
  hold: boolean;
  holdIncoming: boolean;
  updates: BufferedUpdate[];
  serverMessages: BufferedUpdate[];
};

function bufferAutomergeUpdates(page: Page): ClientBuffer {
  const buffer: ClientBuffer = {
    hold: false,
    holdIncoming: false,
    updates: [],
    serverMessages: [],
  };
  page.routeWebSocket(/\/api\/automergeSocket\//, (socket) => {
    const upstream = socket.connectToServer();
    socket.onMessage((message) => {
      if (buffer.hold) {
        buffer.updates.push({ message, send: (payload) => upstream.send(payload) });
      } else upstream.send(message);
    });
    upstream.onMessage((message) => {
      if (buffer.holdIncoming) {
        buffer.serverMessages.push({ message, send: (payload) => socket.send(payload) });
      } else socket.send(message);
    });
  });
  return buffer;
}

function folderRow(page: Page, name: string) {
  return page
    .getByLabel("stationList-item", { exact: true })
    .filter({ hasText: name })
    .locator("xpath=ancestor::div[contains(@class, 'draggableItem')]")
    .first();
}

function folderByName(page: Page, name: string) {
  return page.locator('[class*="folderContainer"]').filter({
    has: page.getByText(name, { exact: true }),
  });
}

function folderMenu(page: Page, name: string) {
  return folderByName(page, name).locator(
    '[class*="folderMenu"] svg[data-icon="ellipsis-vertical"]'
  );
}

async function dragPointerTo(source: Locator, target: Locator) {
  await expect(source.page().locator('[class*="dragOverlay"]')).toHaveCount(0);
  await source.hover();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) throw new Error("Folder drag source must be visible");
  const mouse = source.page().mouse;
  await mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await mouse.down();
  await mouse.move(sourceBox.x + sourceBox.width / 2 + 8, sourceBox.y + sourceBox.height / 2);
  await expect(source).toHaveClass(/isDragging/);
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error("Folder drop target must be visible");
  await mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 10,
  });
  await expect(target).toHaveClass(/droppable/);
  await mouse.up();
}

async function openStations(page: Page) {
  await openPlanningSection(page, "station");
}

async function openPois(page: Page) {
  await openPlanningSection(page, "poi");
}

async function release(buffer: ClientBuffer) {
  const updates = buffer.updates.splice(0);
  for (const update of updates) update.send(update.message);
}

async function releaseIncoming(buffer: ClientBuffer) {
  const messages = buffer.serverMessages.splice(0);
  for (const message of messages) message.send(message.message);
}

test("concurrent moves of one station converge to one folder membership without losing peers", async ({
  page,
  browser,
  context,
  baseURL,
  mission,
}) => {
  const leftFolder = "30000000-0000-4000-8000-000000000081";
  const rightFolder = "30000000-0000-4000-8000-000000000082";
  const keeperFolder = "30000000-0000-4000-8000-000000000083";
  await mission.change((doc) => {
    doc.folders = {
      [leftFolder]: seedFolder({ uuid: leftFolder, name: "Left folder", type: "station" }),
      [rightFolder]: seedFolder({ uuid: rightFolder, name: "Right folder", type: "station" }),
      [keeperFolder]: seedFolder({
        uuid: keeperFolder,
        name: "Keep folder",
        type: "station",
        items: [mission.ids.stationB],
      }),
    };
  });
  const initial = await mission.read();

  const peerContext: BrowserContext = await browser.newContext({
    storageState: await context.storageState(),
    baseURL,
    viewport: { width: 1960, height: 1080 },
  });
  const peer = await peerContext.newPage();
  const remoteBuffer = bufferAutomergeUpdates(peer);
  try {
    await mission.open(page);
    await mission.open(peer);
    await openStations(page);
    await openStations(peer);
    await enablePlanningEditMode(page);
    await enablePlanningEditMode(peer);

    // Pause only document updates after both replicas have loaded the same initial graph.
    remoteBuffer.hold = true;
    remoteBuffer.holdIncoming = true;
    await dragPointerTo(folderRow(page, "Alpha station"), folderByName(page, "Left folder"));
    await expect.poll(async () => remoteBuffer.serverMessages.length).toBeGreaterThan(0);
    await expect(
      folderByName(peer, "Left folder").getByText("Alpha station", { exact: true })
    ).toHaveCount(0);
    await dragPointerTo(folderRow(peer, "Alpha station"), folderByName(peer, "Right folder"));
    await expect(
      folderByName(page, "Left folder").getByText("Alpha station", { exact: true })
    ).toBeVisible();
    await expect(
      folderByName(peer, "Right folder").getByText("Alpha station", { exact: true })
    ).toBeVisible();

    remoteBuffer.hold = false;
    await release(remoteBuffer);
    remoteBuffer.holdIncoming = false;
    await releaseIncoming(remoteBuffer);

    await expect
      .poll(async () => {
        const doc = await mission.read();
        return Object.values(doc.folders).flatMap((folder) =>
          folder.items.filter((uuid) => uuid === mission.ids.stationA)
        ).length;
      })
      .toBe(1);

    const settled = await mission.read();
    const leftMembership = settled.folders[leftFolder].items.includes(mission.ids.stationA);
    const rightMembership = settled.folders[rightFolder].items.includes(mission.ids.stationA);
    for (const client of [page, peer]) {
      await expect(
        folderByName(client, "Left folder").getByText("Alpha station", { exact: true })
      ).toHaveCount(leftMembership ? 1 : 0);
      await expect(
        folderByName(client, "Right folder").getByText("Alpha station", { exact: true })
      ).toHaveCount(rightMembership ? 1 : 0);
    }

    const membership = Object.values(settled.folders).flatMap((folder) =>
      folder.items.filter((uuid) => uuid === mission.ids.stationA)
    );
    expect(membership).toHaveLength(1);
    expect(settled.stations[mission.ids.stationA]).toEqual(initial.stations[mission.ids.stationA]);
    expect(settled.stations[mission.ids.stationB]).toEqual(initial.stations[mission.ids.stationB]);
    expect(settled.folders[keeperFolder].items).toEqual([mission.ids.stationB]);
    for (const folder of Object.values(settled.folders)) {
      expect(new Set(folder.items).size).toBe(folder.items.length);
      for (const uuid of folder.items) expect(settled.stations[uuid]).toBeDefined();
    }

    await mission.open(peer);
    await openStations(peer);
    const reloaded = await mission.read();
    expect(
      reloaded.folders[leftFolder].items.concat(reloaded.folders[rightFolder].items)
    ).toHaveLength(1);
    expect(reloaded.folders[keeperFolder].items).toEqual([mission.ids.stationB]);
    await expect(
      folderByName(peer, "Keep folder").getByText("Bravo station", { exact: true })
    ).toBeVisible();
  } finally {
    await peerContext.close();
  }
});

test("a move racing with folder deletion leaves a valid station and no orphan membership", async ({
  page,
  browser,
  context,
  baseURL,
  mission,
}) => {
  const collisionFolder = "30000000-0000-4000-8000-000000000084";
  const keepFolder = "30000000-0000-4000-8000-000000000085";
  await mission.change((doc) => {
    doc.folders = {
      [collisionFolder]: seedFolder({
        uuid: collisionFolder,
        name: "Racing folder",
        type: "station",
      }),
      [keepFolder]: seedFolder({
        uuid: keepFolder,
        name: "Unrelated folder",
        type: "station",
        items: [mission.ids.stationB],
      }),
    };
  });

  const peerContext: BrowserContext = await browser.newContext({
    storageState: await context.storageState(),
    baseURL,
    viewport: { width: 1960, height: 1080 },
  });
  const peer = await peerContext.newPage();
  const remoteBuffer = bufferAutomergeUpdates(peer);
  try {
    await mission.open(page);
    await mission.open(peer);
    await openStations(page);
    await openStations(peer);
    await enablePlanningEditMode(page);
    await enablePlanningEditMode(peer);
    remoteBuffer.hold = true;
    remoteBuffer.holdIncoming = true;

    await dragPointerTo(folderRow(page, "Alpha station"), folderByName(page, "Racing folder"));
    await expect.poll(async () => remoteBuffer.serverMessages.length).toBeGreaterThan(0);
    await expect(
      folderByName(peer, "Racing folder").getByText("Alpha station", { exact: true })
    ).toHaveCount(0);
    await folderMenu(peer, "Racing folder").click();
    const confirmation = new Promise<string>((resolve) => {
      peer.once("dialog", async (dialog) => {
        resolve(dialog.message());
        await dialog.accept();
      });
    });
    await peer.locator("dialog[open]").getByText("Delete Folder", { exact: true }).click();
    expect(await confirmation).toBe("Are you sure you want to delete this folder?");

    remoteBuffer.hold = false;
    await release(remoteBuffer);
    remoteBuffer.holdIncoming = false;
    await releaseIncoming(remoteBuffer);

    await expect
      .poll(async () => {
        const doc = await mission.read();
        const folder = doc.folders[collisionFolder];
        return folder?.items.filter((uuid) => uuid === mission.ids.stationA).length ?? 0;
      })
      .toBeLessThanOrEqual(1);

    const settled = await mission.read();
    expect(settled.stations[mission.ids.stationA]).toBeDefined();
    expect(settled.stations[mission.ids.stationB]).toBeDefined();
    expect(settled.folders[keepFolder].items).toEqual([mission.ids.stationB]);
    for (const folder of Object.values(settled.folders)) {
      expect(new Set(folder.items).size).toBe(folder.items.length);
      for (const uuid of folder.items) expect(settled.stations[uuid]).toBeDefined();
    }
    const stationAMemberships = Object.values(settled.folders).flatMap((folder) =>
      folder.items.filter((uuid) => uuid === mission.ids.stationA)
    );
    expect(stationAMemberships.length).toBeLessThanOrEqual(1);

    const reloaded = await mission.read();
    expect(reloaded.folders[keepFolder].items).toEqual([mission.ids.stationB]);
    expect(reloaded.stations[mission.ids.stationA]).toEqual(settled.stations[mission.ids.stationA]);
    const targetCount = Object.values(reloaded.folders).reduce(
      (count, folder) =>
        count + folder.items.filter((uuid) => uuid === mission.ids.stationA).length,
      0
    );
    expect(targetCount).toBeLessThanOrEqual(1);
    for (const client of [page, peer]) {
      await expect(
        folderByName(client, "Unrelated folder").getByText("Bravo station", { exact: true })
      ).toHaveCount(1);
      if (reloaded.folders[collisionFolder]) {
        const count = reloaded.folders[collisionFolder].items.includes(mission.ids.stationA)
          ? 1
          : 0;
        await expect(
          folderByName(client, "Racing folder").getByText("Alpha station", { exact: true })
        ).toHaveCount(count);
      } else {
        await expect(folderByName(client, "Racing folder")).toHaveCount(0);
      }
    }
  } finally {
    await peerContext.close();
  }
});

test("a POI deletion racing with a folder move converges without an orphan reference", async ({
  page,
  browser,
  context,
  baseURL,
  mission,
}) => {
  const poiFolder = "30000000-0000-4000-8000-000000000086";
  const keepFolder = "30000000-0000-4000-8000-000000000087";
  await mission.change((doc) => {
    doc.stations[mission.ids.stationA].poiUuids = [];
    doc.actions[mission.ids.actionA].poiUuid = null;
    doc.folders = {
      [poiFolder]: seedFolder({ uuid: poiFolder, name: "POI folder", type: "poi" }),
      [keepFolder]: seedFolder({
        uuid: keepFolder,
        name: "Unrelated folder",
        type: "station",
        items: [mission.ids.stationB],
      }),
    };
  });
  const initial = await mission.read();
  const peerContext: BrowserContext = await browser.newContext({
    storageState: await context.storageState(),
    baseURL,
    viewport: { width: 1960, height: 1080 },
  });
  const peer = await peerContext.newPage();
  const remoteBuffer = bufferAutomergeUpdates(peer);
  try {
    await mission.open(page);
    await mission.open(peer);
    await openPois(page);
    await openPois(peer);
    await enablePlanningEditMode(page);
    await enablePlanningEditMode(peer);

    remoteBuffer.hold = true;
    remoteBuffer.holdIncoming = true;
    await dragPointerTo(
      page
        .getByLabel("poiList-item", { exact: true })
        .filter({ hasText: "Reference POI" })
        .locator("xpath=ancestor::div[contains(@class, 'draggableItem')]")
        .first(),
      folderByName(page, "POI folder")
    );
    await expect.poll(async () => remoteBuffer.serverMessages.length).toBeGreaterThan(0);
    await expect(
      folderByName(peer, "POI folder").getByText("Reference POI", { exact: true })
    ).toHaveCount(0);

    await selectPlanningPoi(peer, "Reference POI");
    await confirmPlanningDelete(peer, "deletePoi");
    await expect.poll(async () => remoteBuffer.updates.length).toBeGreaterThan(0);
    remoteBuffer.hold = false;
    await release(remoteBuffer);
    remoteBuffer.holdIncoming = false;
    await releaseIncoming(remoteBuffer);

    await expect
      .poll(async () => {
        const doc = await mission.read();
        return (
          doc.pois[mission.ids.poiA] === undefined &&
          Object.values(doc.folders).every((folder) => !folder.items.includes(mission.ids.poiA))
        );
      })
      .toBe(true);

    const settled = await mission.read();
    expect(settled.pois[mission.ids.poiA]).toBeUndefined();
    expect(settled.stations[mission.ids.stationA]).toEqual(initial.stations[mission.ids.stationA]);
    expect(settled.stations[mission.ids.stationB]).toEqual(initial.stations[mission.ids.stationB]);
    expect(settled.actions[mission.ids.actionA].poiUuid).toBeNull();
    expect(settled.folders[keepFolder].items).toEqual([mission.ids.stationB]);
    for (const folder of Object.values(settled.folders)) {
      for (const uuid of folder.items) {
        if (folder.type === "poi") expect(settled.pois[uuid]).toBeDefined();
        if (folder.type === "station") expect(settled.stations[uuid]).toBeDefined();
      }
    }
    for (const client of [page, peer]) {
      await openStations(client);
      await expect(
        client.getByLabel("poiList-item", { exact: true }).filter({ hasText: "Reference POI" })
      ).toHaveCount(0);
      await expect(
        folderByName(client, "Unrelated folder").getByText("Bravo station", { exact: true })
      ).toHaveCount(1);
    }
  } finally {
    await peerContext.close();
  }
});
