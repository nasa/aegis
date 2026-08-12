import { LANDER_UUID } from "operations/helpers/evaSequence";
import type { EvaSequenceSource } from "operations/helpers/evaSequence";
import { getTraverseEndpoints } from "operations/helpers/getTraverseEndpoints";

const landerLocation = { lat: 0, lng: 0 } as unknown as AEGISPoint;
const locA = { lat: 1, lng: 1 } as unknown as AEGISPoint;
const locB = { lat: 2, lng: 2 } as unknown as AEGISPoint;
const locC = { lat: 3, lng: 3 } as unknown as AEGISPoint;

const stations = {
  s1: { uuid: "s1", name: "Station One", location: locA },
  s2: { uuid: "s2", name: "Station Two", location: locB },
  s9: { uuid: "s9", name: "Station Nine", location: locC },
} as unknown as { [uuid: string]: Station };

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

describe("getTraverseEndpoints", () => {
  it("resolves an interior traverse from its adjacent stations", () => {
    expect(getTraverseEndpoints("t2", makeEva(), stations, landerLocation)).toEqual({
      locationBefore: locA,
      locationAfter: locB,
      nameBefore: "Station One",
      nameAfter: "Station Two",
    });
  });

  it("resolves the first traverse's start from the lander", () => {
    const result = getTraverseEndpoints("t1", makeEva(), stations, landerLocation);
    expect(result.locationBefore).toEqual(landerLocation);
    expect(result.nameBefore).toBe("Lander");
    expect(result.locationAfter).toEqual(locA);
    expect(result.nameAfter).toBe("Station One");
  });

  it("resolves the last traverse's end from the lander", () => {
    const result = getTraverseEndpoints("t3", makeEva(), stations, landerLocation);
    expect(result.locationBefore).toEqual(locB);
    expect(result.nameBefore).toBe("Station Two");
    expect(result.locationAfter).toEqual(landerLocation);
    expect(result.nameAfter).toBe("Lander");
  });

  it("resolves a station egress location", () => {
    const eva = makeEva({ egressLocationUuid: "s9" });
    const result = getTraverseEndpoints("t1", eva, stations, landerLocation);
    expect(result.locationBefore).toEqual(locC);
    expect(result.nameBefore).toBe("Station Nine");
  });

  it("resolves a station ingress location", () => {
    const eva = makeEva({ ingressLocationUuid: "s9" });
    const result = getTraverseEndpoints("t3", eva, stations, landerLocation);
    expect(result.locationAfter).toEqual(locC);
    expect(result.nameAfter).toBe("Station Nine");
  });

  it("resolves both ends of a station-less EVA from the xgress locations", () => {
    const eva: EvaSequenceSource = {
      sequence: [{ type: "traverse", uuid: "t1" }],
      egressLocationUuid: "s1",
      ingressLocationUuid: "s2",
    };
    expect(getTraverseEndpoints("t1", eva, stations, landerLocation)).toEqual({
      locationBefore: locA,
      locationAfter: locB,
      nameBefore: "Station One",
      nameAfter: "Station Two",
    });
  });

  it("applies stationOverride to a matching neighbor", () => {
    const result = getTraverseEndpoints("t2", makeEva(), stations, landerLocation, {
      uuid: "s1",
      location: locC,
      name: "Pending Name",
    });
    expect(result.locationBefore).toEqual(locC);
    expect(result.nameBefore).toBe("Pending Name");
    // The non-matching neighbor is untouched
    expect(result.locationAfter).toEqual(locB);
    expect(result.nameAfter).toBe("Station Two");
  });

  it("does not apply stationOverride to the lander", () => {
    const result = getTraverseEndpoints("t1", makeEva(), stations, landerLocation, {
      uuid: LANDER_UUID,
      location: locC,
      name: "Pending Name",
    });
    expect(result.locationBefore).toEqual(landerLocation);
    expect(result.nameBefore).toBe("Lander");
  });

  it("returns an empty result for a traverse not in the sequence", () => {
    expect(getTraverseEndpoints("nope", makeEva(), stations, landerLocation)).toEqual({
      locationBefore: undefined,
      locationAfter: undefined,
      nameBefore: "",
      nameAfter: "",
    });
  });

  it("returns an empty result for a missing EVA", () => {
    expect(getTraverseEndpoints("t1", undefined, stations, landerLocation)).toEqual({
      locationBefore: undefined,
      locationAfter: undefined,
      nameBefore: "",
      nameAfter: "",
    });
  });

  it("returns an undefined location and empty name for an unknown station uuid", () => {
    const eva = makeEva({ egressLocationUuid: "missing" });
    const result = getTraverseEndpoints("t1", eva, stations, landerLocation);
    expect(result.locationBefore).toBeUndefined();
    expect(result.nameBefore).toBe("");
  });
});
