import { describe, expect, it } from "vitest";

import { normalizeTerrainProfile } from "utils/terrainProfile";

const path = [
  { lat: 1, lng: 2 },
  { lat: 2, lng: 3 },
];

describe("normalizeTerrainProfile", () => {
  it("accepts aligned profiles including unavailable terrain slope samples", () => {
    const profile = {
      elevationsMeters: [[10, 11]],
      terrainSlopesDegrees: [[null, 4.5]],
    };
    expect(normalizeTerrainProfile(profile, path, [100])).toEqual(profile);
  });

  it("rejects profiles whose arrays do not describe the same samples", () => {
    expect(
      normalizeTerrainProfile(
        { elevationsMeters: [[10, 11]], terrainSlopesDegrees: [[2]] },
        path,
        [100]
      )
    ).toBeNull();
    expect(
      normalizeTerrainProfile(
        { elevationsMeters: [[10, 11]], terrainSlopesDegrees: [[2, 3]] },
        [...path, { lat: 3, lng: 4 }],
        [100]
      )
    ).toBeNull();
  });
});
