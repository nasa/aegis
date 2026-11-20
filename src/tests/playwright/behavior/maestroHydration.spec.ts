import type { MissionsWithEvas } from "server/maestro/v2/routes/getMissions";
import type { Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { io } from "socket.io-client";
import { test, expect } from "../fixtures/behavioralTest";
import "../../../utils/loadEnv";
import { MISSION_IDS } from "../fixtures/missionSeed";
import type { MDAU } from "server/maestro/v2/types/mdau";
import type { AegisSlice as MaestroAegisSlice } from "server/maestro/v2/types/aegisSlice";
import type { ExecuteUuidMap } from "server/maestro/v2/types/socketioMaestro";
import type { RefRex } from "server/maestro/v2/routes/getRexesByEva";

test.use({ scenario: "execution" });

type SocketAck = { status: "success"; message?: string } | { status: "error"; message: string };
type EverythingAck =
  | { status: "success"; message: string; data: MaestroAegisSlice.AegisSlice }
  | { status: "error"; message: string };
type ExecuteUuidsAck =
  { status: "success"; executeUuidMap: ExecuteUuidMap } | { status: "error"; message: string };
type MdauAck = { status: "success" } | { status: "error"; message: string };

function connectMaestro(baseURL: string, token: string, serverEpochUuid: string): Socket {
  const origin = new URL(baseURL).origin;
  return io(`${origin}/maestro/v2`, {
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

async function expectUnauthorized(socket: Socket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Invalid Maestro token was accepted")), 10000);
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      expect(error.message).toContain("Unauthorized");
      resolve();
    });
    socket.once("connect", () => {
      clearTimeout(timer);
      reject(new Error("Invalid Maestro token connected"));
    });
  });
  socket.disconnect();
}

function joinMission(socket: Socket, missionId: number, name: string): Promise<SocketAck> {
  return new Promise((resolve) => {
    socket.emit("missionJoin", missionId, { name, connectedAt: Date.now() }, resolve);
  });
}

function subscribeToEva(socket: Socket, missionId: number, evaUuid: string): Promise<SocketAck> {
  return new Promise((resolve) => {
    socket.emit("subscribeToEva", missionId, evaUuid, resolve);
  });
}

function getEverything(socket: Socket, missionId: number): Promise<EverythingAck> {
  return new Promise((resolve) => {
    socket.emit("getEverything", missionId, resolve);
  });
}

function getExecuteUuids(
  socket: Socket,
  missionId: number,
  rexUuid: string
): Promise<ExecuteUuidsAck> {
  return new Promise((resolve) => {
    socket.emit("getExecuteUuids", missionId, rexUuid, resolve);
  });
}

function sendMdau(
  socket: Socket,
  missionId: number,
  mdau: MDAU.MaestroDataAegisUses
): Promise<MdauAck> {
  return new Promise((resolve) => {
    socket.emit("sendMDAU", missionId, mdau, resolve);
  });
}

function nextDataAll(socket: Socket): Promise<MaestroAegisSlice.AegisSlice> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for Maestro dataAll")),
      15000
    );
    socket.once("dataAll", (data: MaestroAegisSlice.AegisSlice) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function waitForNoDataAll(milliseconds = 700): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type IsolatedEntityIds = {
  ids: { [key in keyof typeof MISSION_IDS]: string };
};

async function isolateMissionIdentity(mission: BehavioralMission): Promise<IsolatedEntityIds> {
  const missionDoc = await mission.read();
  const entityUuids = new Set<string>();
  const refUuids = new Set<string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (typeof nested === "string" && key === "uuid") entityUuids.add(nested);
      if (typeof nested === "string" && key === "refUuid") refUuids.add(nested);
      collect(nested);
    }
  };
  collect(missionDoc);

  const uuidMap = new Map([...entityUuids].map((uuid) => [uuid, randomUUID()]));
  const refMap = new Map([...refUuids].map((uuid) => [uuid, randomUUID()]));
  const remap = (value: unknown, parentKey?: string): unknown => {
    if (Array.isArray(value)) return value.map((item) => remap(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [uuidMap.get(key) ?? key, remap(nested, key)])
      );
    }
    if (typeof value === "string") {
      if (parentKey === "refUuid") return refMap.get(value) ?? value;
      return uuidMap.get(value) ?? value;
    }
    return value;
  };
  const uniqueDoc = remap(missionDoc) as Mission;
  await mission.change((doc) => Object.assign(doc, uniqueDoc));
  await expect.poll(mission.read).toMatchObject({ id: mission.id, name: mission.name });

  const ids = Object.fromEntries(
    Object.entries(MISSION_IDS).map(([key, uuid]) => [key, uuidMap.get(uuid) ?? uuid])
  ) as IsolatedEntityIds["ids"];
  return { ids };
}

test("Maestro auth, subscription hydration, UUID maps, unsubscribe, and leave gating", async ({
  request,
  baseURL,
  mission,
}) => {
  const emssToken = process.env.EMSS_TOKEN;
  expect(emssToken, "Load the local EMSS token for the Maestro integration test").toBeTruthy();
  const { ids } = await isolateMissionIdentity(mission);
  const versionResponse = await request.get("/api/v1/version");
  expect(versionResponse.ok()).toBe(true);
  const appVersion = (await versionResponse.json()) as AppVersion;
  expect(appVersion.serverEpochUuid).toBeTruthy();

  const unauthorizedList = await request.get("/api/v1/maestro/v2/getMissions");
  expect(unauthorizedList.status()).toBe(401);
  expect(await unauthorizedList.json()).toMatchObject({
    status: "failure",
    message: "Unauthorized",
  });
  const invalidTokenList = await request.get("/api/v1/maestro/v2/getMissions", {
    headers: { "emss-token": "invalid-maestro-token" },
  });
  expect(invalidTokenList.status()).toBe(401);

  const missionData = await mission.read();
  const unauthorizedSocket = connectMaestro(
    baseURL!,
    "invalid-maestro-token",
    appVersion.serverEpochUuid
  );
  let socket: Socket | undefined;
  try {
    await expectUnauthorized(unauthorizedSocket);
    socket = connectMaestro(baseURL!, emssToken as string, appVersion.serverEpochUuid);
    await waitForConnection(socket);

    await expect
      .poll(async () => {
        const response = await request.get("/api/v1/maestro/v2/getMissions", {
          headers: { "emss-token": emssToken as string },
        });
        expect(response.status()).toBe(200);
        const result = (await response.json()) as WrappedResponse<MissionsWithEvas>;
        expect(result.status).toBe("success");
        const listed = result.data[mission.id];
        return (
          listed && {
            ...listed,
            evas: listed.evas.sort((a: { uuid: string }, b: { uuid: string }) =>
              a.uuid.localeCompare(b.uuid)
            ),
          }
        );
      })
      .toEqual({
        missionName: mission.name,
        missionActionSystemVersion: missionData.actionSystemVersion,
        evas: [
          { uuid: ids.evaA, evaName: "Survey Alpha" },
          { uuid: ids.evaB, evaName: "Survey Bravo" },
        ].sort((a, b) => a.uuid.localeCompare(b.uuid)),
      });

    const missingMission = await request.get(
      "/api/v1/maestro/v2/getRexesByEva?evaUuid=" + ids.evaA,
      { headers: { "emss-token": emssToken as string } }
    );
    expect(missingMission.status()).toBe(400);

    for (const [evaUuid, rexUuid, rexName, isRunning] of [
      [ids.evaA, ids.rexA, "Stopped Alpha", false],
      [ids.evaB, ids.rexB, "Active Bravo", true],
    ] as const) {
      const rexesResponse = await request.get(
        `/api/v1/maestro/v2/getRexesByEva?missionId=${mission.id}&evaUuid=${evaUuid}`,
        { headers: { "emss-token": emssToken as string } }
      );
      expect(rexesResponse.status()).toBe(200);
      const rexes = (await rexesResponse.json()) as WrappedResponse<RefRex[]>;
      expect(rexes.status).toBe("success");
      expect(rexes.data).toEqual([
        {
          uuid: rexUuid,
          name: rexName,
          createdAt: Date.parse("2026-10-24T12:00:00.000Z"),
          updatedAt: Date.parse("2026-10-24T12:00:00.000Z"),
          isRunning,
        },
      ]);
    }

    expect(await joinMission(socket, mission.id, "Reviewed Maestro client")).toEqual({
      status: "success",
      message: `Joined mission ${mission.id}`,
    });
    const unfiltered = await getEverything(socket, mission.id);
    expect(unfiltered.status).toBe("success");
    if (unfiltered.status !== "success") throw new Error("Initial Maestro hydration failed");
    expect(Object.keys(unfiltered.data.aegisMissions)).toEqual([String(mission.id)]);
    expect(Object.keys(unfiltered.data.aegisEvas)).toEqual([]);
    expect(Object.keys(unfiltered.data.aegisStations)).toEqual([]);
    expect(Object.keys(unfiltered.data.aegisTraverses)).toEqual([]);

    expect(await subscribeToEva(socket, mission.id, ids.evaA)).toEqual({
      status: "success",
    });
    const alphaHydration = await getEverything(socket, mission.id);
    expect(alphaHydration.status).toBe("success");
    if (alphaHydration.status !== "success") throw new Error("Subscribed EVA hydration failed");
    expect(Object.keys(alphaHydration.data.aegisEvas)).toEqual([ids.evaA]);
    expect(Object.keys(alphaHydration.data.aegisStations).sort()).toEqual(
      [ids.egressA, ids.stationA, ids.stationB, ids.ingressA].sort()
    );
    expect(Object.keys(alphaHydration.data.aegisTraverses).sort()).toEqual(
      [ids.traverseOutbound, ids.traverseA, ids.traverseReturn].sort()
    );
    expect(Object.keys(alphaHydration.data.fetchedAegisActions)).toEqual([ids.actionA]);
    const concreteUuidMap = await getExecuteUuids(socket, mission.id, ids.rexA);
    expect(concreteUuidMap).toEqual({
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
        action: { [ids.actionA]: ids.rexActionA },
      },
    });

    expect(await subscribeToEva(socket, mission.id, ids.evaB)).toEqual({
      status: "success",
    });
    const bothHydration = await getEverything(socket, mission.id);
    expect(bothHydration.status).toBe("success");
    if (bothHydration.status !== "success") throw new Error("Multiple EVA hydration failed");
    expect(Object.keys(bothHydration.data.aegisEvas).sort()).toEqual([ids.evaA, ids.evaB].sort());
    expect(Object.keys(bothHydration.data.aegisStations)).toHaveLength(6);
    expect(Object.keys(bothHydration.data.aegisTraverses)).toHaveLength(5);

    const dataUpdates: MaestroAegisSlice.AegisSlice[] = [];
    socket.on("dataAll", (data: MaestroAegisSlice.AegisSlice) => dataUpdates.push(data));
    socket.emit("unsubscribeToEva", mission.id, ids.evaA);
    const bravoOnly = await getEverything(socket, mission.id);
    expect(bravoOnly.status).toBe("success");
    if (bravoOnly.status !== "success") throw new Error("Remaining EVA hydration failed");
    expect(Object.keys(bravoOnly.data.aegisEvas)).toEqual([ids.evaB]);
    expect(Object.keys(bravoOnly.data.aegisStations).sort()).toEqual(
      [ids.egressB, ids.stationB, ids.ingressB].sort()
    );
    expect(Object.keys(bravoOnly.data.aegisTraverses).sort()).toEqual(
      [ids.traverseB, ids.traverseBReturn].sort()
    );

    await mission.change((doc) => {
      doc.stations[ids.stationA].name = "Unsubscribed Alpha update";
    });
    await waitForNoDataAll();
    expect(dataUpdates).toEqual([]);

    const bravoUpdate = nextDataAll(socket);
    await mission.change((doc) => {
      doc.stations[ids.stationB].name = "Subscribed Bravo update";
    });
    const bravoUpdateData = await bravoUpdate;
    expect(Object.keys(bravoUpdateData.aegisEvas)).toEqual([ids.evaB]);
    expect(bravoUpdateData.aegisStations[ids.stationB].name).toBe("Subscribed Bravo update");
    expect(bravoUpdateData.aegisStations[ids.stationA]).toBeUndefined();

    socket.emit("missionLeave", mission.id);
    await waitForNoDataAll(200);
    await mission.change((doc) => {
      doc.stations[ids.stationB].name = "After Maestro leave";
    });
    await waitForNoDataAll();
    expect(dataUpdates).toHaveLength(1);
  } finally {
    socket?.disconnect();
    unauthorizedSocket.disconnect();
  }
});

test("valid MDAU edits reach the subscribed client and persist as one graph update", async ({
  request,
  baseURL,
  mission,
}) => {
  const emssToken = process.env.EMSS_TOKEN;
  expect(emssToken, "Load the local EMSS token for the Maestro integration test").toBeTruthy();
  const { ids } = await isolateMissionIdentity(mission);
  const versionResponse = await request.get("/api/v1/version");
  const version = (await versionResponse.json()) as AppVersion;
  const socket = connectMaestro(baseURL!, emssToken as string, version.serverEpochUuid);
  try {
    await waitForConnection(socket);
    expect(await joinMission(socket, mission.id, "MDAU writer")).toMatchObject({
      status: "success",
    });
    expect(await subscribeToEva(socket, mission.id, ids.evaA)).toEqual({
      status: "success",
    });

    const updateTime = Date.parse("2026-10-25T12:00:00.000Z");
    const dataAll = nextDataAll(socket);
    const result = await sendMdau(socket, mission.id, {
      aegisStations: {
        [ids.stationA]: {
          uuid: ids.stationA,
          name: "Maestro verified station",
          duration: 19,
          actionOrderUuids: [ids.actionA],
          updatedAt: updateTime,
        },
      },
      aegisAction: {
        [ids.actionA]: {
          uuid: ids.actionA,
          name: "Maestro verified action",
          descriptionTask: "Update from Maestro",
          duration: 7,
          actionDefinition: null,
          missionPriorityUuid: null,
          stmAction: false,
          actors: ["EV1"],
          enabled: true,
          updatedAt: updateTime,
        },
      },
    });
    expect(result).toEqual({ status: "success" });

    const update = await dataAll;
    expect(update.aegisStations[ids.stationA]).toMatchObject({
      uuid: ids.stationA,
      name: "Maestro verified station",
      duration: 19,
      actionOrderUuids: [ids.actionA],
      updatedAt: updateTime,
    });
    expect(update.fetchedAegisActions[ids.actionA]).toMatchObject({
      uuid: ids.actionA,
      name: "Maestro verified action",
      descriptionTask: "Update from Maestro",
      duration: 7,
      crewAssigned: ["EV1"],
      updatedAt: updateTime,
    });

    const persisted = await mission.read();
    expect(persisted.stations[ids.stationA]).toMatchObject({
      name: "Maestro verified station",
      duration: 19,
      actionOrderUuids: [ids.actionA],
      updatedAt: updateTime,
    });
    expect(persisted.actions[ids.actionA]).toMatchObject({
      name: "Maestro verified action",
      descriptionTask: "Update from Maestro",
      duration: 7,
      crewAssigned: ["EV1"],
      updatedAt: updateTime,
    });
  } finally {
    socket.disconnect();
  }
});

test("invalid-schema MDAU payload rejects all sibling writes without changing the graph", async ({
  request,
  baseURL,
  mission,
}) => {
  const emssToken = process.env.EMSS_TOKEN;
  expect(emssToken, "Load the local EMSS token for the Maestro integration test").toBeTruthy();
  const { ids } = await isolateMissionIdentity(mission);
  const versionResponse = await request.get("/api/v1/version");
  const version = (await versionResponse.json()) as AppVersion;
  const socket = connectMaestro(baseURL!, emssToken as string, version.serverEpochUuid);
  try {
    await waitForConnection(socket);
    expect(await joinMission(socket, mission.id, "Invalid schema sender")).toMatchObject({
      status: "success",
    });
    expect(await subscribeToEva(socket, mission.id, ids.evaA)).toEqual({
      status: "success",
    });
    const events: MaestroAegisSlice.AegisSlice[] = [];
    socket.on("dataAll", (data: MaestroAegisSlice.AegisSlice) => events.push(data));
    const before = await mission.read();
    const result = await sendMdau(socket, mission.id, {
      aegisStations: {
        [ids.stationA]: {
          uuid: ids.stationA,
          name: "Must roll back with invalid schema",
          duration: "invalid-duration",
          actionOrderUuids: [ids.actionA],
          updatedAt: Date.now(),
        },
      },
    } as unknown as MDAU.MaestroDataAegisUses);
    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("Invalid MDAU schema unexpectedly succeeded");
    expect(result.message).toContain("Invalid MDAU payload");
    expect(await mission.read()).toEqual(before);
    await waitForNoDataAll();
    expect(events).toEqual([]);
  } finally {
    socket.disconnect();
  }
});
