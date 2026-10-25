import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { test, expect } from "../fixtures/behavioralTest";
import "../../../utils/loadEnv";
import { MISSION_IDS } from "../fixtures/missionSeed";
import { openExecutionInfo } from "./executionHelpers";
import {
  enablePlanningEditMode,
  planningField,
  selectPlanningStation,
  selectPlanningStationActions,
} from "./planningHelpers";
import type { MDAU } from "server/maestro/v2/types/mdau";

test.use({ scenario: "execution" });

type SocketAck = { status: "success"; message?: string } | { status: "error"; message: string };
type MissionIdentity = { [key in keyof typeof MISSION_IDS]: string };

function isolateMissionIdentity(mission: BehavioralMission): Promise<MissionIdentity> {
  return mission.read().then(async (missionDoc) => {
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
    const uniqueDoc = remap(missionDoc) as Mission;
    await mission.change((doc) => Object.assign(doc, uniqueDoc));
    return Object.fromEntries(
      Object.entries(MISSION_IDS).map(([key, uuid]) => [key, uuidMap.get(uuid) ?? uuid])
    ) as MissionIdentity;
  });
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
      { name: "Maestro execution contract", connectedAt: Date.now() },
      resolve
    );
  });
}

function subscribeToEva(socket: Socket, missionId: number, evaUuid: string): Promise<SocketAck> {
  return new Promise((resolve) => {
    socket.emit("subscribeToEva", missionId, evaUuid, resolve);
  });
}

function sendMdau(
  socket: Socket,
  missionId: number,
  mdau: MDAU.MaestroDataAegisUses
): Promise<SocketAck> {
  return new Promise((resolve) => {
    socket.emit("sendMDAU", missionId, mdau, resolve);
  });
}

async function connectMission(
  request: APIRequestContext,
  baseURL: string,
  mission: BehavioralMission,
  ids: MissionIdentity
): Promise<Socket> {
  const token = process.env.EMSS_TOKEN;
  expect(token, "Load the local EMSS token for the Maestro integration test").toBeTruthy();
  const versionResponse = await request.get("/api/v1/version");
  const version = (await versionResponse.json()) as AppVersion;
  expect(version.serverEpochUuid).toBeTruthy();
  const socket = connectMaestro(baseURL, token as string, version.serverEpochUuid);
  await waitForConnection(socket);
  expect(await joinMission(socket, mission.id)).toMatchObject({ status: "success" });
  expect(await subscribeToEva(socket, mission.id, ids.evaA)).toEqual({ status: "success" });
  expect(await subscribeToEva(socket, mission.id, ids.rexEvaA)).toEqual({ status: "success" });
  return socket;
}

function rexWire(
  ids: MissionIdentity,
  options: {
    isRunning: boolean;
    petRunning: boolean;
    petValueAtStartStop: string;
    petStartStopTimestamp: string;
    executeEditMode: RexExecuteEditMode;
    maestroControlled: boolean;
    updatedAt?: number;
  }
): MDAU.MdauRex {
  return {
    uuid: ids.rexA,
    petStartStopTimestamp: options.petStartStopTimestamp,
    petValueAtStartStop: options.petValueAtStartStop,
    petRunning: options.petRunning,
    isRunning: options.isRunning,
    maestroControlled: options.maestroControlled,
    updatedAt: options.updatedAt ?? Date.now(),
    executeEditMode: options.executeEditMode,
    maestroActivityProperties: {},
    stationEntries: {},
    traverseEntries: {},
    actionEntries: {},
  };
}

function expectedActionBaseline(ids: MissionIdentity): RexExecuteEditState {
  return {
    addedStationUuids: [],
    addedTraverseUuids: [],
    addedActionUuids: [],
    actionLetterOrderByParent: {
      [ids.rexEgressA]: [],
      [ids.rexTraverseOutbound]: [],
      [ids.rexStationA]: [ids.rexActionA],
      [ids.rexTraverseA]: [],
      [ids.rexStationABravo]: [],
      [ids.rexTraverseReturn]: [],
      [ids.rexIngressA]: [],
    },
  };
}

test("Maestro start applies policy before freeze and preserves execution identity across stop and restart", async ({
  page,
  request,
  baseURL,
  mission,
}) => {
  const ids = await isolateMissionIdentity(mission);
  await mission.change((doc) => {
    doc.rexes[ids.rexB].isRunning = false;
    doc.rexes[ids.rexA].posEntries = [];
  });
  const before = await mission.read();
  const originalOwnerId = before.rexes[ids.rexA].ownerId;
  const socket = await connectMission(request, baseURL!, mission, ids);
  const startedAt = new Date(Date.now() - 5000).toISOString();
  const eventId = `maestro-execution-${randomUUID()}`;
  const eventUrl = `https://maestro.invalid/events/${eventId}`;
  const timestamp = Date.now();
  try {
    const startResult = await sendMdau(socket, mission.id, {
      aegisEva: {
        [ids.rexEvaA]: {
          uuid: ids.rexEvaA,
          name: "Survey Alpha execution",
          maestroEventId: eventId,
          maestroEventUrl: eventUrl,
          sequence: before.evas[ids.rexEvaA].sequence,
          datetime: timestamp,
          updatedAt: timestamp,
        },
      },
      aegisRexes: {
        [ids.rexA]: rexWire(ids, {
          isRunning: true,
          petRunning: true,
          petValueAtStartStop: "+00:00:00",
          petStartStopTimestamp: startedAt,
          executeEditMode: "limited",
          maestroControlled: true,
          updatedAt: timestamp,
        }),
      },
    });
    expect(startResult).toEqual({ status: "success" });

    const afterStart = await mission.read();
    const firstRex = afterStart.rexes[ids.rexA];
    expect(firstRex).toMatchObject({
      uuid: ids.rexA,
      evaUuid: ids.rexEvaA,
      ownerId: originalOwnerId,
      isRunning: true,
      petRunning: true,
      petValueAtStartStop: "+00:00:00",
      maestroControlled: true,
      executeEditMode: "limited",
      maestroEventId: eventId,
      maestroEventUrl: eventUrl,
      executeEditState: expectedActionBaseline(ids),
    });
    expect(afterStart.rexes[ids.rexB].isRunning).toBe(false);
    expect(firstRex.posEntries).toHaveLength(before.rexes[ids.rexA].posSources.length);
    expect(firstRex.posEntries?.map((entry) => entry.posSourceUuid)).toEqual(
      before.rexes[ids.rexA].posSources.map((source) => source.uuid)
    );
    expect(firstRex.posEntries?.every((entry) => entry.petSeconds === 0)).toBe(true);

    await mission.open(page);
    await openExecutionInfo(page, "Survey Alpha", ids.rexEvaA);
    await expect(
      page.getByText("Execute Edit Mode:", { exact: true }).locator("../..")
    ).toContainText("Limited Editing");
    await expect(page.getByText("Clock controlled by Maestro", { exact: true })).toBeVisible();

    const stoppedAt = Date.now();
    expect(
      await sendMdau(socket, mission.id, {
        aegisRexes: {
          [ids.rexA]: rexWire(ids, {
            isRunning: false,
            petRunning: false,
            petValueAtStartStop: "+00:07:00",
            petStartStopTimestamp: new Date(stoppedAt).toISOString(),
            executeEditMode: "none",
            maestroControlled: false,
            updatedAt: stoppedAt,
          }),
        },
      })
    ).toEqual({ status: "success" });
    await expect.poll(async () => (await mission.read()).rexes[ids.rexA].isRunning).toBe(false);
    const afterStop = (await mission.read()).rexes[ids.rexA];
    expect(afterStop).toMatchObject({
      isRunning: false,
      petRunning: false,
      petValueAtStartStop: "+00:07:00",
      maestroControlled: false,
      executeEditMode: "limited",
      maestroEventId: eventId,
      maestroEventUrl: eventUrl,
      ownerId: originalOwnerId,
      executeEditState: expectedActionBaseline(ids),
    });
    await expect(
      page.getByTestId("rex-pet-clock").locator('input[aria-label="PET Timer"]')
    ).toHaveValue("+00:07:00");

    const restartedAt = Date.now();
    expect(
      await sendMdau(socket, mission.id, {
        aegisEva: {
          [ids.rexEvaA]: {
            uuid: ids.rexEvaA,
            name: "Survey Alpha execution",
            maestroEventId: eventId,
            maestroEventUrl: eventUrl,
            sequence: afterStart.evas[ids.rexEvaA].sequence,
            datetime: timestamp,
            updatedAt: restartedAt,
          },
        },
        aegisRexes: {
          [ids.rexA]: rexWire(ids, {
            isRunning: true,
            petRunning: true,
            petValueAtStartStop: "+00:00:00",
            petStartStopTimestamp: new Date(restartedAt - 5000).toISOString(),
            executeEditMode: "none",
            maestroControlled: true,
            updatedAt: restartedAt,
          }),
        },
      })
    ).toEqual({ status: "success" });
    await expect.poll(async () => (await mission.read()).rexes[ids.rexA].isRunning).toBe(true);
    const afterRestart = (await mission.read()).rexes[ids.rexA];
    expect(afterRestart).toMatchObject({
      uuid: ids.rexA,
      evaUuid: ids.rexEvaA,
      ownerId: originalOwnerId,
      isRunning: true,
      petRunning: true,
      maestroControlled: true,
      executeEditMode: "limited",
      maestroEventId: eventId,
      maestroEventUrl: eventUrl,
      executeEditState: expectedActionBaseline(ids),
    });
    expect(afterRestart.posEntries?.map((entry) => entry.uuid)).toEqual(
      firstRex.posEntries?.map((entry) => entry.uuid)
    );
    await expect(page.getByText("Clock controlled by Maestro", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Execute Edit Mode:", { exact: true }).locator("../..")
    ).toContainText("Limited Editing");
  } finally {
    socket.disconnect();
  }
});

test("Maestro preserves paused zero, running PET sentinel, and null, zero, and manual durations", async ({
  page,
  request,
  baseURL,
  mission,
}) => {
  const ids = await isolateMissionIdentity(mission);
  await mission.change((doc) => {
    doc.rexes[ids.rexB].isRunning = false;
  });
  const socket = await connectMission(request, baseURL!, mission, ids);
  try {
    const pausedAt = Date.now();
    const paused = await sendMdau(socket, mission.id, {
      aegisStations: {
        [ids.stationA]: {
          uuid: ids.stationA,
          name: "Alpha station",
          duration: null,
          actionOrderUuids: [ids.actionA],
          updatedAt: pausedAt,
        },
      },
      aegisTraverse: {
        [ids.traverseA]: {
          uuid: ids.traverseA,
          duration: 0,
          actionOrderUuids: [],
          updatedAt: pausedAt,
        },
      },
      aegisAction: {
        [ids.actionA]: {
          uuid: ids.actionA,
          name: "Sample regolith",
          descriptionTask: null,
          duration: 17,
          actionDefinition: null,
          missionPriorityUuid: null,
          stmAction: false,
          actors: ["EV1"],
          enabled: true,
          updatedAt: pausedAt,
        },
      },
      aegisRexes: {
        [ids.rexA]: rexWire(ids, {
          isRunning: true,
          petRunning: false,
          petValueAtStartStop: "+00:00:00",
          petStartStopTimestamp: new Date(pausedAt).toISOString(),
          executeEditMode: "unrestricted",
          maestroControlled: false,
          updatedAt: pausedAt,
        }),
      },
    });
    expect(paused).toEqual({ status: "success" });
    const pausedGraph = await mission.read();
    expect(pausedGraph.rexes[ids.rexA]).toMatchObject({
      isRunning: true,
      petRunning: false,
      petValueAtStartStop: "+00:00:00",
    });
    expect(pausedGraph.stations[ids.stationA].duration).toBeNull();
    expect(pausedGraph.traverses[ids.traverseA].duration).toBe(0);
    expect(pausedGraph.actions[ids.actionA].duration).toBe(17);

    await mission.open(page);
    await enablePlanningEditMode(page);
    await openExecutionInfo(page, "Survey Alpha", ids.rexEvaA);
    await expect(
      page.getByTestId("rex-pet-clock").locator('input[aria-label="PET Timer"]')
    ).toHaveValue("+00:00:00");

    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();
    await expect(page.getByText(/Using Calculated Total Dwell Time:/)).toBeVisible();
    const zeroUpdate = Date.now();
    expect(
      await sendMdau(socket, mission.id, {
        aegisStations: {
          [ids.stationA]: {
            uuid: ids.stationA,
            name: "Alpha station",
            duration: 0,
            actionOrderUuids: [ids.actionA],
            updatedAt: zeroUpdate,
          },
        },
      })
    ).toEqual({ status: "success" });
    await expect.poll(async () => (await mission.read()).stations[ids.stationA].duration).toBe(0);
    await expect(page.getByLabel("Time in minutes", { exact: true }).last()).toHaveText("0");
    await expect(page.getByText(/Using Calculated Total Dwell Time:/)).toHaveCount(0);

    await selectPlanningStationActions(page, "Alpha station");
    const action = page
      .getByRole("listitem")
      .filter({ has: planningField(page, "Action Name").filter({ hasText: "Sample regolith" }) });
    await expect(action).toBeVisible();
    await action.locator('svg[data-icon="caret-right"]').click();
    await expect(planningField(page, "Duration in minutes")).toHaveText("17");

    const runningAt = Date.now() - 30000;
    expect(
      await sendMdau(socket, mission.id, {
        aegisRexes: {
          [ids.rexA]: rexWire(ids, {
            isRunning: true,
            petRunning: true,
            petValueAtStartStop: "+00:00:00",
            petStartStopTimestamp: new Date(runningAt).toISOString(),
            executeEditMode: "unrestricted",
            maestroControlled: false,
            updatedAt: Date.now(),
          }),
        },
      })
    ).toEqual({ status: "success" });
    await expect.poll(async () => (await mission.read()).rexes[ids.rexA].petRunning).toBe(true);
    const runningClock = page.getByTestId("header-pet-clock");
    await expect(runningClock).toContainText(/\+00:00:(?:3[0-9]|4[0-9])/);
    expect((await mission.read()).rexes[ids.rexA].petValueAtStartStop).toBe("+00:00:00");
  } finally {
    socket.disconnect();
  }
});
