import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { WebSocketRoute } from "@playwright/test";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { test, expect } from "../fixtures/behavioralTest";

const terrainFile = "coverage90-switch-dem.tif";

test("switching missions isolates delayed document, terrain, and socket updates", async ({
  page,
  request,
  baseURL,
  mission,
}) => {
  const staticRoot = path.resolve(process.env.STATIC_DIR ?? "");
  const oldTerrainPath = path.join(staticRoot, "missionFiles", String(mission.id), terrainFile);
  await mkdir(path.dirname(oldTerrainPath), { recursive: true });
  await copyFile(
    path.resolve("src/tests/vitest/fixtures/raster/mission50-golden-tiled.tif"),
    oldTerrainPath
  );

  const oldDocName = `Old mission edit ${mission.id}`;
  await mission.change((doc) => {
    doc.demFilePath = terrainFile;
    doc.demResolution = 50;
    doc.name = `Switch source ${mission.id}`;
  });

  const created = await request.post("/api/v1/missionAutomerge", { data: {} });
  expect(created.ok()).toBe(true);
  const listing = ((await created.json()) as WrappedResponse<AutomergeDocListing>).data;
  const nextMissionId = listing.missionId;
  const nextName = `Switch target ${nextMissionId}`;
  const renamed = await request.post("/api/v1/missionAutomerge/fields", {
    data: { missionId: nextMissionId, fields: { name: nextName } },
  });
  expect(renamed.ok()).toBe(true);

  const versionResponse = await request.get("/api/v1/version");
  expect(versionResponse.ok()).toBe(true);
  const version = (await versionResponse.json()) as AppVersion;
  const origin = new URL(baseURL ?? "http://localhost:4000");
  const socketUrl = new URL("/api/automergeSocket/", origin);
  socketUrl.protocol = origin.protocol === "https:" ? "wss:" : "ws:";
  socketUrl.searchParams.set("serverEpochUuid", version.serverEpochUuid);
  const peerRepo = new Repo({ network: [new WebSocketClientAdapter(socketUrl.toString())] });
  const oldPeer = await peerRepo.find<Mission>(mission.docUrl as AutomergeUrl);
  const nextPeer = await peerRepo.find<Mission>(listing.automergeUrl as AutomergeUrl);

  let oldSocket: WebSocketRoute | undefined;
  let holdOldFrames = false;
  const oldFrames: (string | Buffer)[] = [];
  await page.routeWebSocket(/\/api\/automergeSocket\//, (socket) => {
    const upstream = socket.connectToServer();
    if (!oldSocket) oldSocket = socket;
    socket.onMessage((message) => upstream.send(message));
    upstream.onMessage((message) => {
      if (socket === oldSocket && holdOldFrames) oldFrames.push(message);
      else socket.send(message);
    });
  });

  let releaseTerrain!: () => void;
  let terrainStarted!: () => void;
  const terrainGate = new Promise<void>((resolve) => {
    releaseTerrain = resolve;
  });
  const terrainObserved = new Promise<void>((resolve) => {
    terrainStarted = resolve;
  });
  let heldTerrainResponses = 0;
  await page.route("**/api/v1/terrain-profile?**", async (route) => {
    heldTerrainResponses++;
    terrainStarted();
    await terrainGate;
    await route.continue();
  });

  try {
    await mission.open(page);
    await page.locator('[data-tooltip-content="Measurements"]').click();
    await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
    const editorMap = page.locator(".ol-viewport").first();
    const mapBounds = await editorMap.boundingBox();
    expect(mapBounds).not.toBeNull();
    await page.mouse.move(
      mapBounds!.x + mapBounds!.width * 0.45,
      mapBounds!.y + mapBounds!.height * 0.48
    );
    await page.mouse.down();
    await page.mouse.move(
      mapBounds!.x + mapBounds!.width * 0.6,
      mapBounds!.y + mapBounds!.height * 0.55,
      {
        steps: 5,
      }
    );
    await page.mouse.up();
    await terrainObserved;

    holdOldFrames = true;
    oldPeer.change((doc) => {
      doc.description = oldDocName;
    });
    await expect.poll(async () => (await mission.read()).description).toBe(oldDocName);
    await expect.poll(() => oldFrames.length).toBeGreaterThan(0);

    const targetMarker = `Independent target update ${nextMissionId}`;
    nextPeer.change((doc) => {
      doc.description = targetMarker;
    });
    await expect
      .poll(async () => {
        const response = await request.get(`/api/v1/missionDump?missionId=${nextMissionId}`);
        expect(response.ok()).toBe(true);
        const body = (await response.json()) as WrappedResponse<MissionDump>;
        return body.data.missionData.mission.description;
      })
      .toBe(targetMarker);

    await page.goto("/");
    await page
      .locator("tr")
      .filter({ has: page.getByText(nextName, { exact: true }) })
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(nextName);
    await expect(page.getByText(oldDocName, { exact: true })).toHaveCount(0);

    releaseTerrain();
    await expect
      .poll(async () => {
        const response = await request.get(`/api/v1/missionDump?missionId=${mission.id}`);
        expect(response.ok()).toBe(true);
        const body = (await response.json()) as WrappedResponse<MissionDump>;
        return body.data.missionData.mission.description;
      })
      .toBe(oldDocName);
    await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(nextName);
    await expect(page.getByText(oldDocName, { exact: true })).toHaveCount(0);

    // Release the actual server protocol frames captured from the old subscription after the switch.
    for (const frame of oldFrames.splice(0)) {
      try {
        oldSocket?.send(frame);
      } catch {
        // A completed mission switch closes the old client socket; queued frames remain stale.
      }
    }
    expect(heldTerrainResponses).toBeGreaterThan(0);

    const oldFinal = await mission.read();
    expect(oldFinal.description).toBe(oldDocName);
    const targetRead = await request.get(`/api/v1/missionDump?missionId=${nextMissionId}`);
    expect(targetRead.ok()).toBe(true);
    const targetFinal = ((await targetRead.json()) as WrappedResponse<MissionDump>).data.missionData
      .mission;
    expect(targetFinal.description).toBe(targetMarker);
    expect(targetFinal.name).toBe(nextName);
  } finally {
    releaseTerrain();
    await peerRepo.shutdown();
    const deleted = await request.delete("/api/v1/missionAutomerge", {
      data: { missionIds: [nextMissionId] },
    });
    expect(deleted.ok()).toBe(true);
    await rm(oldTerrainPath, { force: true });
  }
});
