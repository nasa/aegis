import { getTraverseEndpoints } from "operations/helpers/getTraverseEndpoints";
import type { EvaSequenceSource } from "operations/helpers/evaSequence";
import { generateBlankStation } from "store/storeUtils/station";

const LANDER_LOCATION: AEGISPoint = { lat: 0, lng: 0 };
const S1_LOCATION: AEGISPoint = { lat: 1, lng: 1 };
const S2_LOCATION: AEGISPoint = { lat: 2, lng: 2 };
const EGRESS_LOCATION: AEGISPoint = { lat: 3, lng: 3 };

const stations: { [uuid: string]: Station } = {
  // Lander xgress stations are repositioned in the same change that moves the
  // lander, so their stored location always matches it.
  egress: generateBlankStation({
    uuid: "egress",
    name: "Lander",
    isLanderXgress: true,
    location: LANDER_LOCATION,
  }),
  ingress: generateBlankStation({
    uuid: "ingress",
    name: "Lander",
    isLanderXgress: true,
    location: LANDER_LOCATION,
  }),
  s1: generateBlankStation({ uuid: "s1", name: "Station 1", location: S1_LOCATION }),
  s2: generateBlankStation({ uuid: "s2", name: "Station 2", location: S2_LOCATION }),
  realEgress: generateBlankStation({
    uuid: "realEgress",
    name: "Real Egress",
    location: EGRESS_LOCATION,
  }),
};

/** `[egress, t1, s1, t2, s2, t3, ingress]` */
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

describe("getTraverseEndpoints", () => {
  it("resolves a mid-sequence traverse between its two stations", () => {
    const result = getTraverseEndpoints("t2", makeEva(), stations, LANDER_LOCATION);
    expect(result).toEqual({
      locationBefore: S1_LOCATION,
      locationAfter: S2_LOCATION,
      nameBefore: "Station 1",
      nameAfter: "Station 2",
    });
  });

  it("resolves a lander station to the lander location", () => {
    const result = getTraverseEndpoints("t1", makeEva(), stations, LANDER_LOCATION);
    expect(result.locationBefore).toEqual(LANDER_LOCATION);
    expect(result.nameBefore).toBe("Lander");
    expect(result.locationAfter).toEqual(S1_LOCATION);
    expect(result.nameAfter).toBe("Station 1");
  });

  it("resolves the final traverse into the ingress position", () => {
    const result = getTraverseEndpoints("t3", makeEva(), stations, LANDER_LOCATION);
    expect(result.locationBefore).toEqual(S2_LOCATION);
    expect(result.locationAfter).toEqual(LANDER_LOCATION);
    expect(result.nameAfter).toBe("Lander");
  });

  it("resolves a real station occupying the egress position", () => {
    const eva = makeEva({
      sequence: [
        { type: "station", uuid: "realEgress" },
        { type: "traverse", uuid: "t1" },
        { type: "station", uuid: "ingress" },
      ],
    });
    const result = getTraverseEndpoints("t1", eva, stations, LANDER_LOCATION);
    expect(result.locationBefore).toEqual(EGRESS_LOCATION);
    expect(result.nameBefore).toBe("Real Egress");
    expect(result.locationAfter).toEqual(LANDER_LOCATION);
  });

  it("applies a station override for a pending edit", () => {
    const pending: AEGISPoint = { lat: 7, lng: 7 };
    const result = getTraverseEndpoints("t2", makeEva(), stations, LANDER_LOCATION, {
      uuid: "s1",
      location: pending,
      name: "Renamed",
    });
    expect(result.locationBefore).toEqual(pending);
    expect(result.nameBefore).toBe("Renamed");
  });

  it("returns empty endpoints for a traverse outside the sequence", () => {
    const result = getTraverseEndpoints("nope", makeEva(), stations, LANDER_LOCATION);
    expect(result).toEqual({
      locationBefore: undefined,
      locationAfter: undefined,
      nameBefore: "",
      nameAfter: "",
    });
  });

  it("resolves egress→ingress directly when there are no middle stations", () => {
    const eva = makeEva({
      sequence: [
        { type: "station", uuid: "egress" },
        { type: "traverse", uuid: "t1" },
        { type: "station", uuid: "ingress" },
      ],
    });
    const result = getTraverseEndpoints("t1", eva, stations, LANDER_LOCATION);
    expect(result.locationBefore).toEqual(LANDER_LOCATION);
    expect(result.locationAfter).toEqual(LANDER_LOCATION);
  });
});
