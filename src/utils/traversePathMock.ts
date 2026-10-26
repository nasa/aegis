/**
 * In-browser stand-in for `GET /api/v1/traversePath`, used until the backend
 * (docs/newton-api.md steps 1–5) exists.
 *
 * Emulates the server watcher: the first GET that sees a traverse at new
 * endpoints creates rows for it, which then move through
 * submitting → pending → in_progress → succeeded/failed on a compressed clock.
 * Rows for old endpoints are kept, so the client's "applies" filter is exercised.
 *
 * Missions with a fixture in `traversePathFixtures/mission<id>.json` replay
 * results recorded from the live Newton server for matching endpoints and
 * parameter sets. Other endpoints get a synthetic path.
 */

import { v4 as uuidv4 } from "uuid";
import { TRAVERSE_PATH_MIN_LENGTH_M, isLocated, roundCoord } from "utils/traversePath";

type MockParamSet = {
  /** Matches `TraversePathMockFixtureEntry.paramSet`. */
  name: string;
  label: string | null;
  slopeLimit: number;
  /** Lateral bow as a fraction of length; the sign picks the side. */
  bow: number;
  /** Fail when `hash % failModulo === 0`. */
  failModulo: number;
  /** Extra ms added to the job's timeline. */
  delayMs: number;
};

const PARAM_SETS: MockParamSet[] = [
  { name: "default", label: null, slopeLimit: 20, bow: 0.12, failModulo: 7, delayMs: 0 },
  {
    name: "slope10",
    label: "Slope ≤ 10°",
    slopeLimit: 10,
    bow: -0.22,
    failModulo: 3,
    delayMs: 8_000,
  },
];

const SUBMIT_MS = 1_500;
const PENDING_MS = 6_000;
const RUN_MS = 20_000;
const MAX_VERTICES = 3_000;
const MOON_RADIUS_M = 1_737_400;

type MockOutcome = Pick<
  TraversePathRow,
  "status" | "method" | "path" | "mapInfo" | "runtimeMs" | "error" | "requestHash"
>;

type MockRow = Omit<TraversePathRow, keyof MockOutcome> & {
  createdAtMs: number;
  finishAtMs: number;
  outcome: MockOutcome;
};

const rows = new Map<string, MockRow>();

const fixtureLoaders = import.meta.glob<TraversePathMockFixture>("./traversePathFixtures/*.json", {
  import: "default",
});
const fixtureCache = new Map<number, Promise<Map<string, TraversePathMockFixtureEntry>>>();

function pairKey(paramSet: string, start: AEGISPoint, end: AEGISPoint): string {
  const r = (p: AEGISPoint) => `${roundCoord(p.lng)},${roundCoord(p.lat)}`;
  return `${paramSet}|${r(start)};${r(end)}`;
}

function loadFixture(missionId: number): Promise<Map<string, TraversePathMockFixtureEntry>> {
  let cached = fixtureCache.get(missionId);
  if (!cached) {
    const loader = fixtureLoaders[`./traversePathFixtures/mission${missionId}.json`];
    cached = (loader ? loader() : Promise.resolve(null)).then((fixture) => {
      const byKey = new Map<string, TraversePathMockFixtureEntry>();
      for (const entry of fixture?.entries ?? []) {
        byKey.set(pairKey(entry.paramSet, entry.start, entry.end), entry);
      }
      return byKey;
    });
    fixtureCache.set(missionId, cached);
  }
  return cached;
}

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) % 2_147_483_647;
  return h;
}

/** An 8-connected staircase along a bowed curve, like Newton's A* output. */
function buildMockPath(start: AEGISPoint, end: AEGISPoint, bow: number): TraversePathLineString {
  const metersPerDegLat = (Math.PI / 180) * MOON_RADIUS_M;
  const metersPerDegLng = metersPerDegLat * Math.cos((start.lat * Math.PI) / 180);
  const toXY = (p: AEGISPoint): [number, number] => [
    (p.lng - start.lng) * metersPerDegLng,
    (p.lat - start.lat) * metersPerDegLat,
  ];
  const toLngLat = ([x, y]: [number, number]): number[] => [
    start.lng + x / metersPerDegLng,
    start.lat + y / metersPerDegLat,
  ];

  const [ex, ey] = toXY(end);
  const length = Math.hypot(ex, ey);
  const step = Math.max(1, length / MAX_VERTICES);
  const nx = -ey / length;
  const ny = ex / length;
  const curve = (t: number): [number, number] => {
    const offset = bow * length * Math.sin(Math.PI * t);
    return [ex * t + nx * offset, ey * t + ny * offset];
  };

  const snap = (v: number) => Math.round(v / step) * step;
  let cx = snap(0);
  let cy = snap(0);
  const coords: number[][] = [toLngLat([cx, cy])];
  const samples = Math.ceil((length * (1 + Math.abs(bow) * 2)) / step);
  for (let i = 1; i <= samples; i++) {
    const [tx, ty] = curve(i / samples);
    const gx = snap(tx);
    const gy = snap(ty);
    while (cx !== gx || cy !== gy) {
      cx += Math.sign(gx - cx) * Math.min(step, Math.abs(gx - cx));
      cy += Math.sign(gy - cy) * Math.min(step, Math.abs(gy - cy));
      coords.push(toLngLat([cx, cy]));
    }
  }
  return { type: "LineString", coordinates: coords };
}

function distanceMeters(a: AEGISPoint, b: AEGISPoint): number {
  const metersPerDegLat = (Math.PI / 180) * MOON_RADIUS_M;
  const dy = (b.lat - a.lat) * metersPerDegLat;
  const dx = (b.lng - a.lng) * metersPerDegLat * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

const MS3_SLOPE: TraversePathMapInfo = {
  planet: "moon",
  type: "slope",
  name: "ms3_slope",
  resolution: [1, 1],
  description: "Mock slope map",
};

function syntheticOutcome(
  params: MockParamSet,
  hash: number,
  start: AEGISPoint,
  end: AEGISPoint
): MockOutcome {
  const fails = hash % params.failModulo === 0;
  return {
    status: fails ? "failed" : "succeeded",
    method: "astar",
    path: fails ? null : buildMockPath(start, end, params.bow),
    mapInfo: [MS3_SLOPE],
    runtimeMs: null,
    error: fails
      ? { message: "ArgumentError: no traversable path between waypoint 1 and waypoint 2" }
      : null,
    requestHash: `v1:${hash.toString(16).padStart(8, "0")}mock`,
  };
}

function recordedOutcome(entry: TraversePathMockFixtureEntry): MockOutcome {
  return {
    status: entry.status,
    method: entry.method,
    path: entry.path,
    mapInfo: entry.mapInfo,
    runtimeMs: entry.runtimeMs,
    error: entry.error,
    requestHash: entry.requestHash,
  };
}

function ensureRows(
  missionId: number,
  target: TraversePathTarget,
  fixture: Map<string, TraversePathMockFixtureEntry>,
  now: number
): void {
  const { start, end } = target;
  if (!isLocated(start) || !isLocated(end)) return;
  const s = { lat: roundCoord(start.lat), lng: roundCoord(start.lng) };
  const e = { lat: roundCoord(end.lat), lng: roundCoord(end.lng) };
  if (distanceMeters(s, e) < TRAVERSE_PATH_MIN_LENGTH_M) return;

  for (const params of PARAM_SETS) {
    const paramsKey = `${s.lng},${s.lat};${e.lng},${e.lat};moon;astar;slope=${params.slopeLimit}`;
    const key = `${missionId}|${target.refUuid}|${paramsKey}`;
    if (rows.has(key)) continue;
    const recorded = fixture.get(pairKey(params.name, s, e));
    const iso = new Date(now).toISOString();
    rows.set(key, {
      uuid: uuidv4(),
      missionId,
      traverseRefUuid: target.refUuid,
      createdFromTraverseUuid: target.traverseUuid,
      startPoint: s,
      endPoint: e,
      paramsKey,
      label: recorded ? recorded.label : params.label,
      createdAt: iso,
      updatedAt: iso,
      createdAtMs: now,
      finishAtMs: now + RUN_MS + params.delayMs,
      outcome: recorded
        ? recordedOutcome(recorded)
        : syntheticOutcome(params, hashString(paramsKey), s, e),
    });
  }
}

function materialize(row: MockRow, now: number): TraversePathRow {
  const { createdAtMs, finishAtMs, outcome, ...base } = row;
  const elapsed = now - createdAtMs;
  let status: TraversePathStatus;
  if (elapsed < SUBMIT_MS) status = "submitting";
  else if (elapsed < PENDING_MS) status = "pending";
  else if (now < finishAtMs) status = "in_progress";
  else status = outcome.status;

  const finished = status === outcome.status;
  return {
    ...base,
    status,
    method: status === "submitting" ? null : outcome.method,
    requestHash: status === "submitting" ? null : outcome.requestHash,
    path: finished ? outcome.path : null,
    mapInfo: finished ? outcome.mapInfo : null,
    runtimeMs: finished ? (outcome.runtimeMs ?? finishAtMs - createdAtMs - SUBMIT_MS) : null,
    error: finished ? outcome.error : null,
    updatedAt: new Date(Math.min(now, finishAtMs)).toISOString(),
  };
}

/** Mock `GET /api/v1/traversePath`. Targets stand in for the server's own endpoint lookup. */
export async function getMockTraversePathRows({
  missionId,
  targets,
}: {
  missionId: number;
  targets: TraversePathTarget[];
}): Promise<WrappedResponse<TraversePathRow[]>> {
  const fixture = await loadFixture(missionId);
  const now = Date.now();
  for (const target of targets) ensureRows(missionId, target, fixture, now);
  const refUuids = new Set(targets.map((t) => t.refUuid));
  const data = [...rows.values()]
    .filter((r) => r.missionId === missionId && refUuids.has(r.traverseRefUuid))
    .map((r) => materialize(r, now));
  return { status: "success", message: "", data };
}

/** Clears every mock row. */
export function resetMockTraversePathRows(): void {
  rows.clear();
}
