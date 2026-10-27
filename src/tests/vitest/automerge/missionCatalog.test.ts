// @vitest-environment node
import { MikroORM } from "@mikro-orm/postgresql";
import type { AutomergeUrl, DocHandle } from "@automerge/automerge-repo/slim";
import { Repo } from "@automerge/automerge-repo/slim";
import pg from "pg";
import supertest from "supertest";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import app from "server/express/restApi";
import { LazyMissionRepo } from "server/automerge/lazyMissionRepo";
import { PostgresStorageAdapter } from "server/automerge/automerge-storage-adapter-postgres";
import { getMissionSummaries, getMissionIdsForEva } from "server/automerge/missionCatalog";
import * as missionCatalog from "server/automerge/missionCatalog";
import {
  refreshMissionCatalog,
  retainMissionDocuments,
  startMissionCatalogRuntime,
  loadRunningMissionDocuments,
  MISSION_IDLE_MS,
} from "server/automerge/missionCatalogRuntime";
import { createAutomergeMission } from "server/express/routes/missionAutomerge";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex, generateBlankPosEntry } from "store/storeUtils/rex";
import { getRexesByEva } from "server/maestro/v2/routes/getRexesByEva";
import * as Automerge from "@automerge/automerge";
import { populateMissionCatalogOnce } from "server/automerge/populateMissionCatalogOnce";

let repo: LazyMissionRepo;
let pool: pg.Pool;
let storage: PostgresStorageAdapter;
let handles: DocHandle<Mission>[];
let ids: number[];

beforeAll(async () => {
  globalValues.orm = await MikroORM.init({ ...config, allowGlobalContext: true });
  pool = new pg.Pool({
    host: config.host,
    port: config.port,
    database: config.dbName,
    user: "postgres",
    password: config.password as string,
  });
  storage = new PostgresStorageAdapter("automerge_native_db", pool);
});

beforeEach(() => {
  repo = new LazyMissionRepo({ storage });
  globalValues.automergeRepo = repo;
  handles = [];
  ids = [];
});

async function createMission(fields: Partial<Mission> = {}) {
  const listing = await createAutomergeMission(
    generateBlankMission({
      name: "Vitest Catalog Mission",
      ...fields,
    })
  );
  const handle = await repo.find<Mission>(listing.automergeUrl as AutomergeUrl);
  handles.push(handle);
  ids.push(listing.missionId);
  return handle;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await repo.shutdown();
  const em = globalValues.orm.em.fork();
  for (const id of ids) await em.execute("delete from doc_listing_db where mission_id = ?", [id]);
  for (const handle of handles) {
    await storage.removeRange([handle.documentId]);
  }
  globalValues.orm.em.clear();
});

afterAll(async () => {
  await pool.end();
  await globalValues.orm.close(true);
});

test("restart and homepage/admin/Maestro discovery load zero documents", async () => {
  const eva = generateBlankEVA({ name: "Planned EVA" });
  await createMission({ evas: { [eva.uuid]: eva } });
  await createMission({ archivedAt: 123, name: "Archived" });
  await repo.shutdown();
  repo = new LazyMissionRepo({ storage });
  globalValues.automergeRepo = repo;
  const find = vi.spyOn(repo, "find");
  await populateMissionCatalogOnce(repo, ids);
  expect(await getMissionSummaries([])).toEqual([]);
  expect((await getMissionSummaries(ids)).map((m) => m.id)).toEqual([ids[0]]);
  expect(await getMissionSummaries(ids, true)).toHaveLength(2);
  for (const route of ["missionHomepageItems", "missionCatalog", "maestro/v2/getMissions"]) {
    const res = await supertest(app)
      .get(`/api/v1/${route}`)
      .set("emss-token", process.env.EMSS_TOKEN);
    expect(res.statusCode).toBe(200);
  }
  expect(find).not.toHaveBeenCalled();
  expect(Object.keys(repo.handles)).toHaveLength(0);
});

test("EVA lookup preserves duplicates and archives, loading only matching missions", async () => {
  const eva = generateBlankEVA({ name: "As planned" });
  const copy = generateBlankEVA({ refUuid: eva.refUuid });
  const rex = generateBlankRex({ evaUuid: copy.uuid });
  const excluded = generateBlankRex({ evaUuid: copy.uuid, maestroEventId: "connected" });
  const fields = {
    evas: { [eva.uuid]: eva, [copy.uuid]: copy },
    rexes: { [rex.uuid]: rex, [excluded.uuid]: excluded },
  };
  const first = await createMission(fields);
  const second = await createMission({ ...fields, archivedAt: 123 });
  await createMission({ name: "Unrelated history" });
  const find = vi.spyOn(repo, "find");
  expect(await getMissionIdsForEva(eva.uuid)).toEqual(ids.slice(0, 2));
  expect((await getRexesByEva(eva.uuid)).map((r) => r.uuid)).toEqual([rex.uuid, rex.uuid]);
  expect(find.mock.calls.map(([url]) => url)).toEqual([first.url, second.url]);
  find.mockClear();
  expect(await getRexesByEva("missing")).toEqual([]);
  expect(find).not.toHaveBeenCalled();
});

test("persisted edits update names, archives, EVA membership and the small REX clock summary", async () => {
  const eva = generateBlankEVA();
  const handle = await createMission({ evas: { [eva.uuid]: eva } });
  const rex = generateBlankRex({ evaUuid: eva.uuid, isRunning: true, petRunning: true });
  const runtime = startMissionCatalogRuntime(repo, storage);
  try {
    handle.change((m) => {
      m.name = "Renamed";
      m.rexes[rex.uuid] = rex;
    });
    await repo.flush();
    await runtime.refresh();
    const [summary] = await getMissionSummaries(ids);
    expect(summary.name).toBe("Renamed");
    expect(summary.runningRex).toMatchObject({ uuid: rex.uuid, petRunning: true });
    expect(summary.runningRex).not.toHaveProperty("posEntries");
    const response = await supertest(app)
      .get("/api/v1/maestro/v2/getMissions")
      .set("emss-token", process.env.EMSS_TOKEN);
    expect(response.body.data[ids[0]].evas).toEqual([]);
    handle.change((m) => {
      m.evas[eva.uuid].name = "Renamed EVA";
      m.rexes[rex.uuid].name = "Renamed running REX";
      m.rexes[rex.uuid].petRunning = false;
      m.rexes[rex.uuid].petValueAtStartStop = "+01:00:00";
      m.rexes[rex.uuid].petStartStopTimestamp = "2026-10-21T12:00:00.000Z";
    });
    await repo.flush();
    await runtime.refresh();
    expect((await getMissionSummaries(ids))[0].runningRex).toMatchObject({
      name: "Renamed running REX",
      petRunning: false,
      petValueAtStartStop: "+01:00:00",
      petStartStopTimestamp: "2026-10-21T12:00:00.000Z",
    });
    expect(
      await globalValues.orm.em
        .fork()
        .execute("select name from mission_eva_catalog_db where mission_id = ? and eva_uuid = ?", [
          ids[0],
          eva.uuid,
        ])
    ).toEqual([{ name: "Renamed EVA" }]);
    handle.change((m) => {
      m.archivedAt = 123;
      m.rexes[rex.uuid].isRunning = false;
      delete m.evas[eva.uuid];
    });
    await repo.flush();
    await runtime.refresh();
    expect(await getMissionSummaries(ids)).toEqual([]);
    expect((await getMissionSummaries(ids, true))[0].runningRex).toBeNull();
    expect(await getMissionIdsForEva(eva.uuid)).toEqual([]);
  } finally {
    await runtime.stop();
  }
});

test("an edit saved during projection queues another update", async () => {
  const handle = await createMission();
  const originalFlush = repo.flush.bind(repo);
  const runtime = startMissionCatalogRuntime(repo, storage);
  try {
    vi.spyOn(repo, "flush").mockImplementationOnce(async (documents) => {
      handle.change((m) => {
        m.name = "Second edit";
      });
      await originalFlush(documents);
    });
    handle.change((m) => {
      m.name = "First edit";
    });
    await originalFlush();
    await vi.waitFor(
      async () => expect((await getMissionSummaries(ids))[0].name).toBe("Second edit"),
      { timeout: 8_000 }
    );
  } finally {
    await runtime.stop();
  }
});

test("projection never publishes an edit made after its document flush", async () => {
  // Prevent the repo's background save timer from hiding an unsaved concurrent edit.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const reader = new Repo({ storage });
  try {
    const handle = await createMission();
    const originalFlush = repo.flush.bind(repo);
    vi.spyOn(repo, "flush").mockImplementationOnce(async (documents) => {
      await originalFlush(documents);
      handle.change((m) => {
        m.name = "Not persisted yet";
      });
    });
    handle.change((m) => {
      m.name = "Persisted edit";
    });

    await refreshMissionCatalog(repo, handle);
    const persisted = await reader.find<Mission>(handle.url);
    expect(persisted.doc().name).toBe("Persisted edit");
    expect((await getMissionSummaries(ids))[0].name).toBe(persisted.doc().name);

    // A later save must still recognize the concurrent edit as needing projection.
    await refreshMissionCatalog(repo, handle);
    expect((await getMissionSummaries(ids))[0].name).toBe("Not persisted yet");
  } finally {
    await reader.shutdown();
    vi.useRealTimers();
  }
});

test("merged remote edits are indexed through storage, without an HTTP mutation", async () => {
  const handle = await createMission();
  const runtime = startMissionCatalogRuntime(repo, storage);
  try {
    const remote = Automerge.change(Automerge.clone(handle.doc()), (m) => {
      m.name = "Remote rename";
    });
    repo.import(Automerge.save(remote), { docId: handle.documentId });
    await repo.flush();
    await vi.waitFor(
      async () => expect((await getMissionSummaries(ids))[0].name).toBe("Remote rename"),
      { timeout: 5_000 }
    );
  } finally {
    await runtime.stop();
  }
});

test("unrelated changes and sync-state saves do not rewrite catalog rows", async () => {
  const eva = generateBlankEVA();
  const handle = await createMission({ evas: { [eva.uuid]: eva } });
  const em = globalValues.orm.em.fork();
  const versions = () =>
    em.execute(
      `select c.xmin::text as mission, e.xmin::text as eva from mission_catalog_db c
     join mission_eva_catalog_db e using (mission_id) where mission_id = ?`,
      [ids[0]]
    );
  const before = await versions();
  handle.change((m) => {
    m.description = "An edit outside the summary";
  });
  await refreshMissionCatalog(repo, handle);
  expect(await versions()).toEqual(before);
  const onSave = vi.fn();
  storage.onDocumentSaved = onSave;
  try {
    await storage.save([handle.documentId, "sync-state", "test-peer"], new Uint8Array([1]));
    expect(onSave).not.toHaveBeenCalled();
  } finally {
    storage.onDocumentSaved = undefined;
  }
});

test("unrelated local and remote edits, including timestamp changes, perform no catalog queries", async () => {
  const eva = generateBlankEVA();
  const running = generateBlankRex({ evaUuid: eva.uuid, isRunning: true });
  const inactive = generateBlankRex({ evaUuid: eva.uuid });
  const handle = await createMission({
    evas: { [eva.uuid]: eva },
    rexes: { [running.uuid]: running, [inactive.uuid]: inactive },
  });
  const originalUpdatedAt = handle.doc().updatedAt;
  const runtime = startMissionCatalogRuntime(repo, storage);
  const fork = vi.spyOn(globalValues.orm.em, "fork");
  const flush = vi.spyOn(repo, "flush");
  try {
    handle.change((m) => {
      m.description = "Unrelated mission content";
      m.updatedAt = originalUpdatedAt + 1;
      m.evas[eva.uuid].description = "EVA notes";
      m.evas[eva.uuid].updatedAt += 1;
      m.rexes[running.uuid].posEntries = [generateBlankPosEntry()];
      m.rexes[running.uuid].updatedAt += 1;
      m.rexes[inactive.uuid].name = "Inactive REX name";
      m.rexes[inactive.uuid].petRunning = true;
    });
    await repo.flush();
    flush.mockClear();
    await runtime.refresh();
    expect(fork).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();

    const remote = Automerge.change(Automerge.clone(handle.doc()), (m) => {
      m.description = "Remote unrelated edit";
      m.updatedAt += 1;
    });
    repo.import(Automerge.save(remote), { docId: handle.documentId });
    await repo.flush();
    flush.mockClear();
    await runtime.refresh();
    expect(fork).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect((await getMissionSummaries(ids))[0]).not.toHaveProperty("updatedAt");

    handle.change((m) => {
      m.name = "Relevant name change";
    });
    await repo.flush();
    await runtime.refresh();
    expect((await getMissionSummaries(ids))[0]).toMatchObject({
      name: "Relevant name change",
    });
    expect((await getMissionSummaries(ids))[0]).not.toHaveProperty("updatedAt");
    expect(handle.doc().updatedAt).toBe(originalUpdatedAt + 2);
  } finally {
    await runtime.stop();
  }
});

test("a failed projection is not remembered as indexed and retries on the next save", async () => {
  const handle = await createMission();
  const runtime = startMissionCatalogRuntime(repo, storage);
  try {
    vi.spyOn(globalValues.orm.em, "fork").mockImplementationOnce(() => {
      throw new Error("Test catalog write failure");
    });
    handle.change((m) => {
      m.name = "Name awaiting index";
    });
    await repo.flush();
    await runtime.refresh();
    expect((await getMissionSummaries(ids))[0].name).not.toBe("Name awaiting index");
    handle.change((m) => {
      m.description = "Next save retries the pending name change";
    });
    await repo.flush();
    await runtime.refresh();
    expect((await getMissionSummaries(ids))[0].name).toBe("Name awaiting index");
  } finally {
    await runtime.stop();
  }
});

test("archive endpoint enforces permissions and publishes its summary before responding", async () => {
  await createMission();
  const request = () => supertest(app).post("/api/v1/missionAutomerge/archive");
  expect((await request().send({ missionId: ids[0], archive: true })).statusCode).toBe(401);
  expect(
    (
      await request()
        .set("emss-token", process.env.EMSS_TOKEN)
        .send({ missionId: ids[0], archive: "true" })
    ).statusCode
  ).toBe(400);
  expect(
    (
      await request()
        .set("emss-token", process.env.EMSS_TOKEN)
        .send({ missionId: ids[0], archive: true })
    ).statusCode
  ).toBe(200);
  expect(await getMissionSummaries(ids)).toEqual([]);
  expect(
    (
      await request()
        .set("emss-token", process.env.EMSS_TOKEN)
        .send({ missionId: ids[0], archive: false })
    ).statusCode
  ).toBe(200);
  expect(await getMissionSummaries(ids)).toHaveLength(1);
});

test("one-time population resumes missing summaries and repeated startup loads no documents", async () => {
  const first = await createMission();
  const second = await createMission();
  await createMission();
  first.change((m) => {
    m.name = "Persisted before crash";
  });
  await repo.flush(); // Simulate dying before the projector ran.
  await globalValues.orm.em
    .fork()
    .execute("delete from mission_catalog_db where mission_id = ?", [ids[1]]);
  await repo.shutdown();
  repo = new LazyMissionRepo({ storage });
  globalValues.automergeRepo = repo;
  const find = vi.spyOn(repo, "find");
  await populateMissionCatalogOnce(repo, ids);
  expect(find.mock.calls.map(([url]) => url)).toEqual([second.url]);
  expect(Object.keys(repo.handles)).toHaveLength(0);
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect((await getMissionSummaries([ids[1]]))[0].name).toBe("Vitest Catalog Mission");
  find.mockClear();
  await populateMissionCatalogOnce(repo, ids);
  expect(find).not.toHaveBeenCalled();
  const reloaded = await repo.find<Mission>(second.url);
  expect(reloaded.doc().name).toBe("Vitest Catalog Mission");
  find.mockClear();
  const runtime = startMissionCatalogRuntime(repo, storage);
  try {
    await repo.find(first.url);
    await runtime.refresh();
    expect((await getMissionSummaries([ids[0]]))[0].name).toBe("Persisted before crash");
    expect(find.mock.calls.map(([url]) => url)).toEqual([first.url]);
  } finally {
    await runtime.stop();
  }
});

test("deleting a listing removes both indexes and a late projector cannot recreate them", async () => {
  const eva = generateBlankEVA();
  const handle = await createMission({ evas: { [eva.uuid]: eva } });
  await globalValues.orm.em
    .fork()
    .execute("delete from doc_listing_db where mission_id = ?", [ids[0]]);
  await refreshMissionCatalog(repo, handle);
  expect(await getMissionSummaries(ids, true)).toEqual([]);
  expect(await getMissionIdsForEva(eva.uuid)).toEqual([]);
});

test("idle runtime does not query the catalog or flush documents on a timer", async () => {
  await createMission();
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const fork = vi.spyOn(globalValues.orm.em, "fork");
  const flush = vi.spyOn(repo, "flush");
  const runtime = startMissionCatalogRuntime(repo, storage);
  try {
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fork).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  } finally {
    await runtime.stop();
    vi.useRealTimers();
  }
});

test.each(["name", "description"] as const)(
  "idle eviction preserves HTTP consumers and persists %s edits before releasing",
  async (field) => {
    const handle = await createMission();
    const runtime = startMissionCatalogRuntime(repo, storage, 0);
    const release = retainMissionDocuments();
    try {
      await runtime.refresh();
      expect(repo.handles[handle.documentId]).toBeDefined();
      handle.change((m) => {
        m[field] = "Saved before eviction";
      });
      release();
      await runtime.refresh();
      expect(repo.handles[handle.documentId]).toBeUndefined();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const reloaded = await repo.find<Mission>(handle.url);
      expect(reloaded.doc()[field]).toBe("Saved before eviction");
    } finally {
      release();
      await runtime.stop();
    }
  }
);

test("missions expire four hours after their own last read or edit", async () => {
  const first = await createMission();
  const second = await createMission();
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  await repo.find(first.url);
  await repo.find(second.url);
  const runtime = startMissionCatalogRuntime(repo, storage);
  try {
    now += MISSION_IDLE_MS - 1;
    await runtime.refresh();
    expect(Object.keys(repo.handles)).toHaveLength(2);
    await repo.find(first.url); // A one-off mission request extends only this mission's lifetime.
    now += 2;
    await runtime.refresh();
    expect(repo.handles[first.documentId]).toBe(first);
    expect(repo.handles[second.documentId]).toBeUndefined();

    now += MISSION_IDLE_MS - 2;
    first.change((m) => {
      m.description = "Recent edit";
    });
    await runtime.refresh();
    expect(repo.handles[first.documentId]).toBe(first);
    now += MISSION_IDLE_MS;
    await runtime.refresh();
    expect(repo.handles[first.documentId]).toBeUndefined();
    expect((await repo.find<Mission>(first.url)).doc().description).toBe("Recent edit");
  } finally {
    await runtime.stop();
  }
});

test.each(["user", "maestro", "dust", "rex"] as const)(
  "%s pins only its mission and release starts a new four-hour grace period",
  async (consumer) => {
    const rex = generateBlankRex({
      evaUuid: "retention-eva",
      isRunning: consumer === "rex",
      petRunning: false,
    });
    const active = await createMission({ rexes: { [rex.uuid]: rex } });
    const idle = await createMission();
    if (consumer === "user") {
      globalValues.serverSocketStatus.visitorsData = [
        { missionId: active.doc().id, socketId: "first" } as VisitorData,
        { missionId: active.doc().id, socketId: "second" } as VisitorData,
      ];
    } else if (consumer === "maestro" || consumer === "dust") {
      const integration = consumer === "maestro" ? globalValues.maestroV2 : globalValues.dustV1;
      integration.docHandles.set(active.doc().id, active);
    }
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    // An unrelated connected Automerge peer must not pin the entire cache.
    vi.spyOn(repo, "peers", "get").mockReturnValue(["unrelated-peer" as never]);
    const runtime = startMissionCatalogRuntime(repo, storage);
    try {
      now += MISSION_IDLE_MS + 1;
      await runtime.refresh();
      expect(repo.handles[active.documentId]).toBe(active);
      expect(repo.handles[idle.documentId]).toBeUndefined();
      if (consumer === "user") {
        globalValues.serverSocketStatus.visitorsData.pop();
        now += MISSION_IDLE_MS;
        await runtime.refresh();
        expect(repo.handles[active.documentId]).toBe(active);
      }
      globalValues.serverSocketStatus.visitorsData = [];
      globalValues.maestroV2.docHandles.clear();
      globalValues.dustV1.docHandles.clear();
      if (consumer === "rex")
        active.change((m) => {
          m.rexes[rex.uuid].isRunning = false;
        });
      await runtime.refresh();
      now += MISSION_IDLE_MS - 1;
      await runtime.refresh();
      expect(repo.handles[active.documentId]).toBe(active);
      now += 1;
      await runtime.refresh();
      expect(repo.handles[active.documentId]).toBeUndefined();
    } finally {
      globalValues.serverSocketStatus.visitorsData = [];
      globalValues.maestroV2.docHandles.clear();
      globalValues.dustV1.docHandles.clear();
      await runtime.stop();
    }
  }
);

test("a mission joined while eviction is flushing stays loaded", async () => {
  const handle = await createMission();
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const runtime = startMissionCatalogRuntime(repo, storage);
  const flush = repo.flush.bind(repo);
  vi.spyOn(repo, "flush").mockImplementationOnce(async (documents) => {
    await flush(documents);
    globalValues.maestroV2.visitorData[handle.doc().id] = [
      { socketId: "joining" } as MaestroVisitorV2,
    ];
  });
  try {
    now += MISSION_IDLE_MS + 1;
    await runtime.refresh();
    expect(repo.handles[handle.documentId]).toBe(handle);
  } finally {
    globalValues.maestroV2.visitorData = {};
    await runtime.stop();
  }
});

test("startup preloads running REX missions, including paused PET clocks, from the catalog", async () => {
  const rex = generateBlankRex({ evaUuid: "retention-eva", isRunning: true, petRunning: false });
  const active = await createMission({ rexes: { [rex.uuid]: rex } });
  const idle = await createMission();
  const runningListings = (await missionCatalog.getRunningMissionListings()).filter((m) =>
    ids.includes(m.missionId)
  );
  expect(runningListings.map((m) => m.missionId)).toEqual([active.doc().id]);
  // Restrict the preload to this test's fixtures when running against a populated local DB.
  vi.spyOn(missionCatalog, "getRunningMissionListings").mockResolvedValue(runningListings);
  await repo.shutdown();
  repo = new LazyMissionRepo({ storage });
  globalValues.automergeRepo = repo;
  await loadRunningMissionDocuments(repo);
  expect(repo.handles[active.documentId]?.isReady()).toBe(true);
  expect(repo.handles[idle.documentId]).toBeUndefined();
});

test.each(["read", "edit"] as const)("a concurrent %s cancels idle eviction", async (activity) => {
  const handle = await createMission();
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const runtime = startMissionCatalogRuntime(repo, storage);
  const flush = repo.flush.bind(repo);
  vi.spyOn(repo, "flush").mockImplementationOnce(async (documents) => {
    await flush(documents);
    if (activity === "read") await repo.find(handle.url);
    else
      handle.change((m) => {
        m.description = "Edited during eviction";
      });
  });
  try {
    now += MISSION_IDLE_MS + 1;
    await runtime.refresh();
    expect(repo.handles[handle.documentId]).toBe(handle);
    now += MISSION_IDLE_MS - 1;
    await runtime.refresh();
    expect(repo.handles[handle.documentId]).toBe(handle);
    now += 1;
    await runtime.refresh();
    expect(repo.handles[handle.documentId]).toBeUndefined();
  } finally {
    await runtime.stop();
  }
});
