import { randomUUID } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { test, expect } from "../fixtures/behavioralTest";
import "../../../utils/loadEnv";
import { MISSION_IDS } from "../fixtures/missionSeed";
import { installMapObserver, readMapFeatures } from "../fixtures/mapAssertions";
import type { MDAU } from "server/maestro/v2/types/mdau";

test.use({ scenario: "execution" });

type Identity = { [key in keyof typeof MISSION_IDS]: string };
type SocketAck = { status: "success"; message?: string } | { status: "error"; message: string };

async function isolateMissionIdentity(mission: BehavioralMission): Promise<Identity> {
  const missionDoc = await mission.read();
  const fixtureUuids = new Set<string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if ((key === "uuid" || key === "refUuid") && typeof nested === "string") {
        fixtureUuids.add(nested);
      }
      collect(nested);
    }
  };
  collect(missionDoc);
  const uuidMap = new Map([...fixtureUuids].map((uuid) => [uuid, randomUUID()]));
  const remap = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [uuidMap.get(key) ?? key, remap(nested)])
      );
    }
    return typeof value === "string" ? (uuidMap.get(value) ?? value) : value;
  };
  await mission.change((doc) => Object.assign(doc, remap(missionDoc)));
  return Object.fromEntries(
    Object.entries(MISSION_IDS).map(([key, uuid]) => [key, uuidMap.get(uuid) ?? uuid])
  ) as Identity;
}

async function serverTimeMs(request: APIRequestContext): Promise<number> {
  const response = await request.get("/api/v1/time");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { time: string };
  return Date.parse(body.time);
}

function connectMaestro(baseURL: string, token: string, serverEpochUuid: string): Socket {
  return io(`${new URL(baseURL).origin}/maestro/v2`, {
    path: "/api/socket",
    transports: ["websocket"],
    reconnection: false,
    timeout: 10000,
    auth: { token },
    query: { serverEpochUuid },
  });
}

async function waitForConnection(socket: Socket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out connecting Maestro client")), 10000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function joinMission(socket: Socket, missionId: number): Promise<SocketAck> {
  return new Promise((resolve) => {
    socket.emit(
      "missionJoin",
      missionId,
      { name: "Maestro completion contract", connectedAt: Date.now() },
      resolve
    );
  });
}

function subscribeToEva(socket: Socket, missionId: number, evaUuid: string): Promise<SocketAck> {
  return new Promise((resolve) => socket.emit("subscribeToEva", missionId, evaUuid, resolve));
}

function sendMdau(
  socket: Socket,
  missionId: number,
  mdau: MDAU.MaestroDataAegisUses
): Promise<SocketAck> {
  return new Promise((resolve) => socket.emit("sendMDAU", missionId, mdau, resolve));
}

async function connectMaestroMission(
  request: APIRequestContext,
  baseURL: string,
  missionId: number,
  evaUuid: string
): Promise<Socket> {
  const token = process.env.EMSS_TOKEN;
  expect(token, "Load the local EMSS token for the Maestro integration test").toBeTruthy();
  const versionResponse = await request.get("/api/v1/version");
  const version = (await versionResponse.json()) as AppVersion;
  expect(version.serverEpochUuid).toBeTruthy();
  const socket = connectMaestro(baseURL, token as string, version.serverEpochUuid);
  await waitForConnection(socket);
  expect(await joinMission(socket, missionId)).toMatchObject({ status: "success" });
  expect(await subscribeToEva(socket, missionId, evaUuid)).toEqual({ status: "success" });
  return socket;
}

async function selectExecution(page: Page, evaName: string, rexEvaUuid: string) {
  await page.getByLabel("evas Section", { exact: true }).click();
  const showAll = page.getByLabel("Show All EVAs", { exact: true });
  if (await showAll.isVisible()) await showAll.click();
  const row = page.getByLabel("evaList-item", { exact: true }).filter({ hasText: evaName });
  await row.locator("select").selectOption(rexEvaUuid);
  return row;
}

async function openExecutionInfo(page: Page, evaName: string, rexEvaUuid: string): Promise<void> {
  await selectExecution(page, evaName, rexEvaUuid);
  await page.getByLabel("rex_info_panel", { exact: true }).click();
}

function parseSignedHms(value: string): number {
  const [hours, minutes, seconds] = value.split(":");
  const sign = hours.startsWith("-") ? -1 : 1;
  return sign * (Number(hours.slice(1)) * 3600 + Number(minutes) * 60 + Number(seconds));
}

function expectWithinServerWindow(
  displayed: number,
  serverBeforeMs: number,
  serverAfterMs: number,
  startedAtMs: number,
  basePetSeconds: number
): void {
  const lowerPet = basePetSeconds + Math.floor((serverBeforeMs - startedAtMs) / 1000);
  const upperPet = basePetSeconds + Math.ceil((serverAfterMs - startedAtMs) / 1000);
  expect(displayed).toBeGreaterThanOrEqual(lowerPet - 1);
  expect(displayed).toBeLessThanOrEqual(upperPet + 1);
}

function expectAgeWithinServerWindow(
  displayedAge: number,
  serverBeforeMs: number,
  serverAfterMs: number,
  startedAtMs: number,
  basePetSeconds: number,
  positionPetSeconds: number
): void {
  const lowerPet = basePetSeconds + Math.floor((serverBeforeMs - startedAtMs) / 1000);
  const upperPet = basePetSeconds + Math.ceil((serverAfterMs - startedAtMs) / 1000);
  expect(displayedAge).toBeGreaterThanOrEqual(Math.max(0, lowerPet - positionPetSeconds) - 1);
  expect(displayedAge).toBeLessThanOrEqual(Math.max(0, upperPet - positionPetSeconds) + 1);
}

async function displayedPositionAge(page: Page, positionUuid: string): Promise<number> {
  const feature = await expect
    .poll(async () =>
      (await readMapFeatures(page)).find(
        (item) => item.id === `pos-${positionUuid}` && item.visible && item.labelType === "pos"
      )
    )
    .toBeTruthy()
    .then(async () =>
      (await readMapFeatures(page)).find(
        (item) => item.id === `pos-${positionUuid}` && item.visible && item.labelType === "pos"
      )!
    );
  return parseSignedHms(feature.name.split(" / ")[0]);
}

test("Maestro 100 percent crew completion overrides display while retaining the stored status", async ({
  page,
  request,
  baseURL,
  mission,
}) => {
  const ids = await isolateMissionIdentity(mission);
  const socket = await connectMaestroMission(request, baseURL!, mission.id, ids.rexEvaB);
  try {
    const before = (await mission.read()).rexes[ids.rexB];
    const updatedAt = Date.now();
    const result = await sendMdau(socket, mission.id, {
      aegisRexes: {
        [ids.rexB]: {
          uuid: ids.rexB,
          petStartStopTimestamp: before.petStartStopTimestamp,
          petValueAtStartStop: before.petValueAtStartStop,
          petRunning: before.petRunning,
          isRunning: true,
          maestroControlled: true,
          updatedAt,
          executeEditMode: before.executeEditMode,
          maestroActivityProperties: {},
          stationEntries: {
            [ids.rexStationB]: {
              rexStatus: "pending",
              maestroPercentCompleteEv1: 100,
              maestroPercentCompleteEv2: 100,
            },
          },
          traverseEntries: {},
          actionEntries: {},
        },
      },
    });
    expect(result).toEqual({ status: "success" });
    await expect
      .poll(async () => (await mission.read()).rexes[ids.rexB].stationEntries?.[ids.rexStationB])
      .toEqual({
        rexStatus: "pending",
        maestroPercentCompleteEv1: 100,
        maestroPercentCompleteEv2: 100,
      });

    await mission.open(page);
    const row = await selectExecution(page, "Survey Bravo", ids.rexEvaB);
    const completedStatus = row
      .getByText("Bravo station", { exact: true })
      .locator("xpath=ancestor::div[./div[contains(@class,'rexStatusWrapper')]][1]")
      .locator('[class*="rexStatusWrapper"]');
    await expect(completedStatus).toHaveAttribute("data-tooltip-content", "Complete");
    await expect(row.locator('[class*="headingCompleted"]')).toHaveCount(1);
    expect((await mission.read()).rexes[ids.rexB].stationEntries?.[ids.rexStationB].rexStatus).toBe(
      "pending"
    );

    await page.goto(mission.dashboardUrl);
    const dashboardActivity = page
      .locator('div[class*="activityIndicator"]:not([class*="activityIndicators"])')
      .nth(2);
    await expect(dashboardActivity).toHaveCount(1);
    await expect
      .poll(() =>
        dashboardActivity.evaluate((element) => (element as HTMLElement).style.backgroundColor)
      )
      .toBe("var(--grey4)");
    expect((await mission.read()).rexes[ids.rexB].stationEntries?.[ids.rexStationB].rexStatus).toBe(
      "pending"
    );
  } finally {
    socket.disconnect();
  }
});

for (const { name, skewMs } of [
  { name: "positive", skewMs: 120_000 },
  { name: "negative", skewMs: -120_000 },
]) {
  test(`real server-time correction applies once with ${name} client clock skew across PET boundary reconnect`, async ({
    page,
    request,
    mission,
  }) => {
    const ids = await isolateMissionIdentity(mission);
    const startedAtMs = await serverTimeMs(request);
    const startedAtIso = new Date(startedAtMs).toISOString();
    const basePetSeconds = 3590;
    const positionPetSeconds = 3585;
    await mission.change((doc) => {
      const rex = doc.rexes[ids.rexB];
      rex.isRunning = true;
      rex.petRunning = true;
      rex.petStartStopTimestamp = startedAtIso;
      rex.petValueAtStartStop = "+00:59:50";
      rex.posEntries[0].petSeconds = positionPetSeconds;
    });

    await page.addInitScript((offset) => {
      const nativeDateNow = Date.now.bind(Date);
      Date.now = () => nativeDateNow() + offset;
    }, skewMs);
    await installMapObserver(page);
    await mission.open(page);
    await expect
      .poll(() => page.evaluate(() => Math.sign(Number(sessionStorage.getItem("timeOffsetMs")))))
      .toBe(Math.sign(skewMs));
    const firstOffset = await page.evaluate(() => Number(sessionStorage.getItem("timeOffsetMs")));
    expect(Math.abs(firstOffset - skewMs)).toBeLessThan(3000);
    await openExecutionInfo(page, "Survey Bravo", ids.rexEvaB);

    const firstServerBefore = await serverTimeMs(request);
    const firstPet = parseSignedHms(
      (await page.getByTestId("header-pet-clock").innerText()).trim()
    );
    const firstAge = await displayedPositionAge(page, ids.posB);
    const firstServerAfter = await serverTimeMs(request);
    expectWithinServerWindow(
      firstPet,
      firstServerBefore,
      firstServerAfter,
      startedAtMs,
      basePetSeconds
    );
    expectAgeWithinServerWindow(
      firstAge,
      firstServerBefore,
      firstServerAfter,
      startedAtMs,
      basePetSeconds,
      positionPetSeconds
    );

    await expect
      .poll(async () => {
        const serverNow = await serverTimeMs(request);
        return serverNow >= startedAtMs + 10_000;
      })
      .toBe(true);
    const boundaryServerTime = await serverTimeMs(request);
    expect(boundaryServerTime).toBeGreaterThanOrEqual(startedAtMs + 10_000);

    await page.reload();
    await openExecutionInfo(page, "Survey Bravo", ids.rexEvaB);
    await expect
      .poll(() => page.evaluate(() => Math.sign(Number(sessionStorage.getItem("timeOffsetMs")))))
      .toBe(Math.sign(skewMs));
    const reconnectedOffset = await page.evaluate(() =>
      Number(sessionStorage.getItem("timeOffsetMs"))
    );
    expect(Math.abs(reconnectedOffset - skewMs)).toBeLessThan(3000);

    const secondServerBefore = await serverTimeMs(request);
    const secondPet = parseSignedHms(
      (await page.getByTestId("header-pet-clock").innerText()).trim()
    );
    const secondAge = await displayedPositionAge(page, ids.posB);
    const secondServerAfter = await serverTimeMs(request);
    expect(secondPet).toBeGreaterThanOrEqual(3600);
    expectWithinServerWindow(
      secondPet,
      secondServerBefore,
      secondServerAfter,
      startedAtMs,
      basePetSeconds
    );
    expectAgeWithinServerWindow(
      secondAge,
      secondServerBefore,
      secondServerAfter,
      startedAtMs,
      basePetSeconds,
      positionPetSeconds
    );
  });
}
