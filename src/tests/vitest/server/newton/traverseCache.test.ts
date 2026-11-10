// @vitest-environment node
const newton = vi.hoisted(() => ({
  newtonCancelTraverse: vi.fn(),
  newtonPostTraverse: vi.fn(),
  newtonGetTraverse: vi.fn(),
  newtonListMaps: vi.fn(),
}));
vi.mock("server/newton/v1/http-newton", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...newton,
}));

import { MikroORM } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import config from "server/database/mikro-orm.config";
import { Migration20261110000000 } from "server/database/migrations/Migration20261110000000-newton-traverse";
import { Doc_Listing_db, Doc_Listing_dbSchema } from "server/database/models/doc_listing.model";
import {
  Newton_Traverse_db,
  Newton_Traverse_dbSchema,
} from "server/database/models/newton_traverse.model";
import { globalValues } from "server/express/global";
import { buildTraverseProblem } from "server/newton/v1/convert";
import { canonicalNewtonRequest, newtonInputSignature } from "utils/newtonInputs";
import {
  clearMapsFingerprintCache,
  newtonQueueCounts,
  pumpNewtonQueue,
  requestKey,
  requestNewtonTraverse,
  setNewtonClaimLockKey,
  simplifyToleranceM,
  startNewtonTraverseCache,
  stopNewtonTraverseCache,
} from "server/newton/traverseCache";

const schema = "vitest_newton_cache_" + randomUUID().replaceAll("-", "");
const START: AEGISPoint = { lat: -84.223397, lng: 33.5021945 };
const GOAL: AEGISPoint = { lat: -84.2215887, lng: 33.5295438 };

const SLOPE_MAP: Newton.MapInfo = {
  name: "ms3_slope",
  planet: "moon",
  type: "slope",
  crs: "",
  extent: [0, 0, 1, 1],
  resolution: [1, 1],
};

function problem(waypoints: AEGISPoint[] = [START, GOAL], slopeLimit?: number) {
  const built = buildTraverseProblem({ planet: "moon", waypoints, slopeLimit });
  if (built.kind === "invalid") throw new Error(built.message);
  return built.problem;
}

const okPost = (traverseId: string, reuse: NewtonTraverseReuse = "new") => ({
  kind: "ok",
  status: 202,
  data: { traverseId, requestHash: `v1:${"a".repeat(64)}`, reuse },
});

/** A straight-ish raw path with many vertices, about one per metre. */
function rawPath(from: AEGISPoint, to: AEGISPoint, n = 101): Newton.LineString {
  return {
    type: "LineString",
    coordinates: Array.from({ length: n }, (_, i) => [
      from.lng + ((to.lng - from.lng) * i) / (n - 1),
      from.lat + ((to.lat - from.lat) * i) / (n - 1),
    ]),
  };
}

const traverse = (status: Newton.WorkStatus, extra: Partial<Newton.Traverse> = {}) => ({
  kind: "ok",
  status: 200,
  data: {
    traverse_problem: {},
    method: "astar",
    status,
    runtime: status === "succeeded" ? 5000 : null,
    path: status === "succeeded" ? rawPath(START, GOAL) : null,
    map_info: status === "succeeded" ? [SLOPE_MAP] : [],
    request_hash: `v1:${"a".repeat(64)}`,
    effective_problem: { slope_limit: 20 },
    ...extra,
  } satisfies Newton.Traverse,
});

const maps = (names = ["ms3_slope"]) => ({
  kind: "ok",
  status: 200,
  data: { maps: names.map((name) => ({ ...SLOPE_MAP, name })) },
});

const em = () => globalValues.orm.em.fork();
const rowFor = (p: Newton.TraverseProblem) =>
  em().findOne(Newton_Traverse_db, { requestKey: requestKey(p) }, { populate: ["rawPath"] });
const age = (uuid: string, fields: Partial<Newton_Traverse_db>) =>
  em().nativeUpdate(Newton_Traverse_db, { uuid }, fields);
const ago = (ms: number) => new Date(Date.now() - ms);
/** Clients poll by asking again with the same request. */
const again = (p: Newton.TraverseProblem = problem()) => requestNewtonTraverse(p);

beforeAll(async () => {
  globalValues.orm = await MikroORM.init({
    ...config,
    schema,
    entities: [Doc_Listing_dbSchema, Newton_Traverse_dbSchema],
    entitiesTs: [Doc_Listing_dbSchema, Newton_Traverse_dbSchema],
  });
  // doc_listing_db from the entity; newton_traverse_db from the shipped migration below.
  await globalValues.orm.schema.create();
  await globalValues.orm.em.getConnection().execute(`drop table "${schema}".newton_traverse_db`);
  // Run the shipped migration, down and up, rather than schema generation.
  await globalValues.orm.em.fork().transactional(async (tx) => {
    await tx.execute(`set local search_path to "${schema}"`);
    const up = new Migration20261110000000(tx.getDriver(), globalValues.orm.config);
    up.up();
    for (const query of up.getQueries()) await tx.execute(query as string);
    const down = new Migration20261110000000(tx.getDriver(), globalValues.orm.config);
    down.down();
    for (const query of down.getQueries()) await tx.execute(query as string);
    up.reset();
    up.up();
    for (const query of up.getQueries()) await tx.execute(query as string);
  });
  setNewtonClaimLockKey(Math.floor(Math.random() * 1_000_000_000));
});

afterAll(async () => {
  if (!globalValues.orm) return;
  await globalValues.orm.em.getConnection().execute(`drop schema if exists "${schema}" cascade`);
  await globalValues.orm.close();
});

beforeEach(async () => {
  vi.stubEnv("NEWTON_BASE_URL", "https://newton.example/api/v1");
  vi.stubEnv("NEWTON_MAX_IN_FLIGHT", "1");
  vi.stubEnv("NEWTON_POLL_THROTTLE_MS", "2000");
  vi.stubEnv("NEWTON_FAILED_TTL_MS", String(24 * 60 * 60_000));
  clearMapsFingerprintCache();
  newton.newtonListMaps.mockResolvedValue(maps());
  newton.newtonGetTraverse.mockResolvedValue(traverse("in_progress"));
  await em().nativeDelete(Newton_Traverse_db, {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("request key", () => {
  it("is stable for waypoints that differ by less than the rounding", () => {
    const nudged = { lat: START.lat + 2e-9, lng: START.lng - 3e-9 };
    expect(requestKey(problem([nudged, GOAL]))).toBe(requestKey(problem()));
  });

  it("differs by waypoint order, intermediate points and parameters", () => {
    const keys = new Set([
      requestKey(problem()),
      requestKey(problem([GOAL, START])),
      requestKey(problem([START, { lat: -84.222, lng: 33.51 }, GOAL])),
      requestKey(problem(undefined, 20)),
    ]);
    expect(keys.size).toBe(4);
  });

  it("leaves out omitted parameters rather than storing defaults", () => {
    expect(JSON.parse(canonicalNewtonRequest(problem()))).not.toHaveProperty("slope_limit");
  });

  it("is the hash of the client's input signature", async () => {
    const signature = newtonInputSignature("moon", [START, GOAL], { slopeLimit: 20 });
    expect(signature).toBe(canonicalNewtonRequest(problem(undefined, 20)));
    const { createHash } = await import("node:crypto");
    expect(requestKey(problem(undefined, 20))).toBe(
      createHash("sha256").update(signature).digest("hex")
    );
  });

  it("uses half the slope map's resolution as the simplify tolerance", () => {
    expect(simplifyToleranceM([{ ...SLOPE_MAP, resolution: [5, 5] }])).toBe(2.5);
    expect(simplifyToleranceM(null)).toBe(0.5);
  });
});

describe("requestNewtonTraverse", () => {
  it("submits once, then returns the stored row for the same request", async () => {
    newton.newtonPostTraverse.mockResolvedValue(okPost("job-1"));
    const first = await requestNewtonTraverse(problem(), { username: "ann" });
    expect(first.status).toBe("pending");
    expect(first.requestHash).toMatch(/^v1:/);
    expect(first.inputSignature).toBe(newtonInputSignature("moon", [START, GOAL]));

    const second = await requestNewtonTraverse(problem());
    expect(second.uuid).toBe(first.uuid);
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(1);
    expect(newton.newtonPostTraverse).toHaveBeenCalledWith(problem());

    const stored = await rowFor(problem());
    expect(stored).toMatchObject({ firstUsername: "ann", submitAttempts: 1 });
  });

  it("shares one row between concurrent requests for the same waypoints", async () => {
    newton.newtonPostTraverse.mockResolvedValue(okPost("job-1"));
    const rows = await Promise.all(
      Array.from({ length: 5 }, () => requestNewtonTraverse(problem()))
    );
    expect(new Set(rows.map((row) => row.uuid)).size).toBe(1);
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(1);
  });

  it("finishes the row in the POST when Newton answers cached", async () => {
    newton.newtonPostTraverse.mockResolvedValue(okPost("job-1", "cached"));
    newton.newtonGetTraverse.mockResolvedValue(traverse("succeeded"));
    const row = await requestNewtonTraverse(problem());
    expect(row.status).toBe("succeeded");
    expect(row.rawVertexCount).toBe(101);
    // A straight line simplifies to its two ends, snapped to the rounded waypoints.
    expect(row.path).toEqual([
      { lat: -84.223397, lng: 33.5021945 },
      { lat: -84.2215887, lng: 33.5295438 },
    ]);
    expect(row.segmentDistances).toHaveLength(1);
    expect(row.segmentDistances[0]).toBeCloseTo(99.9, 0);
    expect(row.mapInfo).toEqual([{ name: "ms3_slope", type: "slope", resolution: [1, 1] }]);
    expect(row.runtimeMs).toBe(5000);
    expect(row).not.toHaveProperty("rawPath");
  });

  it("records a deduplicated job", async () => {
    newton.newtonPostTraverse.mockResolvedValue(okPost("job-1", "deduplicated"));
    await requestNewtonTraverse(problem());
    expect((await rowFor(problem())).deduplicated).toBe(true);
  });

  it("stores a rejected submission as failed", async () => {
    newton.newtonPostTraverse.mockResolvedValue({
      kind: "rejected",
      status: 400,
      error: { code: "no_slope_map", message: "outside coverage", details: [] },
    });
    const row = await requestNewtonTraverse(problem());
    expect(row).toMatchObject({ status: "failed", error: { code: "no_slope_map" } });
  });
});

describe("refresh on read", () => {
  async function pendingRow() {
    newton.newtonPostTraverse.mockResolvedValue(okPost("job-1"));
    return requestNewtonTraverse(problem());
  }

  it("moves pending → succeeded across reads and stores the simplified path", async () => {
    const { uuid } = await pendingRow();
    const stored = await rowFor(problem());
    await age(uuid, { lastPolledAt: ago(5_000) });
    newton.newtonGetTraverse.mockResolvedValueOnce(traverse("in_progress"));
    expect((await again()).status).toBe("in_progress");
    expect(newton.newtonGetTraverse).toHaveBeenCalledWith(stored.newtonTraverseId);

    await age(uuid, { lastPolledAt: ago(5_000) });
    newton.newtonGetTraverse.mockResolvedValueOnce(traverse("succeeded"));
    const done = await again();
    expect(done.status).toBe("succeeded");
    expect(done.path).toHaveLength(2);

    const raw = await requestNewtonTraverse(problem(), {}, { raw: true });
    expect(raw.rawPath).toHaveLength(101);
    expect(newton.newtonGetTraverse).toHaveBeenCalledTimes(2);
  });

  it("makes no Newton call inside the throttle window", async () => {
    const { uuid } = await pendingRow();
    await age(uuid, { lastPolledAt: new Date() });
    await again();
    expect(newton.newtonGetTraverse).not.toHaveBeenCalled();
  });

  it("makes one Newton call for concurrent reads", async () => {
    const { uuid } = await pendingRow();
    await age(uuid, { lastPolledAt: ago(5_000) });
    newton.newtonGetTraverse.mockResolvedValue(traverse("in_progress"));
    await Promise.all(Array.from({ length: 5 }, () => again()));
    expect(newton.newtonGetTraverse).toHaveBeenCalledTimes(1);
  });

  it("stores a failed job's error", async () => {
    const { uuid } = await pendingRow();
    await age(uuid, { lastPolledAt: ago(5_000) });
    newton.newtonGetTraverse.mockResolvedValue(
      traverse("failed", {
        error: { code: "no_path", message: "no route", details: [{ segment: 0 }] },
      })
    );
    expect(await again()).toMatchObject({
      status: "failed",
      error: { code: "no_path", details: [{ segment: 0 }] },
    });
  });

  it("resubmits when Newton has lost the job", async () => {
    const { uuid } = await pendingRow();
    await age(uuid, { lastPolledAt: ago(5_000) });
    newton.newtonGetTraverse.mockResolvedValue({
      kind: "rejected",
      status: 404,
      error: { code: "not_found", message: "gone", details: [] },
    });
    expect((await again()).status).toBe("queued");
    newton.newtonPostTraverse.mockResolvedValue(okPost("job-2"));
    expect((await again()).status).toBe("pending");
    expect((await rowFor(problem())).newtonTraverseId).toBe("job-2");
  });

  it("returns the stored row when Newton is unreachable", async () => {
    const { uuid } = await pendingRow();
    await age(uuid, { lastPolledAt: ago(5_000) });
    newton.newtonGetTraverse.mockResolvedValue({
      kind: "transient",
      status: 503,
      reason: "non_json",
      message: "proxy",
    });
    expect((await again()).status).toBe("pending");
  });
});

describe("concurrency limit", () => {
  it("queues a second request, then submits it when the first finishes", async () => {
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-1"));
    const first = await requestNewtonTraverse(problem());
    const second = await requestNewtonTraverse(problem([GOAL, START]));
    expect(second.status).toBe("queued");
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(1);

    // Reading the queued row polls the running one, frees its slot, and submits.
    await age(first.uuid, { lastPolledAt: ago(5_000) });
    newton.newtonGetTraverse.mockResolvedValueOnce(traverse("succeeded"));
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-2"));
    expect((await again(problem([GOAL, START]))).status).toBe("pending");
    expect((await again()).status).toBe("succeeded");
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(2);
  });

  it("never has more than the limit in flight under concurrent requests", async () => {
    vi.stubEnv("NEWTON_MAX_IN_FLIGHT", "2");
    newton.newtonPostTraverse.mockImplementation(async () => okPost(randomUUID()));
    const requests = Array.from({ length: 6 }, (_, i) =>
      problem([START, { lat: GOAL.lat, lng: GOAL.lng + i * 1e-4 }])
    );
    const rows = await Promise.all(requests.map((p) => requestNewtonTraverse(p)));
    expect(rows.filter((row) => row.status === "pending")).toHaveLength(2);
    expect(rows.filter((row) => row.status === "queued")).toHaveLength(4);
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(2);
  });
});

describe("failures and resubmits", () => {
  it("returns a failure from the cache until the TTL, then resubmits", async () => {
    newton.newtonPostTraverse.mockResolvedValueOnce({
      kind: "rejected",
      status: 400,
      error: { code: "waypoint_not_traversable", message: "blocked", details: [] },
    });
    const failed = await requestNewtonTraverse(problem());
    expect((await requestNewtonTraverse(problem())).status).toBe("failed");
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(1);

    await age(failed.uuid, { finishedAt: ago(25 * 60 * 60_000) });
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-2"));
    const retried = await requestNewtonTraverse(problem());
    expect(retried).toMatchObject({ uuid: failed.uuid, status: "pending", error: null });
  });

  it("leaves a transient submit failure queued, and a later read resubmits it", async () => {
    newton.newtonPostTraverse.mockResolvedValueOnce({
      kind: "transient",
      status: null,
      reason: "network",
      message: "fetch failed",
    });
    const row = await requestNewtonTraverse(problem());
    expect(row).toMatchObject({ status: "queued", error: { code: "transient_network" } });
    const stored = await rowFor(problem());
    expect(stored.nextSubmitAt.getTime()).toBeGreaterThan(Date.now());

    // Within the back-off nothing is sent.
    await again();
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(1);

    await age(row.uuid, { nextSubmitAt: ago(1) });
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-1"));
    expect((await again()).status).toBe("pending");
    expect((await rowFor(problem())).submitAttempts).toBe(2);
  });

  it("resubmits a cached success when Newton's maps change", async () => {
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-1", "cached"));
    newton.newtonGetTraverse.mockResolvedValueOnce(traverse("succeeded"));
    const row = await requestNewtonTraverse(problem());
    expect(row.status).toBe("succeeded");

    // Same maps: a cache hit with no Newton POST.
    await requestNewtonTraverse(problem());
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(1);

    clearMapsFingerprintCache();
    newton.newtonListMaps.mockResolvedValue(maps(["ms3_slope", "ms4_slope"]));
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-2", "new"));
    expect((await requestNewtonTraverse(problem())).status).toBe("pending");
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(2);
  });

  it("keeps a success when Newton's map list can't be fetched", async () => {
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-1", "cached"));
    newton.newtonGetTraverse.mockResolvedValueOnce(traverse("succeeded"));
    await requestNewtonTraverse(problem());
    clearMapsFingerprintCache();
    newton.newtonListMaps.mockResolvedValue({
      kind: "transient",
      status: 503,
      reason: "http",
      message: "down",
    });
    expect((await requestNewtonTraverse(problem())).status).toBe("succeeded");
  });

  it("fails a success whose path is unusable", async () => {
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-1", "cached"));
    newton.newtonGetTraverse.mockResolvedValueOnce(
      traverse("succeeded", { path: { type: "LineString", coordinates: [[1, 2]] } })
    );
    expect(await requestNewtonTraverse(problem())).toMatchObject({
      status: "failed",
      error: { code: "invalid_path" },
    });
  });
});

describe("max job age", () => {
  const MAX_AGE = 10 * 60_000;

  async function oldPendingRow(reuse: NewtonTraverseReuse = "new") {
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-1", reuse));
    const row = await requestNewtonTraverse(problem());
    await age(row.uuid, { submittedAt: ago(MAX_AGE + 1_000), lastPolledAt: ago(5_000) });
    return row;
  }

  it("fails a job still running after NEWTON_MAX_JOB_AGE_MS, cancels it and frees the slot", async () => {
    await oldPendingRow();
    newton.newtonCancelTraverse.mockResolvedValue({
      kind: "ok",
      status: 202,
      data: { status: "cancelled" },
    });
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-2"));
    // The slot is taken, so this queues; the queue pump then expires the old job and
    // submits it.
    await requestNewtonTraverse(problem([GOAL, START]));
    expect(["pending", "in_progress"]).toContain((await again(problem([GOAL, START]))).status);
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(2);

    expect(await again()).toMatchObject({
      status: "failed",
      error: { code: "timeout" },
    });
    expect(newton.newtonCancelTraverse).toHaveBeenCalledExactlyOnceWith("job-1");
  });

  it("never cancels a deduplicated job", async () => {
    await oldPendingRow("deduplicated");
    expect((await again()).status).toBe("failed");
    expect(newton.newtonCancelTraverse).not.toHaveBeenCalled();
  });

  it("keeps a result that arrives on the last poll", async () => {
    await oldPendingRow();
    newton.newtonGetTraverse.mockResolvedValueOnce(traverse("succeeded"));
    expect((await again()).status).toBe("succeeded");
    expect(newton.newtonCancelTraverse).not.toHaveBeenCalled();
  });

  it("leaves a younger job alone, and honours the env override", async () => {
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-1"));
    const { uuid } = await requestNewtonTraverse(problem());
    await age(uuid, { submittedAt: ago(60_000), lastPolledAt: ago(5_000) });
    expect((await again()).status).toBe("in_progress");

    vi.stubEnv("NEWTON_MAX_JOB_AGE_MS", "30000");
    await age(uuid, { lastPolledAt: ago(5_000) });
    expect((await again()).status).toBe("failed");
  });
});

describe("abandoned rows", () => {
  it("doesn't submit a queued row nobody asked for lately, until it's asked for again", async () => {
    vi.stubEnv("NEWTON_ABANDON_MS", "60000");
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-1"));
    const first = await requestNewtonTraverse(problem());
    const stale = await requestNewtonTraverse(problem([GOAL, START]));
    expect(stale.status).toBe("queued");
    await age(stale.uuid, { lastRequestedAt: ago(61_000) });

    // The running job finishes, freeing the slot, but the stale row stays queued.
    await age(first.uuid, { lastPolledAt: ago(5_000) });
    newton.newtonGetTraverse.mockResolvedValueOnce(traverse("succeeded"));
    await pumpNewtonQueue();
    expect((await em().findOne(Newton_Traverse_db, { uuid: stale.uuid })).status).toBe("queued");
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(1);

    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-2"));
    expect((await again(problem([GOAL, START]))).status).toBe("pending");
  });
});

describe("caller stats and cache status", () => {
  it("records the first mission, and nulls it when the mission is deleted", async () => {
    const fork = em();
    const created = fork.create(Doc_Listing_db, { automergeUrl: "Vitest Newton Cache" });
    await fork.flush();
    newton.newtonPostTraverse.mockResolvedValue(okPost("job-1"));
    await requestNewtonTraverse(problem(), { username: "ann", missionId: created.missionId });
    await requestNewtonTraverse(problem(), { username: "bob", missionId: 999_999 });
    expect(await rowFor(problem())).toMatchObject({
      firstUsername: "ann",
      firstMissionId: created.missionId,
    });

    await em().nativeDelete(Doc_Listing_db, { missionId: created.missionId });
    expect((await rowFor(problem())).firstMissionId).toBeNull();
  });

  it("reports submitted, pending and hit", async () => {
    const statuses: NewtonCacheStatus[] = [];
    const onCacheStatus = (status: NewtonCacheStatus) => statuses.push(status);
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-1"));
    const { uuid } = await requestNewtonTraverse(problem(), {}, { onCacheStatus });
    await requestNewtonTraverse(problem(), {}, { onCacheStatus });
    await age(uuid, { lastPolledAt: ago(5_000) });
    newton.newtonGetTraverse.mockResolvedValueOnce(traverse("succeeded"));
    await requestNewtonTraverse(problem(), {}, { onCacheStatus });
    expect(statuses).toEqual(["submitted", "pending", "hit"]);
  });
});

describe("restart", () => {
  it("loses nothing: submitting rows are requeued and recently requested queued rows submitted", async () => {
    vi.stubEnv("NEWTON_MAX_IN_FLIGHT", "2");
    vi.stubEnv("NEWTON_TICK_MS", "3600000");
    const p1 = problem();
    const p2 = problem([GOAL, START]);
    const p3 = problem([START, { lat: -84.222, lng: 33.51 }, GOAL]);
    newton.newtonPostTraverse.mockResolvedValueOnce(okPost("job-1"));
    const pending = await requestNewtonTraverse(p1);
    // Simulate a crash mid-submit and a row still waiting in the queue.
    vi.stubEnv("NEWTON_MAX_IN_FLIGHT", "1");
    const queued = await requestNewtonTraverse(p2);
    const stuck = await requestNewtonTraverse(p3);
    await age(stuck.uuid, { status: "submitting" });
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(1);

    vi.stubEnv("NEWTON_MAX_IN_FLIGHT", "3");
    await age(pending.uuid, { lastPolledAt: ago(5_000) });
    newton.newtonGetTraverse.mockResolvedValue(traverse("in_progress"));
    newton.newtonPostTraverse.mockImplementation(async () => okPost(randomUUID()));
    await startNewtonTraverseCache();
    await stopNewtonTraverseCache();

    const statuses = await Promise.all(
      [pending, queued, stuck].map(
        async ({ uuid }) => (await em().findOne(Newton_Traverse_db, { uuid })).status
      )
    );
    expect(statuses).toEqual(["in_progress", "pending", "pending"]);
    expect(await newtonQueueCounts()).toEqual({ in_progress: 1, pending: 2 });
    expect(newton.newtonPostTraverse).toHaveBeenCalledTimes(3);
  });

  it("does nothing when Newton isn't configured", async () => {
    vi.stubEnv("NEWTON_BASE_URL", "");
    await pumpNewtonQueue();
    expect(newton.newtonListMaps).not.toHaveBeenCalled();
  });
});
