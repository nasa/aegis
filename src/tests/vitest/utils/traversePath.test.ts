import { afterEach, describe, expect, it, vi } from "vitest";
import {
  groupRowsByHash,
  isRowFinished,
  lineStringToPoints,
  roundedPointsEqual,
  rowApplies,
  rowErrorMessage,
  rowToCandidate,
  splitRowsForTarget,
} from "utils/traversePath";
import { getMockTraversePathRows, resetMockTraversePathRows } from "utils/traversePathMock";
import mission50Fixture from "utils/traversePathFixtures/mission50.json";

const A = { lat: -84.223397, lng: 33.5021945 };
const C = { lat: -84.22158866054008, lng: 33.529543847174324 };

function makeRow(overrides: Partial<TraversePathRow> = {}): TraversePathRow {
  return {
    uuid: "row-1",
    missionId: 1,
    traverseRefUuid: "ref-1",
    createdFromTraverseUuid: "t-1",
    startPoint: A,
    endPoint: C,
    method: "astar",
    paramsKey: "k",
    requestHash: "v1:aaa",
    status: "succeeded",
    path: {
      type: "LineString",
      coordinates: [
        [A.lng, A.lat],
        [C.lng, C.lat],
      ],
    },
    mapInfo: null,
    runtimeMs: 1000,
    error: null,
    label: null,
    createdAt: "2026-10-26T00:00:00.000Z",
    updatedAt: "2026-10-26T00:00:00.000Z",
    ...overrides,
  };
}

const target: TraversePathTarget = { traverseUuid: "t-1", refUuid: "ref-1", start: A, end: C };

describe("traversePath helpers", () => {
  it("compares endpoints after rounding to 1e-7°", () => {
    expect(roundedPointsEqual(A, { lat: A.lat + 1e-9, lng: A.lng })).toBe(true);
    expect(roundedPointsEqual(A, { lat: A.lat + 2e-7, lng: A.lng })).toBe(false);
    expect(roundedPointsEqual(A, { lat: null, lng: null })).toBe(false);
    expect(roundedPointsEqual(A, undefined)).toBe(false);
  });

  it("applies only when both endpoints match in order", () => {
    expect(rowApplies(makeRow(), target)).toBe(true);
    expect(rowApplies(makeRow({ startPoint: C, endPoint: A }), target)).toBe(false);
  });

  it("splits applying and stale rows", () => {
    const stale = makeRow({ uuid: "row-2", endPoint: { lat: -84.2, lng: 33.6 } });
    const { applying, staleCount } = splitRowsForTarget([makeRow(), stale], target);
    expect(applying.map((r) => r.uuid)).toEqual(["row-1"]);
    expect(staleCount).toBe(1);
  });

  it("groups only comparable v1 hashes", () => {
    const groups = groupRowsByHash([
      makeRow({ uuid: "a" }),
      makeRow({ uuid: "b" }),
      makeRow({ uuid: "c", requestHash: "v0:aaa" }),
      makeRow({ uuid: "d", requestHash: null }),
    ]);
    expect(groups.map((g) => g.map((r) => r.uuid))).toEqual([["a", "b"], ["c"], ["d"]]);
  });

  it("converts GeoJSON [lng, lat] to AEGIS points", () => {
    expect(lineStringToPoints(makeRow().path)).toEqual([A, C]);
    expect(lineStringToPoints(null)).toEqual([]);
  });

  it("builds candidates only for succeeded rows with a path", () => {
    const candidate = rowToCandidate(makeRow(), 1737400);
    expect(candidate?.path).toHaveLength(2);
    expect(candidate?.distanceMeters).toBeGreaterThan(90);
    expect(candidate?.distanceMeters).toBeLessThan(110);
    expect(rowToCandidate(makeRow({ status: "pending", path: null }), 1737400)).toBeNull();
  });

  it("strips the ArgumentError prefix", () => {
    const row = makeRow({
      status: "failed",
      error: { message: "ArgumentError: no traversable path between waypoint 1 and waypoint 2" },
    });
    expect(rowErrorMessage(row)).toBe("no traversable path between waypoint 1 and waypoint 2");
    expect(rowErrorMessage(makeRow())).toBeNull();
  });

  it("treats succeeded, failed and cancelled as finished", () => {
    expect(isRowFinished(makeRow({ status: "succeeded" }))).toBe(true);
    expect(isRowFinished(makeRow({ status: "failed" }))).toBe(true);
    expect(isRowFinished(makeRow({ status: "cancelled" }))).toBe(true);
    expect(isRowFinished(makeRow({ status: "submitting" }))).toBe(false);
    expect(isRowFinished(makeRow({ status: "in_progress" }))).toBe(false);
  });
});

describe("traverse path mock", () => {
  afterEach(() => {
    resetMockTraversePathRows();
    vi.useRealTimers();
  });

  it("creates rows on first sight and finishes them later", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
    const first = await getMockTraversePathRows({ missionId: 1, targets: [target] });
    expect(first.data!.length).toBeGreaterThan(0);
    expect(first.data!.every((r) => r.status === "submitting")).toBe(true);

    vi.setSystemTime(new Date("2026-10-26T00:10:00Z"));
    const later = await getMockTraversePathRows({ missionId: 1, targets: [target] });
    expect(later.data!.map((r) => r.uuid)).toEqual(first.data!.map((r) => r.uuid));
    expect(later.data!.every(isRowFinished)).toBe(true);
    for (const row of later.data!) {
      if (row.status === "succeeded") {
        const points = lineStringToPoints(row.path);
        expect(points.length).toBeGreaterThan(2);
        expect(rowApplies(row, target)).toBe(true);
      } else {
        expect(rowErrorMessage(row)).toBeTruthy();
      }
    }
  });

  it("skips unlocated and zero-length traverses", async () => {
    const res = await getMockTraversePathRows({
      missionId: 1,
      targets: [
        { ...target, refUuid: "ref-a", end: undefined },
        { ...target, refUuid: "ref-b", end: A },
      ],
    });
    expect(res.data).toEqual([]);
  });

  it("keeps old rows when endpoints move, so they show as stale", async () => {
    await getMockTraversePathRows({ missionId: 1, targets: [target] });
    const moved = { ...target, end: { lat: -84.22, lng: 33.54 } };
    const res = await getMockTraversePathRows({ missionId: 1, targets: [moved] });
    const { applying, staleCount } = splitRowsForTarget(res.data, moved);
    expect(applying.length).toBeGreaterThan(0);
    expect(staleCount).toBe(applying.length);
  });

  it("replays recorded Newton results for mission 50", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
    const recorded = (mission50Fixture as TraversePathMockFixture).entries.find(
      (e) => e.paramSet === "default" && e.status === "succeeded"
    )!;
    const recordedTarget: TraversePathTarget = {
      traverseUuid: "t-50",
      refUuid: "ref-50",
      start: recorded.start,
      end: recorded.end,
    };
    await getMockTraversePathRows({ missionId: 50, targets: [recordedTarget] });
    vi.setSystemTime(new Date("2026-10-26T00:10:00Z"));
    const res = await getMockTraversePathRows({ missionId: 50, targets: [recordedTarget] });
    const row = res.data!.find((r) => r.label === recorded.label)!;
    expect(row.status).toBe("succeeded");
    expect(row.requestHash).toBe(recorded.requestHash);
    expect(row.path).toEqual(recorded.path);
    expect(rowApplies(row, recordedTarget)).toBe(true);
  });
});
