import {
  canMoveStation,
  getEgressStationUuid,
  getIngressIndex,
  getIngressStationUuid,
  getSequenceStationUuids,
  getSequenceTraverseUuids,
  getTraverseNeighborUuids,
  getXgressTraverseUuid,
  isXgressIndex,
} from "operations/helpers/evaSequence";

/** `[egress, t1, s1, t2, s2, t3, ingress]` — two middle stations. */
const makeEva = (): EvaSequenceItem[] => [
  { type: "station", uuid: "egress" },
  { type: "traverse", uuid: "t1" },
  { type: "station", uuid: "s1" },
  { type: "traverse", uuid: "t2" },
  { type: "station", uuid: "s2" },
  { type: "traverse", uuid: "t3" },
  { type: "station", uuid: "ingress" },
];

/** `[egress, t1, ingress]` — no middle stations. */
const makeEmptyEva = (): EvaSequenceItem[] => [
  { type: "station", uuid: "egress" },
  { type: "traverse", uuid: "t1" },
  { type: "station", uuid: "ingress" },
];

describe("evaSequence", () => {
  describe("getEgressStationUuid() / getIngressStationUuid()", () => {
    it("reads the first and last sequence entries", () => {
      const sequence = makeEva();
      expect(getEgressStationUuid(sequence)).toBe("egress");
      expect(getIngressStationUuid(sequence)).toBe("ingress");
    });

    it("returns undefined for an empty sequence", () => {
      expect(getEgressStationUuid([])).toBeUndefined();
      expect(getIngressStationUuid([])).toBeUndefined();
      expect(getEgressStationUuid(undefined)).toBeUndefined();
      expect(getIngressStationUuid(undefined)).toBeUndefined();
    });

    it("returns undefined when the boundary is not a station", () => {
      const malformed: EvaSequenceItem[] = [{ type: "traverse", uuid: "t1" }];
      expect(getEgressStationUuid(malformed)).toBeUndefined();
      expect(getIngressStationUuid(malformed)).toBeUndefined();
    });
  });

  describe("getIngressIndex()", () => {
    it("points at the last sequence entry", () => {
      expect(getIngressIndex(makeEva())).toBe(6);
      expect(getIngressIndex(makeEmptyEva())).toBe(2);
    });

    it("returns -1 when there is no ingress station", () => {
      expect(getIngressIndex([])).toBe(-1);
      expect(getIngressIndex([{ type: "traverse", uuid: "t1" }])).toBe(-1);
    });
  });

  describe("getSequenceStationUuids() / getSequenceTraverseUuids()", () => {
    it("returns every station and traverse in order", () => {
      const sequence = makeEva();
      expect(getSequenceStationUuids(sequence)).toEqual(["egress", "s1", "s2", "ingress"]);
      expect(getSequenceTraverseUuids(sequence)).toEqual(["t1", "t2", "t3"]);
    });

    it("handles a missing EVA", () => {
      expect(getSequenceStationUuids(undefined)).toEqual([]);
      expect(getSequenceTraverseUuids(undefined)).toEqual([]);
    });
  });

  describe("getXgressTraverseUuid()", () => {
    it("returns the boundary traverses", () => {
      const sequence = makeEva();
      expect(getXgressTraverseUuid(sequence, "egress")).toBe("t1");
      expect(getXgressTraverseUuid(sequence, "ingress")).toBe("t3");
    });

    it("returns the same traverse when the EVA has only one", () => {
      const sequence = makeEmptyEva();
      expect(getXgressTraverseUuid(sequence, "egress")).toBe("t1");
      expect(getXgressTraverseUuid(sequence, "ingress")).toBe("t1");
    });

    it("returns undefined when there are no traverses", () => {
      expect(getXgressTraverseUuid([], "egress")).toBeUndefined();
      expect(getXgressTraverseUuid([], "ingress")).toBeUndefined();
    });
  });

  describe("isXgressIndex()", () => {
    it("is true for the egress and ingress stations", () => {
      const sequence = makeEva();
      expect(isXgressIndex(sequence, 0)).toBe(true);
      expect(isXgressIndex(sequence, 6)).toBe(true);
    });

    it("is false for middle stations and for traverses", () => {
      const sequence = makeEva();
      expect(isXgressIndex(sequence, 2)).toBe(false);
      expect(isXgressIndex(sequence, 4)).toBe(false);
      expect(isXgressIndex(sequence, 1)).toBe(false);
    });

    it("is true for both stations of an EVA with no middle stations", () => {
      const sequence = makeEmptyEva();
      expect(isXgressIndex(sequence, 0)).toBe(true);
      expect(isXgressIndex(sequence, 2)).toBe(true);
    });
  });

  describe("canMoveStation()", () => {
    it("keeps middle stations inside the movable range", () => {
      const sequence = makeEva();
      expect(canMoveStation(sequence, 2, "up")).toBe(false);
      expect(canMoveStation(sequence, 2, "down")).toBe(true);
      expect(canMoveStation(sequence, 4, "up")).toBe(true);
      expect(canMoveStation(sequence, 4, "down")).toBe(false);
    });

    it("never allows moving a pinned xgress station", () => {
      const sequence = makeEva();
      expect(canMoveStation(sequence, 0, "up")).toBe(false);
      expect(canMoveStation(sequence, 0, "down")).toBe(false);
      expect(canMoveStation(sequence, 6, "up")).toBe(false);
      expect(canMoveStation(sequence, 6, "down")).toBe(false);
    });
  });

  describe("getTraverseNeighborUuids()", () => {
    it("resolves the stations on either side of a traverse", () => {
      const sequence = makeEva();
      expect(getTraverseNeighborUuids(sequence, "t2")).toEqual({
        beforeUuid: "s1",
        afterUuid: "s2",
      });
    });

    it("resolves the xgress stations for the boundary traverses", () => {
      const sequence = makeEva();
      expect(getTraverseNeighborUuids(sequence, "t1")).toEqual({
        beforeUuid: "egress",
        afterUuid: "s1",
      });
      expect(getTraverseNeighborUuids(sequence, "t3")).toEqual({
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
