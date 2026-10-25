import { randomUUID } from "node:crypto";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { Repo } from "@automerge/automerge-repo";
import type { DocHandle } from "@automerge/automerge-repo";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import Ajv, { type ValidateFunction } from "ajv";
import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import "../../../utils/loadEnv";
import { buildBehavioralMission, MISSION_IDS } from "../fixtures/missionSeed";
import { seedPosEntry } from "../fixtures/entitySeeds";
import type { DustPosEntriesUpdate } from "server/dust/v1/types/socketioDust";

type DustJoinAck = { status: "success"; message: string } | { status: "error"; message: string };
type DustEverythingAck =
  | { status: "success"; message: string; data: DustPosEntriesUpdate[] }
  | { status: "error"; message: string };
type DustDebugInfo = {
  visitors: Record<string, Array<{ socketId: string; name: string; connectedAt: number }>>;
  docListenerMissionIds: number[];
};
type KnownPosition = {
  uuid: string;
  location: AEGISPoint;
  petSeconds: number;
  createdAt: number;
  updatedAt: number;
};
type DustFixture = {
  id: number;
  name: string;
  prefix: string;
  repo: Repo;
  handle: DocHandle<Mission>;
  change(mutator: (mission: Mission) => void): Promise<void>;
  read(): Promise<Mission>;
  expectedPayload(options: {
    missionName?: string;
    rexName?: string;
    evaName?: string;
    posTypeName?: string;
    posSourceName?: string;
    entries?: KnownPosition[];
  }): DustPosEntriesUpdate;
  stoppedPayload(): DustPosEntriesUpdate;
  initialRunningPositions: KnownPosition[];
  initialStoppedPosition: KnownPosition;
};

const DUST_NOW = Date.parse("2026-10-25T12:00:00.000Z");
let missionValidator: ValidateFunction<Mission> | undefined;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function waitForSocket(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out connecting DUST client")), 10000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    if (socket.connected) {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function expectSocketRejected(socket: Socket): Promise<void> {
  const rejection = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Invalid DUST credential was accepted")),
      10000
    );
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      expect(error.message).toContain("Unauthorized");
      resolve();
    });
    socket.once("connect", () => {
      clearTimeout(timer);
      reject(new Error("Invalid DUST credential connected"));
    });
  });
  await rejection;
  socket.disconnect();
}

function connectDust(baseURL: string, token: string, label: string): Socket {
  const origin = new URL(baseURL).origin;
  return io(`${origin}/dust/v1`, {
    path: "/api/socket",
    transports: ["websocket"],
    reconnection: false,
    timeout: 10000,
    auth: { token },
    query: { client: label },
  });
}

function joinMission(socket: Socket, missionId: number, name: string): Promise<DustJoinAck> {
  return new Promise((resolve) => {
    socket.emit("missionJoin", missionId, { name, connectedAt: Date.now() }, (ack: DustJoinAck) =>
      resolve(ack)
    );
  });
}

function getEverything(socket: Socket, missionId: number): Promise<DustEverythingAck> {
  return new Promise((resolve) => {
    socket.emit("getEverything", missionId, (ack: DustEverythingAck) => resolve(ack));
  });
}

function getDebugInfo(socket: Socket): Promise<DustDebugInfo> {
  return new Promise((resolve) => {
    socket.emit("getDebugInfo", (data: DustDebugInfo) => resolve(data));
  });
}

function nextPositionUpdate(socket: Socket): Promise<DustPosEntriesUpdate> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for DUST update")), 15000);
    socket.once("posEntriesUpdate", (payload: DustPosEntriesUpdate) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function makeKnownPosition(
  uuid: string,
  lat: number,
  lng: number,
  petSeconds: number,
  createdAt = DUST_NOW,
  updatedAt = DUST_NOW
): KnownPosition {
  return { uuid, location: { lat, lng }, petSeconds, createdAt, updatedAt };
}

async function createDustFixture(
  request: APIRequestContext,
  baseURL: string,
  prefix: string
): Promise<DustFixture> {
  const createdResponse = await request.post("/api/v1/missionAutomerge", {
    data: {},
    timeout: 30000,
  });
  expect(createdResponse.ok(), "Create an isolated mission through the application API").toBe(true);
  const created = (await createdResponse.json()) as WrappedResponse<AutomergeDocListing>;
  expect(created.status).toBe("success");
  const { missionId, automergeUrl } = created.data;
  expect(missionId).toBeGreaterThan(0);

  let repo: Repo | undefined;
  try {
    const origin = new URL(baseURL ?? "http://localhost:4000");
    const versionResponse = await request.get("/api/v1/version");
    expect(versionResponse.ok()).toBe(true);
    const version = (await versionResponse.json()) as AppVersion;
    expect(version.serverEpochUuid).toBeTruthy();
    const socketUrl = new URL("/api/automergeSocket/", origin);
    socketUrl.protocol = origin.protocol === "https:" ? "wss:" : "ws:";
    socketUrl.searchParams.set("serverEpochUuid", version.serverEpochUuid);
    repo = new Repo({ network: [new WebSocketClientAdapter(socketUrl.toString())] });
    const handle = await repo.find<Mission>(automergeUrl as AutomergeUrl, {
      signal: AbortSignal.timeout(15000),
    });
    const read = async (): Promise<Mission> => {
      const response = await request.get(`/api/v1/missionDump?missionId=${missionId}`, {
        timeout: 30000,
      });
      expect(response.ok(), `Read isolated mission ${missionId}`).toBe(true);
      const body = (await response.json()) as WrappedResponse<MissionDump>;
      expect(body.status).toBe("success");
      expect(body.data?.missionData?.mission?.id).toBe(missionId);
      return body.data.missionData.mission;
    };

    const schemaResponse = await request.get("/api/v1/mission/schema");
    expect(schemaResponse.ok(), "Load the current mission schema").toBe(true);
    const schemaBody = (await schemaResponse.json()) as WrappedResponse<unknown>;
    expect(schemaBody.status).toBe("success");
    missionValidator ??= new Ajv({ strict: false, allErrors: true }).compile<Mission>(
      schemaBody.data
    );

    const blankMission = JSON.parse(JSON.stringify(handle.doc())) as Mission;
    const seededMission = buildBehavioralMission(missionId, prefix, "execution", blankMission);
    const source = `${prefix} Source`;
    const type = `${prefix} EVA-1`;
    const initialRunningPositions = [
      makeKnownPosition(MISSION_IDS.posA, 18.125, -31.75, 125),
      makeKnownPosition(MISSION_IDS.posB, 18.25, -31.5, 250),
    ];
    const initialStoppedPosition = makeKnownPosition(MISSION_IDS.posA, -2.5, 109.75, 33);
    seededMission.name = `${prefix} Mission`;
    seededMission.evas[MISSION_IDS.evaA].name = `${prefix} EVA Alpha`;
    seededMission.evas[MISSION_IDS.evaB].name = `${prefix} EVA Bravo`;

    const runningRex = seededMission.rexes[MISSION_IDS.rexB];
    runningRex.name = `${prefix} Active REX`;
    runningRex.isRunning = true;
    runningRex.posTypes = [
      {
        uuid: MISSION_IDS.posType,
        name: type,
        abbr: "1",
        icon: "1f468-200d-1f680",
        pathColor: "#ff0000",
      },
    ];
    runningRex.posSources = [{ uuid: MISSION_IDS.posSource, name: source, abbr: "C" }];
    runningRex.posEntries = initialRunningPositions.map((entry) =>
      seedPosEntry({
        uuid: entry.uuid,
        location: entry.location,
        elevation: 0,
        petSeconds: entry.petSeconds,
        posTypeUuids: [MISSION_IDS.posType],
        posSourceUuid: MISSION_IDS.posSource,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })
    );

    const stoppedRex = seededMission.rexes[MISSION_IDS.rexA];
    stoppedRex.name = `${prefix} Stopped REX`;
    stoppedRex.isRunning = false;
    stoppedRex.posTypes = structuredClone(runningRex.posTypes);
    stoppedRex.posSources = structuredClone(runningRex.posSources);
    stoppedRex.posEntries = [
      seedPosEntry({
        uuid: initialStoppedPosition.uuid,
        location: initialStoppedPosition.location,
        elevation: 0,
        petSeconds: initialStoppedPosition.petSeconds,
        posTypeUuids: [MISSION_IDS.posType],
        posSourceUuid: MISSION_IDS.posSource,
        createdAt: initialStoppedPosition.createdAt,
        updatedAt: initialStoppedPosition.updatedAt,
      }),
    ];

    const seedIsValid = missionValidator(seededMission);
    expect(seedIsValid, JSON.stringify(missionValidator.errors)).toBe(true);
    handle.change((mission) => Object.assign(mission, seededMission));
    await expect
      .poll(read, { message: `Wait for mission ${missionId} seed to persist`, timeout: 20000 })
      .toEqual(seededMission);

    const change = async (mutator: (mission: Mission) => void): Promise<void> => {
      handle.change(mutator);
      const expected = JSON.parse(JSON.stringify(handle.doc())) as Mission;
      await expect
        .poll(read, { message: `Wait for mission ${missionId} update to persist`, timeout: 20000 })
        .toEqual(expected);
    };

    const expectedPayload = (options: {
      missionName?: string;
      rexName?: string;
      evaName?: string;
      posTypeName?: string;
      posSourceName?: string;
      entries?: KnownPosition[];
    }): DustPosEntriesUpdate => ({
      missionId,
      missionName: options.missionName ?? `${prefix} Mission`,
      rexUuid: MISSION_IDS.rexB,
      rexName: options.rexName ?? `${prefix} Active REX`,
      evaUuid: MISSION_IDS.rexEvaB,
      evaName: options.evaName ?? `${prefix} EVA Bravo`,
      posEntries: (options.entries ?? initialRunningPositions).map((entry) => ({
        uuid: entry.uuid,
        latlng: entry.location,
        petSeconds: entry.petSeconds,
        posTypes: [options.posTypeName ?? type],
        posSource: options.posSourceName ?? source,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })),
    });
    const stoppedPayload = (): DustPosEntriesUpdate => ({
      missionId,
      missionName: `${prefix} Mission`,
      rexUuid: MISSION_IDS.rexA,
      rexName: `${prefix} Stopped REX`,
      evaUuid: MISSION_IDS.rexEvaA,
      evaName: `${prefix} EVA Alpha`,
      posEntries: [
        {
          uuid: initialStoppedPosition.uuid,
          latlng: initialStoppedPosition.location,
          petSeconds: initialStoppedPosition.petSeconds,
          posTypes: [type],
          posSource: source,
          createdAt: initialStoppedPosition.createdAt,
          updatedAt: initialStoppedPosition.updatedAt,
        },
      ],
    });

    return {
      id: missionId,
      name: `${prefix} Mission`,
      prefix,
      repo,
      handle,
      change,
      read,
      expectedPayload,
      stoppedPayload,
      initialRunningPositions,
      initialStoppedPosition,
    };
  } catch (error) {
    await repo?.shutdown();
    const deleted = await request.delete("/api/v1/missionAutomerge", {
      data: { missionIds: [missionId] },
      timeout: 30000,
    });
    expect(deleted.ok(), `Clean failed fixture mission ${missionId}`).toBe(true);
    throw error;
  }
}

async function cleanupDustFixtures(
  request: APIRequestContext,
  fixtures: DustFixture[]
): Promise<void> {
  for (const fixture of fixtures) {
    await fixture.repo.shutdown();
    const deleted = await request.delete("/api/v1/missionAutomerge", {
      data: { missionIds: [fixture.id] },
      timeout: 30000,
    });
    expect(deleted.ok(), `Delete only this scenario's mission ${fixture.id}`).toBe(true);
    expect(((await deleted.json()) as WrappedResponse<unknown>).status).toBe("success");
  }
}

test("DUST and EMSS socket authentication, mission join, resync, and failed-join rollback", async ({
  request,
  baseURL,
}) => {
  const dustToken = process.env.DUST_TOKEN;
  const emssToken = process.env.EMSS_TOKEN;
  expect(dustToken, "The running local API has its DUST token configured").toBeTruthy();
  expect(emssToken, "The running local API has its EMSS master token configured").toBeTruthy();

  const fixtures: DustFixture[] = [];
  const sockets: Socket[] = [];
  try {
    const suffix = randomUUID().slice(0, 8);
    const alpha = await createDustFixture(request, baseURL!, `DUST Alpha ${suffix}`);
    fixtures.push(alpha);
    const bravo = await createDustFixture(request, baseURL!, `DUST Bravo ${suffix}`);
    fixtures.push(bravo);

    const invalidDust = connectDust(baseURL!, "invalid-dust-token", `invalid-dust-${suffix}`);
    sockets.push(invalidDust);
    await expectSocketRejected(invalidDust);
    const invalidEmss = connectDust(baseURL!, "invalid-emss-token", `invalid-emss-${suffix}`);
    sockets.push(invalidEmss);
    await expectSocketRejected(invalidEmss);

    const dustClient = connectDust(baseURL!, dustToken as string, `dust-${suffix}`);
    sockets.push(dustClient);
    await waitForSocket(dustClient);
    const emssClient = connectDust(baseURL!, emssToken as string, `emss-${suffix}`);
    sockets.push(emssClient);
    await waitForSocket(emssClient);

    const beforeJoin = await getEverything(dustClient, alpha.id);
    expect(beforeJoin.status).toBe("error");
    if (beforeJoin.status !== "error")
      throw new Error("getEverything unexpectedly worked before join");
    expect(beforeJoin.message).toContain("Error getting everything");

    expect(await joinMission(dustClient, 0, `DUST Alpha ${suffix}`)).toMatchObject({
      status: "error",
      message: "Invalid missionId 0",
    });
    const alphaJoin = await joinMission(dustClient, alpha.id, `DUST Alpha ${suffix}`);
    expect(alphaJoin).toEqual({ status: "success", message: `Joined mission ${alpha.id}` });
    const alphaResync = await getEverything(dustClient, alpha.id);
    expect(alphaResync.status).toBe("success");
    if (alphaResync.status !== "success") throw new Error("Joined mission did not resync");
    expect(
      alphaResync.data.sort((left, right) => left.rexUuid.localeCompare(right.rexUuid))
    ).toEqual(
      [alpha.stoppedPayload(), alpha.expectedPayload({})].sort((left, right) =>
        left.rexUuid.localeCompare(right.rexUuid)
      )
    );

    const bravoBeforeJoin = await getEverything(emssClient, bravo.id);
    expect(bravoBeforeJoin.status).toBe("error");
    const bravoJoin = await joinMission(emssClient, bravo.id, `EMSS Bravo ${suffix}`);
    expect(bravoJoin).toEqual({ status: "success", message: `Joined mission ${bravo.id}` });
    const bravoResync = await getEverything(emssClient, bravo.id);
    expect(bravoResync.status).toBe("success");
    if (bravoResync.status !== "success") throw new Error("EMSS-joined mission did not resync");
    expect(
      bravoResync.data.sort((left, right) => left.rexUuid.localeCompare(right.rexUuid))
    ).toEqual(
      [bravo.stoppedPayload(), bravo.expectedPayload({})].sort((left, right) =>
        left.rexUuid.localeCompare(right.rexUuid)
      )
    );

    const failedMissionId = 2147483000;
    const failedJoin = await joinMission(dustClient, failedMissionId, `Missing ${suffix}`);
    expect(failedJoin).toEqual({
      status: "error",
      message: `Failed to join mission ${failedMissionId}`,
    });
    const failedResync = await getEverything(dustClient, failedMissionId);
    expect(failedResync.status).toBe("error");
    const debug = await getDebugInfo(dustClient);
    expect(debug.visitors[String(alpha.id)]?.map((visitor) => visitor.name)).toContain(
      `DUST Alpha ${suffix}`
    );
    expect(debug.visitors[String(bravo.id)]?.map((visitor) => visitor.name)).toContain(
      `EMSS Bravo ${suffix}`
    );
    expect(debug.visitors[String(failedMissionId)]).toBeUndefined();
    expect(debug.docListenerMissionIds).toContain(alpha.id);
    expect(debug.docListenerMissionIds).toContain(bravo.id);
    expect(debug.docListenerMissionIds).not.toContain(failedMissionId);
    const alphaStillJoined = await getEverything(dustClient, alpha.id);
    expect(alphaStillJoined.status).toBe("success");
  } finally {
    for (const socket of sockets) socket.disconnect();
    await cleanupDustFixtures(request, fixtures);
  }
});

test("DUST streams complete canonical updates only to the subscribed mission", async ({
  request,
  baseURL,
}) => {
  const emssToken = process.env.EMSS_TOKEN;
  expect(emssToken, "The running local API has its EMSS master token configured").toBeTruthy();
  const fixtures: DustFixture[] = [];
  const sockets: Socket[] = [];
  const alphaUpdates: DustPosEntriesUpdate[] = [];
  const bravoUpdates: DustPosEntriesUpdate[] = [];
  try {
    const suffix = randomUUID().slice(0, 8);
    const alpha = await createDustFixture(request, baseURL!, `DUST Live Alpha ${suffix}`);
    fixtures.push(alpha);
    const bravo = await createDustFixture(request, baseURL!, `DUST Live Bravo ${suffix}`);
    fixtures.push(bravo);
    const alphaClient = connectDust(baseURL!, emssToken as string, `live-alpha-${suffix}`);
    sockets.push(alphaClient);
    await waitForSocket(alphaClient);
    const bravoClient = connectDust(baseURL!, emssToken as string, `live-bravo-${suffix}`);
    sockets.push(bravoClient);
    await waitForSocket(bravoClient);
    alphaClient.on("posEntriesUpdate", (payload: DustPosEntriesUpdate) =>
      alphaUpdates.push(payload)
    );
    bravoClient.on("posEntriesUpdate", (payload: DustPosEntriesUpdate) =>
      bravoUpdates.push(payload)
    );

    expect(await joinMission(alphaClient, alpha.id, `Live Alpha ${suffix}`)).toMatchObject({
      status: "success",
    });
    expect(await joinMission(bravoClient, bravo.id, `Live Bravo ${suffix}`)).toMatchObject({
      status: "success",
    });
    const alphaInitial = await getEverything(alphaClient, alpha.id);
    const bravoInitial = await getEverything(bravoClient, bravo.id);
    expect(alphaInitial.status).toBe("success");
    expect(bravoInitial.status).toBe("success");
    if (alphaInitial.status !== "success" || bravoInitial.status !== "success") {
      throw new Error("Successful DUST mission joins must provide full resync data");
    }
    expect(
      alphaInitial.data.sort((left, right) => left.rexUuid.localeCompare(right.rexUuid))
    ).toEqual(
      [alpha.stoppedPayload(), alpha.expectedPayload({})].sort((left, right) =>
        left.rexUuid.localeCompare(right.rexUuid)
      )
    );
    expect(
      bravoInitial.data.sort((left, right) => left.rexUuid.localeCompare(right.rexUuid))
    ).toEqual(
      [bravo.stoppedPayload(), bravo.expectedPayload({})].sort((left, right) =>
        left.rexUuid.localeCompare(right.rexUuid)
      )
    );

    const addedPosition = makeKnownPosition(
      MISSION_IDS.posA.replace(/40$/, "44"),
      18.5,
      -31.25,
      375
    );
    const afterAdd = [...alpha.initialRunningPositions, addedPosition];
    const addedUpdate = nextPositionUpdate(alphaClient);
    await alpha.change((mission) => {
      mission.rexes[MISSION_IDS.rexB].posEntries.push(
        seedPosEntry({
          uuid: addedPosition.uuid,
          location: addedPosition.location,
          elevation: 0,
          petSeconds: addedPosition.petSeconds,
          posTypeUuids: [MISSION_IDS.posType],
          posSourceUuid: MISSION_IDS.posSource,
          createdAt: addedPosition.createdAt,
          updatedAt: addedPosition.updatedAt,
        })
      );
    });
    expect(await addedUpdate).toEqual(alpha.expectedPayload({ entries: afterAdd }));
    await delay(600);

    const editedFirst = makeKnownPosition(
      alpha.initialRunningPositions[0].uuid,
      18.625,
      -31.125,
      401,
      DUST_NOW,
      DUST_NOW + 1000
    );
    const afterEdit = [editedFirst, alpha.initialRunningPositions[1], addedPosition];
    const editedUpdate = nextPositionUpdate(alphaClient);
    await alpha.change((mission) => {
      const entry = mission.rexes[MISSION_IDS.rexB].posEntries.find(
        (position) => position.uuid === editedFirst.uuid
      );
      if (!entry) throw new Error("Fixture position to edit is missing");
      entry.location = editedFirst.location;
      entry.petSeconds = editedFirst.petSeconds;
      entry.updatedAt = editedFirst.updatedAt;
    });
    expect(await editedUpdate).toEqual(alpha.expectedPayload({ entries: afterEdit }));
    await delay(600);

    const afterDelete = [editedFirst, addedPosition];
    const deletedUpdate = nextPositionUpdate(alphaClient);
    await alpha.change((mission) => {
      const entries = mission.rexes[MISSION_IDS.rexB].posEntries;
      const deletedIndex = entries.findIndex(
        (entry) => entry.uuid === alpha.initialRunningPositions[1].uuid
      );
      if (deletedIndex < 0) throw new Error("Fixture position to delete is missing");
      entries.splice(deletedIndex, 1);
    });
    expect(await deletedUpdate).toEqual(alpha.expectedPayload({ entries: afterDelete }));
    await delay(600);

    const renamedMission = `${alpha.prefix} Renamed Mission`;
    const renamedRex = `${alpha.prefix} EVA executed locations`;
    const renamedEva = `${alpha.prefix} Crew EVA`;
    const renamedType = `${alpha.prefix} Commander`;
    const renamedSource = `${alpha.prefix} Flight Controller`;
    const renamedUpdate = nextPositionUpdate(alphaClient);
    await alpha.change((mission) => {
      mission.name = renamedMission;
      mission.evas[MISSION_IDS.evaB].name = renamedEva;
      mission.rexes[MISSION_IDS.rexB].name = renamedRex;
      mission.rexes[MISSION_IDS.rexB].posTypes[0].name = renamedType;
      mission.rexes[MISSION_IDS.rexB].posSources[0].name = renamedSource;
    });
    const expectedRenamed = alpha.expectedPayload({
      missionName: renamedMission,
      rexName: renamedRex,
      evaName: renamedEva,
      posTypeName: renamedType,
      posSourceName: renamedSource,
      entries: afterDelete,
    });
    expect(await renamedUpdate).toEqual(expectedRenamed);
    await delay(600);

    const stoppedEdit = makeKnownPosition(
      editedFirst.uuid,
      18.75,
      -31,
      450,
      editedFirst.createdAt,
      editedFirst.updatedAt + 1000
    );
    const countBeforeStop = alphaUpdates.length;
    await alpha.change((mission) => {
      const rex = mission.rexes[MISSION_IDS.rexB];
      rex.isRunning = false;
      const entry = rex.posEntries.find((position) => position.uuid === stoppedEdit.uuid);
      if (!entry) throw new Error("Fixture position to update while stopped is missing");
      entry.location = stoppedEdit.location;
      entry.petSeconds = stoppedEdit.petSeconds;
      entry.updatedAt = stoppedEdit.updatedAt;
    });
    await delay(700);
    expect(alphaUpdates).toHaveLength(countBeforeStop);

    const restartedEntry = makeKnownPosition(
      addedPosition.uuid,
      addedPosition.location.lat,
      addedPosition.location.lng,
      502,
      addedPosition.createdAt,
      addedPosition.updatedAt + 1000
    );
    const afterRestart = [stoppedEdit, restartedEntry];
    const restartedUpdate = nextPositionUpdate(alphaClient);
    await alpha.change((mission) => {
      const rex = mission.rexes[MISSION_IDS.rexB];
      rex.isRunning = true;
      const entry = rex.posEntries.find((position) => position.uuid === restartedEntry.uuid);
      if (!entry) throw new Error("Fixture position to update after restart is missing");
      entry.petSeconds = restartedEntry.petSeconds;
      entry.updatedAt = restartedEntry.updatedAt;
    });
    expectedRenamed.posEntries = afterRestart.map((entry) => ({
      uuid: entry.uuid,
      latlng: entry.location,
      petSeconds: entry.petSeconds,
      posTypes: [renamedType],
      posSource: renamedSource,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));
    expect(await restartedUpdate).toEqual(expectedRenamed);
    await delay(700);

    expect(alphaUpdates).toHaveLength(5);
    expect(bravoUpdates).toEqual([]);
    const alphaFinal = await getEverything(alphaClient, alpha.id);
    expect(alphaFinal.status).toBe("success");
    if (alphaFinal.status !== "success") throw new Error("Final full state resync failed");
    expect(alphaFinal.data.find((payload) => payload.rexUuid === MISSION_IDS.rexB)).toEqual(
      expectedRenamed
    );
    expect(await alpha.read()).toMatchObject({ name: renamedMission });
    expect((await bravo.read()).name).toBe(bravo.name);
  } finally {
    for (const socket of sockets) socket.disconnect();
    await cleanupDustFixtures(request, fixtures);
  }
});
