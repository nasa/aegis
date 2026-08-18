import {
  LANDER_UUID,
  canMoveStationDown,
  canMoveStationUp,
  getEgressLocationUuid,
  getEgressSequenceItem,
  getFirstTraverseItem,
  getIngressIndex,
  getIngressLocationUuid,
  getIngressSequenceItem,
  getLastTraverseItem,
  getMiddleStationItems,
  getMovableStationIndexRange,
  getSequenceStationItems,
  getSequenceTraverseItems,
  getTraverseNeighborUuids,
  isLanderUuid,
  isLanderXgressStation,
  isXgressIndex,
} from "operations/helpers/evaSequence";
import type { EvaSequenceSource } from "operations/helpers/evaSequence";
import { generateBlankStation } from "store/storeUtils/station";

/** `[egress, t1, s1, t2, s2, t3, ingress]` — two middle stations. */
const makeEva = (overrides: Partial<EvaSequenceSource> = {}): EvaSequenceSource => ({
  sequence: [
    { type: "station", uuid: "egress" },
    { type: "traverse", uuid: "t1" },
    { type: "station", uuid: "s1" },
    { type: "traverse", uuid: "t2" },
    { type: "station", uuid: "s2" },
    { type: "traverse", uuid: "t3" },
    { type: "station", uuid: "ingress" },
  ],
  ...overrides,
});

/** `[egress, t1, ingress]` — no middle stations. */
const makeEmptyEva = (overrides: Partial<EvaSequenceSource> = {}): EvaSequenceSource => ({
  sequence: [
    { type: "station", uuid: "egress" },
    { type: "traverse", uuid: "t1" },
    { type: "station", uuid: "ingress" },
  ],
  ...overrides,
});

const landerStation = (uuid: string) =>
  generateBlankStation({ uuid, name: "Lander", isLanderXgress: true });

describe("evaSequence", () => {
  describe("isLanderUuid()", () => {
    it("recognizes the lander sentinel", () => {
      expect(isLanderUuid(LANDER_UUID)).toBe(true);
      expect(isLanderUuid("s1")).toBe(false);
      expect(isLanderUuid(undefined)).toBe(false);
    });
  });

  describe("isLanderXgressStation()", () => {
    it("is true only for a flagged station", () => {
      expect(isLanderXgressStation(landerStation("egress"))).toBe(true);
      expect(isLanderXgressStation(generateBlankStation({ uuid: "s1" }))).toBe(false);
      expect(isLanderXgressStation(undefined)).toBe(false);
    });
  });

  describe("getEgressSequenceItem() / getIngressSequenceItem()", () => {
    it("reads the first and last sequence entries", () => {
      const eva = makeEva();
      expect(getEgressSequenceItem(eva)).toEqual({ type: "station", uuid: "egress" });
      expect(getIngressSequenceItem(eva)).toEqual({ type: "station", uuid: "ingress" });
    });

    it("returns null for an empty sequence", () => {
      expect(getEgressSequenceItem({ sequence: [] })).toBeNull();
      expect(getIngressSequenceItem({ sequence: [] })).toBeNull();
      expect(getEgressSequenceItem(undefined)).toBeNull();
      expect(getIngressSequenceItem(undefined)).toBeNull();
    });

    it("returns null when the boundary is not a station", () => {
      const malformed = { sequence: [{ type: "traverse" as const, uuid: "t1" }] };
      expect(getEgressSequenceItem(malformed)).toBeNull();
      expect(getIngressSequenceItem(malformed)).toBeNull();
    });
  });

  describe("getIngressIndex()", () => {
    it("points at the last sequence entry", () => {
      expect(getIngressIndex(makeEva())).toBe(6);
      expect(getIngressIndex(makeEmptyEva())).toBe(2);
    });

    it("returns -1 when there is no ingress station", () => {
      expect(getIngressIndex({ sequence: [] })).toBe(-1);
      expect(getIngressIndex({ sequence: [{ type: "traverse", uuid: "t1" }] })).toBe(-1);
    });
  });

  describe("getEgressLocationUuid() / getIngressLocationUuid()", () => {
    const stations = {
      egress: landerStation("egress"),
      ingress: generateBlankStation({ uuid: "ingress", name: "Station 2" }),
    };

    it('reports "lander" when the slot holds a lander stand-in', () => {
      expect(getEgressLocationUuid(makeEva(), stations)).toBe(LANDER_UUID);
    });

    it("reports the station uuid when the slot holds a real station", () => {
      expect(getIngressLocationUuid(makeEva(), stations)).toBe("ingress");
    });

    it("returns undefined when there is no xgress station", () => {
      expect(getEgressLocationUuid({ sequence: [] }, stations)).toBeUndefined();
      expect(getIngressLocationUuid(undefined, stations)).toBeUndefined();
    });
  });

  describe("getSequenceStationItems() / getSequenceTraverseItems()", () => {
    it("returns every station and traverse in order", () => {
      const eva = makeEva();
      expect(getSequenceStationItems(eva).map((i) => i.uuid)).toEqual([
        "egress",
        "s1",
        "s2",
        "ingress",
      ]);
      expect(getSequenceTraverseItems(eva).map((i) => i.uuid)).toEqual(["t1", "t2", "t3"]);
    });

    it("handles a missing EVA", () => {
      expect(getSequenceStationItems(undefined)).toEqual([]);
      expect(getSequenceTraverseItems(undefined)).toEqual([]);
    });
  });

  describe("getMiddleStationItems()", () => {
    it("excludes the pinned xgress slots", () => {
      expect(getMiddleStationItems(makeEva()).map((i) => i.uuid)).toEqual(["s1", "s2"]);
    });

    it("is empty when the EVA has no middle stations", () => {
      expect(getMiddleStationItems(makeEmptyEva())).toEqual([]);
    });
  });

  describe("getFirstTraverseItem() / getLastTraverseItem()", () => {
    it("returns the boundary traverses", () => {
      const eva = makeEva();
      expect(getFirstTraverseItem(eva)?.uuid).toBe("t1");
      expect(getLastTraverseItem(eva)?.uuid).toBe("t3");
    });

    it("returns the same traverse when the EVA has only one", () => {
      const eva = makeEmptyEva();
      expect(getFirstTraverseItem(eva)?.uuid).toBe("t1");
      expect(getLastTraverseItem(eva)?.uuid).toBe("t1");
    });

    it("returns null when there are no traverses", () => {
      expect(getFirstTraverseItem({ sequence: [] })).toBeNull();
      expect(getLastTraverseItem({ sequence: [] })).toBeNull();
    });
  });

  describe("getMovableStationIndexRange()", () => {
    it("spans the middle stations only", () => {
      expect(getMovableStationIndexRange(makeEva())).toEqual({ first: 2, last: 4 });
    });

    it("is empty when there are no middle stations", () => {
      const { first, last } = getMovableStationIndexRange(makeEmptyEva());
      expect(first).toBeGreaterThan(last);
    });
  });

  describe("isXgressIndex()", () => {
    it("is true for the egress and ingress slots", () => {
      const eva = makeEva();
      expect(isXgressIndex(eva, 0)).toBe(true);
      expect(isXgressIndex(eva, 6)).toBe(true);
    });

    it("is false for middle stations and for traverses", () => {
      const eva = makeEva();
      expect(isXgressIndex(eva, 2)).toBe(false);
      expect(isXgressIndex(eva, 4)).toBe(false);
      expect(isXgressIndex(eva, 1)).toBe(false);
    });

    it("is true for both slots of an EVA with no middle stations", () => {
      const eva = makeEmptyEva();
      expect(isXgressIndex(eva, 0)).toBe(true);
      expect(isXgressIndex(eva, 2)).toBe(true);
    });
  });

  describe("canMoveStationUp() / canMoveStationDown()", () => {
    it("keeps middle stations inside the movable range", () => {
      const eva = makeEva();
      expect(canMoveStationUp(eva, 2)).toBe(false);
      expect(canMoveStationDown(eva, 2)).toBe(true);
      expect(canMoveStationUp(eva, 4)).toBe(true);
      expect(canMoveStationDown(eva, 4)).toBe(false);
    });

    it("never allows moving a pinned xgress station", () => {
      const eva = makeEva();
      expect(canMoveStationUp(eva, 0)).toBe(false);
      expect(canMoveStationDown(eva, 0)).toBe(false);
      expect(canMoveStationUp(eva, 6)).toBe(false);
      expect(canMoveStationDown(eva, 6)).toBe(false);
    });
  });

  describe("getTraverseNeighborUuids()", () => {
    it("resolves the stations on either side of a traverse", () => {
      const eva = makeEva();
      expect(getTraverseNeighborUuids(eva, "t2")).toEqual({
        beforeUuid: "s1",
        afterUuid: "s2",
      });
    });

    it("resolves the xgress stations for the boundary traverses", () => {
      const eva = makeEva();
      expect(getTraverseNeighborUuids(eva, "t1")).toEqual({
        beforeUuid: "egress",
        afterUuid: "s1",
      });
      expect(getTraverseNeighborUuids(eva, "t3")).toEqual({
        beforeUuid: "s2",
        afterUuid: "ingress",
      });
    });

    it("resolves egress→ingress directly for an EVA with no middle stations", () => {
      expect(getTraverseNeighborUuids(makeEmptyEva(), "t1")).toEqual({
        beforeUuid: "egress",
        afterUuid: "ingress",
      });
    });

    it("returns undefined for a traverse outside the sequence", () => {
      expect(getTraverseNeighborUuids(makeEva(), "nope")).toEqual({
        beforeUuid: undefined,
        afterUuid: undefined,
      });
    });
  });
});
