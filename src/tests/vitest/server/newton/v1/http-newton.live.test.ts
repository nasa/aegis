/**
 * Opt-in smoke test against a real Newton server. Skipped unless NEWTON_LIVE=1:
 *
 *   NEWTON_LIVE=1 NEWTON_BASE_URL=https://jsxim-gisproc1.ndc.nasa.gov/api/v1 \
 *     npx vitest run --config src/tests/vitest/vitest.config.mts \
 *     src/tests/vitest/server/newton/v1/http-newton.live.test.ts
 *
 * The traverse is mission 50's "Geology Tools Demo" → "Auxiliary EVA Sys Demo", which
 * Newton has already planned, so the POST is a cache hit and starts no job.
 */
import {
  newtonGetTraverse,
  newtonHealth,
  newtonListMaps,
  newtonOptionsFromEnv,
  newtonPostTraverse,
  newtonProbePoint,
} from "server/newton/v1/http-newton";
import { buildTraverseProblem, isComparableHash } from "server/newton/v1/convert";

const live = process.env.NEWTON_LIVE === "1";
const START: AEGISPoint = { lat: -84.223397, lng: 33.5021945 };
const GOAL: AEGISPoint = { lat: -84.2215887, lng: 33.5295438 };

describe.skipIf(!live)("Newton live smoke test", () => {
  const options = newtonOptionsFromEnv();

  it("has a base URL", () => {
    expect(options.baseUrl).toBeTruthy();
  });

  it("reports health", async () => {
    const result = await newtonHealth(options);
    expect(result).toMatchObject({ kind: "ok", data: { status: "ok" } });
  });

  it("lists the lunar slope maps", async () => {
    const result = await newtonListMaps({ planet: "moon", type: "slope" }, options);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.data.maps.length).toBeGreaterThan(0);
  });

  it("probes a point inside ms3", async () => {
    const result = await newtonProbePoint(
      { planet: "moon", lon: START.lng ?? 0, lat: START.lat ?? 0 },
      options
    );
    expect(result.kind === "ok" && result.data.maps.some((m) => m.type === "slope")).toBe(true);
  });

  it("returns a cached traverse without starting a job", async () => {
    const built = buildTraverseProblem({ planet: "moon", waypoints: [START, GOAL] });
    if (built.kind === "invalid") throw new Error(built.message);
    const posted = await newtonPostTraverse(built.problem, options);
    expect(posted).toMatchObject({ kind: "ok", data: { reuse: "cached" } });
    if (posted.kind !== "ok") return;
    expect(isComparableHash(posted.data.requestHash)).toBe(true);

    const traverse = await newtonGetTraverse(posted.data.traverseId, options);
    expect(traverse.kind === "ok" && traverse.data.status).toBe("succeeded");
    if (traverse.kind === "ok") {
      expect(traverse.data.path?.coordinates.length).toBeGreaterThan(2);
      expect(traverse.data.request_hash).toBe(posted.data.requestHash);
    }
  });
});
