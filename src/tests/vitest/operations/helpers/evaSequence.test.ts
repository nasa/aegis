import {
  LANDER_UUID,
  canMoveStationDown,
  canMoveStationUp,
  getEgressLocationUuid,
  getEgressSequenceItem,
  getFirstTraverseItem,
  getIngressLocationUuid,
  getIngressSequenceItem,
  getLastTraverseItem,
  getMovableStationIndexRange,
  getSequenceStationItems,
  getSequenceTraverseItems,
  getTraverseNeighborUuids,
  isFirstMovableStationIndex,
  isLanderUuid,
  isLastMovableStationIndex,
  isXgressIndex,
} from "operations/helpers/evaSequence";
import type { EvaSequenceSource } from "operations/helpers/evaSequence";

/** [traverse, station, traverse, station, traverse] */
const makeEva = (overrides: Partial<EvaSequenceSource> = {}): EvaSequenceSource => ({
  sequence: [
    { type: "traverse", uuid: "t1" },
    { type: "station", uuid: "s1" },
    { type: "traverse", uuid: "t2" },
    { type: "station", uuid: "s2" },
    { type: "traverse", uuid: "t3" },
  ],
  egressLocationUuid: LANDER_UUID,
  ingressLocationUuid: LANDER_UUID,
  ...overrides,
});

/** An EVA with no stations — a single traverse from egress straight to ingress. */
const makeEmptyEva = (overrides: Partial<EvaSequenceSource> = {}): EvaSequenceSource => ({
  sequence: [{ type: "traverse", uuid: "t1" }],
  egressLocationUuid: LANDER_UUID,
  ingressLocationUuid: LANDER_UUID,
  ...overrides,
});

describe("evaSequence", () => {
  describe("isLanderUuid()", () => {
    it("recognizes the lander sentinel", () => {
      expect(isLanderUuid(LANDER_UUID)).toBe(true);
      expect(isLanderUuid("s1")).toBe(false);
      expect(isLanderUuid(undefined)).toBe(false);
    });
  });

  describe("getEgressLocationUuid() / getIngressLocationUuid()", () => {
    it("returns the stored xgress uuids", () => {
      const eva = makeEva({ egressLocationUuid: "s9", ingressLocationUuid: "s8" });
      expect(getEgressLocationUuid(eva)).toBe("s9");
      expect(getIngressLocationUuid(eva)).toBe("s8");
    });

    it("returns undefined for a missing EVA", () => {
      expect(getEgressLocationUuid(undefined)).toBeUndefined();
      expect(getIngressLocationUuid(undefined)).toBeUndefined();
    });
  });

  describe("getEgressSequenceItem() / getIngressSequenceItem()", () => {
    it("returns null when the xgress location is the lander", () => {
      const eva = makeEva();
      expect(getEgressSequenceItem(eva)).toBeNull();
      expect(getIngressSequenceItem(eva)).toBeNull();
    });

    it("returns a station item when the xgress location is a station", () => {
      const eva = makeEva({ egressLocationUuid: "s9", ingressLocationUuid: "s8" });
      expect(getEgressSequenceItem(eva)).toEqual({ type: "station", uuid: "s9" });
      expect(getIngressSequenceItem(eva)).toEqual({ type: "station", uuid: "s8" });
    });
  });

  describe("getSequenceStationItems() / getSequenceTraverseItems()", () => {
    it("partitions the sequence by type, preserving order", () => {
      const eva = makeEva();
      expect(getSequenceStationItems(eva).map((i) => i.uuid)).toEqual(["s1", "s2"]);
      expect(getSequenceTraverseItems(eva).map((i) => i.uuid)).toEqual(["t1", "t2", "t3"]);
    });

    it("does not include the xgress stations", () => {
      const eva = makeEva({ egressLocationUuid: "s9" });
      expect(getSequenceStationItems(eva).map((i) => i.uuid)).toEqual(["s1", "s2"]);
    });

    it("returns an empty array for a missing EVA", () => {
      expect(getSequenceStationItems(undefined)).toEqual([]);
      expect(getSequenceTraverseItems(undefined)).toEqual([]);
    });
  });

  describe("getFirstTraverseItem() / getLastTraverseItem()", () => {
    it("returns the boundary traverses", () => {
      const eva = makeEva();
      expect(getFirstTraverseItem(eva)).toEqual({ type: "traverse", uuid: "t1" });
      expect(getLastTraverseItem(eva)).toEqual({ type: "traverse", uuid: "t3" });
    });

    it("returns the same traverse on both ends of a station-less EVA", () => {
      const eva = makeEmptyEva();
      expect(getFirstTraverseItem(eva)).toEqual({ type: "traverse", uuid: "t1" });
      expect(getLastTraverseItem(eva)).toEqual({ type: "traverse", uuid: "t1" });
    });

    it("returns null when there are no traverses", () => {
      expect(getFirstTraverseItem({ sequence: [] })).toBeNull();
      expect(getLastTraverseItem({ sequence: [] })).toBeNull();
    });
  });

  describe("getMovableStationIndexRange()", () => {
    it("spans every station in the sequence", () => {
      expect(getMovableStationIndexRange(makeEva())).toEqual({ first: 1, last: 3 });
    });

    it("is empty for a station-less EVA", () => {
      const { first, last } = getMovableStationIndexRange(makeEmptyEva());
      expect(last).toBeLessThan(first);
    });
  });

  describe("isFirstMovableStationIndex() / isLastMovableStationIndex()", () => {
    it("flags the boundary station indices", () => {
      const eva = makeEva();
      expect(isFirstMovableStationIndex(eva, 1)).toBe(true);
      expect(isFirstMovableStationIndex(eva, 3)).toBe(false);
      expect(isLastMovableStationIndex(eva, 3)).toBe(true);
      expect(isLastMovableStationIndex(eva, 1)).toBe(false);
    });
  });

  describe("isXgressIndex()", () => {
    it("is false for every sequence station under the current shape", () => {
      const eva = makeEva();
      expect(isXgressIndex(eva, 1)).toBe(false);
      expect(isXgressIndex(eva, 3)).toBe(false);
    });

    it("is false for traverse indices", () => {
      const eva = makeEva();
      expect(isXgressIndex(eva, 0)).toBe(false);
      expect(isXgressIndex(eva, 4)).toBe(false);
    });
  });

  describe("canMoveStationUp() / canMoveStationDown()", () => {
    it("blocks moving past either end of the station range", () => {
      const eva = makeEva();
      expect(canMoveStationUp(eva, 1)).toBe(false);
      expect(canMoveStationDown(eva, 1)).toBe(true);
      expect(canMoveStationUp(eva, 3)).toBe(true);
      expect(canMoveStationDown(eva, 3)).toBe(false);
    });

    it("blocks both directions when the EVA has a single station", () => {
      const eva: EvaSequenceSource = {
        sequence: [
          { type: "traverse", uuid: "t1" },
          { type: "station", uuid: "s1" },
          { type: "traverse", uuid: "t2" },
        ],
      };
      expect(canMoveStationUp(eva, 1)).toBe(false);
      expect(canMoveStationDown(eva, 1)).toBe(false);
    });
  });

  describe("getTraverseNeighborUuids()", () => {
    it("resolves interior traverses from their adjacent stations", () => {
      expect(getTraverseNeighborUuids(makeEva(), "t2")).toEqual({
        beforeUuid: "s1",
        afterUuid: "s2",
      });
    });

    it("resolves the first traverse's start from the egress location", () => {
      const eva = makeEva({ egressLocationUuid: "s9" });
      expect(getTraverseNeighborUuids(eva, "t1")).toEqual({
        beforeUuid: "s9",
        afterUuid: "s1",
      });
    });

    it("resolves the last traverse's end from the ingress location", () => {
      const eva = makeEva({ ingressLocationUuid: "s8" });
      expect(getTraverseNeighborUuids(eva, "t3")).toEqual({
        beforeUuid: "s2",
        afterUuid: "s8",
      });
    });

    it("resolves both ends of a station-less EVA from the xgress locations", () => {
      const eva = makeEmptyEva({ egressLocationUuid: "s9", ingressLocationUuid: "s8" });
      expect(getTraverseNeighborUuids(eva, "t1")).toEqual({
        beforeUuid: "s9",
        afterUuid: "s8",
      });
    });

    it("returns the lander sentinel when an xgress location is the lander", () => {
      expect(getTraverseNeighborUuids(makeEmptyEva(), "t1")).toEqual({
        beforeUuid: LANDER_UUID,
        afterUuid: LANDER_UUID,
      });
    });

    it("returns undefined neighbors for a traverse not in the sequence", () => {
      expect(getTraverseNeighborUuids(makeEva(), "nope")).toEqual({
        beforeUuid: undefined,
        afterUuid: undefined,
      });
    });

    it("ignores a station whose uuid collides with the traverse uuid", () => {
      const eva: EvaSequenceSource = {
        sequence: [
          { type: "traverse", uuid: "t1" },
          { type: "station", uuid: "shared" },
          { type: "traverse", uuid: "shared" },
        ],
        egressLocationUuid: LANDER_UUID,
        ingressLocationUuid: LANDER_UUID,
      };
      expect(getTraverseNeighborUuids(eva, "shared")).toEqual({
        beforeUuid: "shared",
        afterUuid: LANDER_UUID,
      });
    });
  });
});
