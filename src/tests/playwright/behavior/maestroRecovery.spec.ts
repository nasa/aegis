import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { test, expect } from "../fixtures/behavioralTest";
import "../../../utils/loadEnv";
import { MISSION_IDS } from "../fixtures/missionSeed";
import { seedAction } from "../fixtures/entitySeeds";
import { planningEvaRow, selectPlanningEva, selectPlanningStationActions } from "./planningHelpers";
import type { AegisSlice as MaestroAegisSlice } from "server/maestro/v2/types/aegisSlice";
import type { ExecuteUuidMap } from "server/maestro/v2/types/socketioMaestro";
import type { MDAU } from "server/maestro/v2/types/mdau";

test.use({ scenario: "execution" });

type SocketAck = { status: "success"; message?: string } | { status: "error"; message: string };
type MissionIdentity = { [key in keyof typeof MISSION_IDS]: string };
type RecoveryIdentity = MissionIdentity & { plannedSecondAction: string; rexSecondAction: string };
type EverythingAck =
  | { status: "success"; message: string; data: MaestroAegisSlice.AegisSlice }
  | { status: "error"; message: string };
type ExecuteUuidAck =
  { status: "success"; executeUuidMap: ExecuteUuidMap } | { status: "error"; message: string };

async function isolateMissionIdentity(mission: BehavioralMission): Promise<MissionIdentity> {
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
  ) as MissionIdentity;
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
      { name: "Maestro recovery contract", connectedAt: Date.now() },
      resolve
    );
  });
}

function subscribeToEva(socket: Socket, missionId: number, evaUuid: string): Promise<SocketAck> {
  return new Promise((resolve) => socket.emit("subscribeToEva", missionId, evaUuid, resolve));
}

function getEverything(socket: Socket, missionId: number): Promise<EverythingAck> {
  return new Promise((resolve) => socket.emit("getEverything", missionId, resolve));
}

function getExecuteUuids(
  socket: Socket,
  missionId: number,
  rexUuid: string
): Promise<ExecuteUuidAck> {
  return new Promise((resolve) => socket.emit("getExecuteUuids", missionId, rexUuid, resolve));
}

function sendMdau(
  socket: Socket,
  missionId: number,
  mdau: MDAU.MaestroDataAegisUses
): Promise<SocketAck> {
  return new Promise((resolve) => socket.emit("sendMDAU", missionId, mdau, resolve));
}

async function connectMission(
  request: APIRequestContext,
  baseURL: string,
  missionId: number,
  evas: string[]
): Promise<Socket> {
  const token = process.env.EMSS_TOKEN;
  expect(token, "Load the local EMSS token for the Maestro integration test").toBeTruthy();
  const versionResponse = await request.get("/api/v1/version");
  const version = (await versionResponse.json()) as AppVersion;
  expect(version.serverEpochUuid).toBeTruthy();
  const socket = connectMaestro(baseURL, token as string, version.serverEpochUuid);
  await waitForConnection(socket);
  expect(await joinMission(socket, missionId)).toMatchObject({ status: "success" });
  for (const evaUuid of evas) {
    expect(await subscribeToEva(socket, missionId, evaUuid)).toEqual({ status: "success" });
  }
  return socket;
}

function waitForDataAll(socket: Socket): Promise<MaestroAegisSlice.AegisSlice> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for Maestro dataAll")),
      12000
    );
    socket.once("dataAll", (data: MaestroAegisSlice.AegisSlice) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test("Maestro resolves concurrent traverse names, action order, and concrete lineage IDs", async ({
  page,
  request,
  baseURL,
  mission,
}) => {
  const ids = await isolateMissionIdentity(mission);
  const additionalIds = { plannedSecondAction: randomUUID(), rexSecondAction: randomUUID() };
  const lineages: RecoveryIdentity = { ...ids, ...additionalIds };
  const sharedActionRefUuid = randomUUID();
  const secondPlannedAction = seedAction({
    ...structuredClone((await mission.read()).actions[ids.actionA]),
    uuid: lineages.plannedSecondAction,
    refUuid: sharedActionRefUuid,
    name: "Second sampling task",
    description: "Second linked action used to verify concrete and lineage identifiers",
    stationUuid: ids.stationA,
    duration: 9,
  });
  const secondRexAction = seedAction({
    ...structuredClone((await mission.read()).actions[ids.rexActionA]),
    uuid: lineages.rexSecondAction,
    refUuid: sharedActionRefUuid,
    name: "Second sampling task",
    description: "Second linked action used to verify concrete and lineage identifiers",
    stationUuid: ids.rexStationA,
    duration: 9,
  });
  await mission.change((doc) => {
    doc.actions[lineages.plannedSecondAction] = secondPlannedAction;
    doc.actions[lineages.rexSecondAction] = secondRexAction;
    doc.stations[ids.stationA].actionOrderUuids = [lineages.plannedSecondAction, ids.actionA];
    doc.stations[ids.rexStationA].actionOrderUuids = [lineages.rexSecondAction, ids.rexActionA];
    doc.rexes[ids.rexB].isRunning = false;
  });

  const before = await mission.read();
  const socket = await connectMission(request, baseURL!, mission.id, [ids.evaA, ids.rexEvaA]);
  try {
    const returnedMap = await getExecuteUuids(socket, mission.id, ids.rexA);
    expect(returnedMap).toEqual({
      status: "success",
      executeUuidMap: {
        eva: { [ids.evaA]: ids.rexEvaA },
        station: {
          [ids.egressA]: ids.rexEgressA,
          [ids.stationA]: ids.rexStationA,
          [ids.stationB]: ids.rexStationABravo,
          [ids.ingressA]: ids.rexIngressA,
        },
        traverse: {
          [ids.traverseOutbound]: ids.rexTraverseOutbound,
          [ids.traverseA]: ids.rexTraverseA,
          [ids.traverseReturn]: ids.rexTraverseReturn,
        },
        action: {
          [ids.actionA]: ids.rexActionA,
          [lineages.plannedSecondAction]: lineages.rexSecondAction,
        },
      },
    });

    const updatedAt = Date.now();
    const updatedNames = {
      outboundEndpoint: "Apex endpoint renamed in the same MDAU",
      inboundEndpoint: "Boreal endpoint renamed in the same MDAU",
    };
    const result = await sendMdau(socket, mission.id, {
      aegisStations: {
        [ids.rexStationABravo]: {
          uuid: ids.rexStationABravo,
          name: updatedNames.inboundEndpoint,
          duration: before.stations[ids.rexStationABravo].duration,
          actionOrderUuids: [],
          updatedAt,
        },
        [ids.stationB]: {
          uuid: ids.stationB,
          name: updatedNames.inboundEndpoint,
          duration: before.stations[ids.stationB].duration,
          actionOrderUuids: [],
          updatedAt,
        },
        [ids.rexStationA]: {
          uuid: ids.rexStationA,
          name: updatedNames.outboundEndpoint,
          duration: before.stations[ids.rexStationA].duration,
          actionOrderUuids: [lineages.rexSecondAction, ids.rexActionA],
          updatedAt,
        },
        [ids.stationA]: {
          uuid: ids.stationA,
          name: updatedNames.outboundEndpoint,
          duration: before.stations[ids.stationA].duration,
          actionOrderUuids: [lineages.plannedSecondAction, ids.actionA],
          updatedAt,
        },
      },
    });
    expect(result).toEqual({ status: "success" });
    await expect
      .poll(async () => (await mission.read()).stations[ids.stationA].name)
      .toBe(updatedNames.outboundEndpoint);
    const persisted = await mission.read();
    expect(persisted.stations[ids.stationA].name).toBe(updatedNames.outboundEndpoint);
    expect(persisted.stations[ids.rexStationA].name).toBe(updatedNames.outboundEndpoint);
    expect(persisted.stations[ids.stationB].name).toBe(updatedNames.inboundEndpoint);
    expect(persisted.stations[ids.rexStationABravo].name).toBe(updatedNames.inboundEndpoint);
    expect(persisted.stations[ids.stationA].actionOrderUuids).toEqual([
      lineages.plannedSecondAction,
      ids.actionA,
    ]);
    expect(persisted.stations[ids.rexStationA].actionOrderUuids).toEqual([
      lineages.rexSecondAction,
      ids.rexActionA,
    ]);

    await mission.open(page);
    await selectPlanningEva(page, "Survey Alpha");
    const evaRow = planningEvaRow(page, "Survey Alpha");
    await expect(evaRow.getByText(updatedNames.outboundEndpoint, { exact: true })).toBeVisible();
    await expect(evaRow.getByText(updatedNames.inboundEndpoint, { exact: true })).toBeVisible();
    await selectPlanningStationActions(page, updatedNames.outboundEndpoint);
    const secondActionRow = page.getByRole("listitem").filter({
      has: page.getByText("Second sampling task", { exact: true }),
    });
    const originalActionRow = page.getByRole("listitem").filter({
      has: page.getByText("Sample regolith", { exact: true }),
    });
    await expect(secondActionRow).toHaveCount(1);
    await expect(originalActionRow).toHaveCount(1);
    const secondActionBox = await secondActionRow.boundingBox();
    const originalActionBox = await originalActionRow.boundingBox();
    expect(secondActionBox).not.toBeNull();
    expect(originalActionBox).not.toBeNull();
    expect(secondActionBox!.y).toBeLessThan(originalActionBox!.y);
  } finally {
    socket.disconnect();
  }
});

test("Maestro disconnect, rejection, reconnect snapshot, and timestamp-only updates follow delivery acknowledgements", async ({
  request,
  baseURL,
  mission,
}) => {
  const ids = await isolateMissionIdentity(mission);
  await mission.change((doc) => {
    doc.rexes[ids.rexB].isRunning = false;
  });
  const before = await mission.read();
  const disconnectedClient = await connectMission(request, baseURL!, mission.id, [ids.evaA]);
  disconnectedClient.disconnect();

  let disconnectedAckReceived = false;
  disconnectedClient.emit(
    "sendMDAU",
    mission.id,
    {
      aegisStations: {
        [ids.stationA]: {
          uuid: ids.stationA,
          name: "Must not arrive after disconnect",
          duration: 31,
          actionOrderUuids: [ids.actionA],
          updatedAt: Date.now(),
        },
      },
    },
    () => {
      disconnectedAckReceived = true;
    }
  );
  await wait(700);
  expect(disconnectedAckReceived).toBe(false);
  expect(await mission.read()).toEqual(before);

  const reconnectedClient = await connectMission(request, baseURL!, mission.id, [ids.evaA]);
  try {
    const resync = await getEverything(reconnectedClient, mission.id);
    expect(resync.status).toBe("success");
    if (resync.status !== "success") throw new Error("Maestro reconnect resync failed");
    expect(resync.data.aegisStations[ids.stationA]).toMatchObject({
      uuid: ids.stationA,
      name: before.stations[ids.stationA].name,
    });

    const invalidResult = await sendMdau(reconnectedClient, mission.id, {
      aegisStations: {
        [ids.stationA]: {
          uuid: ids.stationA,
          name: "Rejected after send",
          duration: "invalid" as unknown as number,
          actionOrderUuids: [ids.actionA],
          updatedAt: Date.now(),
        },
      },
    });
    expect(invalidResult.status).toBe("error");
    if (invalidResult.status !== "error") throw new Error("Invalid update unexpectedly succeeded");
    expect(invalidResult.message).toContain("Invalid MDAU payload");
    expect(await mission.read()).toEqual(before);

    const firstUpdateTime = Date.now() + 10;
    const firstDelivery = waitForDataAll(reconnectedClient);
    const accepted = await sendMdau(reconnectedClient, mission.id, {
      aegisStations: {
        [ids.stationA]: {
          uuid: ids.stationA,
          name: "Accepted after reconnect",
          duration: before.stations[ids.stationA].duration,
          actionOrderUuids: [ids.actionA],
          updatedAt: firstUpdateTime,
        },
      },
    });
    expect(accepted).toEqual({ status: "success" });
    const firstSnapshot = await firstDelivery;
    expect(firstSnapshot.aegisStations[ids.stationA]).toMatchObject({
      uuid: ids.stationA,
      name: "Accepted after reconnect",
      updatedAt: firstUpdateTime,
    });
    await expect
      .poll(async () => (await mission.read()).stations[ids.stationA].name)
      .toBe("Accepted after reconnect");
    expect((await mission.read()).stations[ids.stationA].updatedAt).toBe(firstUpdateTime);

    const secondUpdateTime = firstUpdateTime + 1000;
    const timestampDelivery = waitForDataAll(reconnectedClient);
    const timestampOnly = await sendMdau(reconnectedClient, mission.id, {
      aegisStations: {
        [ids.stationA]: {
          uuid: ids.stationA,
          name: "Accepted after reconnect",
          duration: before.stations[ids.stationA].duration,
          actionOrderUuids: [ids.actionA],
          updatedAt: secondUpdateTime,
        },
      },
    });
    expect(timestampOnly).toEqual({ status: "success" });
    const timestampSnapshot = await timestampDelivery;
    expect(timestampSnapshot.aegisStations[ids.stationA]).toMatchObject({
      uuid: ids.stationA,
      name: "Accepted after reconnect",
      updatedAt: secondUpdateTime,
    });
    await expect
      .poll(async () => (await mission.read()).stations[ids.stationA].updatedAt)
      .toBe(secondUpdateTime);

    const laterDeliveries: MaestroAegisSlice.AegisSlice[] = [];
    reconnectedClient.on("dataAll", (data: MaestroAegisSlice.AegisSlice) =>
      laterDeliveries.push(data)
    );
    const identicalResend = await sendMdau(reconnectedClient, mission.id, {
      aegisStations: {
        [ids.stationA]: {
          uuid: ids.stationA,
          name: "Accepted after reconnect",
          duration: before.stations[ids.stationA].duration,
          actionOrderUuids: [ids.actionA],
          updatedAt: secondUpdateTime,
        },
      },
    });
    expect(identicalResend).toEqual({ status: "success" });
    await wait(1200);
    expect(laterDeliveries).toEqual([]);
  } finally {
    reconnectedClient.disconnect();
    disconnectedClient.disconnect();
  }
});
