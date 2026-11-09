import fixturesJson from "../../../fixtures/newton/responses.json";
import {
  classifyResponse,
  newtonCancelTraverse,
  newtonGetTraverse,
  newtonHealth,
  newtonListMaps,
  newtonOptionsFromEnv,
  newtonPostTraverse,
  newtonProbePoint,
  NEWTON_DEFAULT_TIMEOUT_MS,
  parseNewtonError,
} from "server/newton/v1/http-newton";
import { buildTraverseProblem } from "server/newton/v1/convert";

type Fixture = { status: number; contentType: string; body: string };
const fixtures = fixturesJson as unknown as Record<string, Fixture>;

const BASE_URL = "https://newton.example/api/v1";
const TRAVERSE_ID = "ab82e76a-1019-45d2-8641-508e1327000b";

function respond(name: string): Response {
  const fixture = fixtures[name];
  return new Response(fixture.body, {
    status: fixture.status,
    headers: { "Content-Type": fixture.contentType },
  });
}

function mockFetch(...names: string[]) {
  const queue = [...names];
  return vi.fn<typeof fetch>(async () => {
    const name = queue.shift();
    if (!name) throw new Error("unexpected fetch");
    return respond(name);
  });
}

function options(fetchFn: typeof fetch, timeoutMs = 1000): NewtonClientOptions {
  return { baseUrl: BASE_URL, timeoutMs, fetch: fetchFn };
}

const problem = (() => {
  const built = buildTraverseProblem({
    planet: "moon",
    waypoints: [
      { lat: -84.223397, lng: 33.5021945 },
      { lat: -84.2215887, lng: 33.5295438 },
    ],
  });
  if (built.kind === "invalid") throw new Error(built.message);
  return built.problem;
})();

describe("newtonPostTraverse", () => {
  it("returns a new job with its hash", async () => {
    const fetchFn = mockFetch("postNew");
    const result = await newtonPostTraverse(problem, options(fetchFn));
    expect(result).toEqual({
      kind: "ok",
      status: 202,
      data: {
        traverseId: "da02444c-a9c4-4ac5-86cb-e99dd1e32ad5",
        requestHash: "v1:6b952d900a7f216461931f0600d8b0231eff9d053bc20374c76843d1a2ced001",
        reuse: "new",
      },
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/traverses`);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual(problem);
  });

  it("reports a cached result", async () => {
    const result = await newtonPostTraverse(problem, options(mockFetch("postCached")));
    expect(result.kind === "ok" && result.data).toEqual({
      traverseId: TRAVERSE_ID,
      requestHash: "v1:edb959cf42af04d6592c5fcbb9f88fc69995111d28673ba4ca266b0602f28ae1",
      reuse: "cached",
    });
  });

  it("reports a deduplicated job", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({ traverse_id: TRAVERSE_ID, request_hash: "v1:ab", deduplicated: true }),
          { status: 202 }
        )
    );
    const result = await newtonPostTraverse(problem, options(fetchFn));
    expect(result.kind === "ok" && result.data.reuse).toBe("deduplicated");
  });

  it.each([
    ["postNoSlopeMap", "no_slope_map", []],
    ["postUnknownField", "unknown_field", [{ field: "bogus" }]],
    ["postDroppedField", "dropped_field", [{ field: "obstacle_maps" }]],
    ["postOneWaypoint", "invalid_request", []],
  ])("rejects %s with code %s", async (name, code, details) => {
    const result = await newtonPostTraverse(problem, options(mockFetch(name)));
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.status).toBe(400);
    expect(result.error.code).toBe(code);
    expect(result.error.details).toEqual(details);
    expect(result.error.message).not.toBe("");
  });

  it("treats 413 as rejected", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "payload_too_large", message: "too big", details: [] },
          }),
          { status: 413 }
        )
    );
    const result = await newtonPostTraverse(problem, options(fetchFn));
    expect(result).toMatchObject({ kind: "rejected", status: 413 });
  });

  it("treats a Newton 503 with the error model as transient and keeps the error", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "service_unavailable", message: "re-run prepare-maps", details: [] },
          }),
          { status: 503 }
        )
    );
    const result = await newtonPostTraverse(problem, options(fetchFn));
    expect(result).toMatchObject({
      kind: "transient",
      status: 503,
      reason: "http",
      message: "re-run prepare-maps",
      error: { code: "service_unavailable" },
    });
  });

  it("treats a 500 as transient", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "internal_error", message: "boom", details: [] } }),
          { status: 500 }
        )
    );
    const result = await newtonPostTraverse(problem, options(fetchFn));
    expect(result).toMatchObject({ kind: "transient", status: 500, reason: "http" });
  });

  it.each([
    ["proxy502", 502],
    ["proxy503", 503],
  ])("treats the proxy's HTML %s as transient", async (name, status) => {
    const result = await newtonPostTraverse(problem, options(mockFetch(name)));
    expect(result).toMatchObject({ kind: "transient", status, reason: "non_json" });
    if (result.kind === "transient") expect(result.message.length).toBeLessThanOrEqual(200);
  });

  it("treats a 202 without a traverse_id as transient", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("{}", { status: 202 }));
    const result = await newtonPostTraverse(problem, options(fetchFn));
    expect(result).toMatchObject({ kind: "transient", reason: "unexpected_body" });
  });

  it("treats a network error as transient", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const result = await newtonPostTraverse(problem, options(fetchFn));
    expect(result).toEqual({
      kind: "transient",
      status: null,
      reason: "network",
      message: "fetch failed",
    });
  });

  it("treats a timeout as transient", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        })
    );
    const result = await newtonPostTraverse(problem, options(fetchFn, 20));
    expect(result).toMatchObject({ kind: "transient", status: null, reason: "timeout" });
  });

  it("is disabled without a base URL and makes no request", async () => {
    const fetchFn = mockFetch();
    const result = await newtonPostTraverse(problem, {
      baseUrl: "",
      timeoutMs: 1000,
      fetch: fetchFn,
    });
    expect(result).toMatchObject({ kind: "transient", reason: "disabled" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("newtonGetTraverse", () => {
  it("returns a succeeded traverse with its path and maps", async () => {
    const fetchFn = mockFetch("getSucceeded");
    const result = await newtonGetTraverse(TRAVERSE_ID, options(fetchFn));
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE_URL}/traverses/${TRAVERSE_ID}`);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.data.status).toBe("succeeded");
    expect(result.data.path?.type).toBe("LineString");
    expect(result.data.path?.coordinates).toHaveLength(101);
    expect(result.data.map_info?.map((m) => m.name)).toEqual(["ms3_slope"]);
    expect(result.data.request_hash).toMatch(/^v1:/);
    expect(result.data.runtime).toBe(89298);
  });

  it("returns an in-progress traverse with no path", async () => {
    const result = await newtonGetTraverse(TRAVERSE_ID, options(mockFetch("getInProgress")));
    expect(result.kind === "ok" && result.data).toMatchObject({
      status: "in_progress",
      path: null,
      runtime: null,
    });
  });

  it("returns a failed traverse's error (legacy message wrapped as internal_error)", async () => {
    const result = await newtonGetTraverse(TRAVERSE_ID, options(mockFetch("getFailedLegacy")));
    expect(result.kind === "ok" && result.data.error).toEqual({
      code: "internal_error",
      message: "ArgumentError: no traversable path between waypoint 1 and waypoint 2",
      details: [],
    });
  });

  it("returns a cancelled traverse", async () => {
    const result = await newtonGetTraverse(TRAVERSE_ID, options(mockFetch("getCancelled")));
    expect(result.kind === "ok" && result.data).toMatchObject({
      status: "cancelled",
      cancel_requested: true,
    });
  });

  it("rejects an unknown id", async () => {
    const result = await newtonGetTraverse(TRAVERSE_ID, options(mockFetch("getNotFound")));
    expect(result).toMatchObject({ kind: "rejected", status: 404, error: { code: "not_found" } });
  });

  it("encodes the id", async () => {
    const fetchFn = mockFetch("getNotFound");
    await newtonGetTraverse("a/b?c", options(fetchFn));
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE_URL}/traverses/a%2Fb%3Fc`);
  });
});

describe("newtonCancelTraverse", () => {
  it("returns the status after the request", async () => {
    const fetchFn = mockFetch("deleteRunningLegacy");
    const result = await newtonCancelTraverse(TRAVERSE_ID, options(fetchFn));
    expect(fetchFn.mock.calls[0][1]?.method).toBe("DELETE");
    expect(result.kind === "ok" && result.data.status).toBe("cancelled");
  });

  it("rejects an unknown id", async () => {
    const result = await newtonCancelTraverse(TRAVERSE_ID, options(mockFetch("deleteNotFound")));
    expect(result).toMatchObject({ kind: "rejected", status: 404 });
  });

  it("rejects an already finished job (409)", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "already_finished", message: "traverse already finished", details: [] },
          }),
          { status: 409 }
        )
    );
    const result = await newtonCancelTraverse(TRAVERSE_ID, options(fetchFn));
    expect(result).toMatchObject({
      kind: "rejected",
      status: 409,
      error: { code: "already_finished" },
    });
  });
});

describe("maps, probe and health", () => {
  it("lists maps with filters", async () => {
    const fetchFn = mockFetch("maps");
    const result = await newtonListMaps({ planet: "moon", type: "slope" }, options(fetchFn));
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE_URL}/traverses/maps?planet=moon&type=slope`);
    expect(result.kind === "ok" && result.data.maps.map((m) => m.name)).toEqual(["ms3_slope"]);
    expect(result.kind === "ok" && result.data.maps[0].resolution).toEqual([1, 1]);
  });

  it("lists maps without filters", async () => {
    const fetchFn = mockFetch("maps");
    await newtonListMaps({}, options(fetchFn));
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE_URL}/traverses/maps`);
  });

  it("rejects a bad map type", async () => {
    const result = await newtonListMaps({}, options(mockFetch("mapsBadType")));
    expect(result).toMatchObject({ kind: "rejected", error: { code: "invalid_request" } });
  });

  it("probes a point", async () => {
    const fetchFn = mockFetch("probeInside", "probeOutside");
    const inside = await newtonProbePoint(
      { planet: "moon", lon: 33.5021945, lat: -84.223397 },
      options(fetchFn)
    );
    expect(fetchFn.mock.calls[0][0]).toBe(
      `${BASE_URL}/traverses/maps/probe?planet=moon&lon=33.5021945&lat=-84.223397`
    );
    expect(inside.kind === "ok" && inside.data.maps.map((m) => m.name).sort()).toEqual([
      "ms3_elevation",
      "ms3_slope",
    ]);
    const outside = await newtonProbePoint(
      { planet: "moon", lon: -17.5, lat: -3.6 },
      options(fetchFn)
    );
    expect(outside.kind === "ok" && outside.data.maps).toEqual([]);
  });

  it("returns health with the terrain cache", async () => {
    const fetchFn = mockFetch("health");
    const result = await newtonHealth(options(fetchFn));
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE_URL}/health`);
    expect(result.kind === "ok" && result.data).toMatchObject({
      status: "ok",
      sha: "9dfcb1c",
      terrain_cache: { budget_bytes: 100000000000 },
    });
  });

  it("strips a trailing slash from the base URL", async () => {
    const fetchFn = mockFetch("health");
    await newtonHealth({ baseUrl: `${BASE_URL}/`, timeoutMs: 1000, fetch: fetchFn });
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE_URL}/health`);
  });
});

describe("parseNewtonError", () => {
  it("parses the error model and drops malformed details", () => {
    expect(
      parseNewtonError({
        error: {
          code: "waypoint_not_traversable",
          message: "blocked",
          details: [{ waypoint: 0, lonlat: [1, 2], reason: "blocked" }, "junk"],
        },
      })
    ).toEqual({
      code: "waypoint_not_traversable",
      message: "blocked",
      details: [{ waypoint: 0, lonlat: [1, 2], reason: "blocked" }],
    });
  });

  it("wraps a legacy string error as internal_error", () => {
    expect(parseNewtonError({ error: "traverse not found: x" })).toEqual({
      code: "internal_error",
      message: "traverse not found: x",
      details: [],
    });
  });

  it.each([[null], ["x"], [[]], [{}], [{ error: {} }], [{ error: { message: "no code" } }]])(
    "returns null for %j",
    (body: unknown) => {
      expect(parseNewtonError(body)).toBeNull();
    }
  );
});

describe("classifyResponse", () => {
  const anything = (body: unknown): body is unknown => body !== undefined;

  it("treats a rejected status without an error body as transient", () => {
    expect(classifyResponse(400, "{}", anything)).toMatchObject({
      kind: "transient",
      reason: "http",
    });
  });

  it("treats a non-JSON 2xx as transient", () => {
    expect(classifyResponse(200, "<html>", anything)).toMatchObject({
      kind: "transient",
      reason: "non_json",
    });
  });
});

describe("newtonOptionsFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the base URL and timeout", () => {
    vi.stubEnv("NEWTON_BASE_URL", BASE_URL);
    vi.stubEnv("NEWTON_TIMEOUT_MS", "5000");
    expect(newtonOptionsFromEnv()).toEqual({ baseUrl: BASE_URL, timeoutMs: 5000 });
  });

  it("falls back to the default timeout", () => {
    vi.stubEnv("NEWTON_TIMEOUT_MS", "nope");
    expect(newtonOptionsFromEnv().timeoutMs).toBe(NEWTON_DEFAULT_TIMEOUT_MS);
  });
});
