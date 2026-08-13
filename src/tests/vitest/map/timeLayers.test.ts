import { describe, expect, it } from "vitest";
import { getManifestJsonTimeBounds } from "utils/mapping/timeLayers";

describe("getManifestJsonTimeBounds", () => {
  it("uses midpoint ranges for a legacy manifest without explicit bounds", () => {
    const manifest: TimeLayerJson[] = [
      { datetime: "2030-01-01T00:00:00Z", dirName: "frame-a" },
      { datetime: "2030-01-01T01:00:00Z", dirName: "frame-b" },
    ];

    expect(getManifestJsonTimeBounds(manifest, 0)).toEqual([
      "2030-01-01T00:00:00Z",
      "2030-01-01T00:30:00.000Z",
    ]);
    expect(getManifestJsonTimeBounds(manifest, 1)).toEqual([
      "2030-01-01T00:30:00.000Z",
      "2030-01-01T01:00:00Z",
    ]);
  });

  it("uses declared bounds when a manifest provides them", () => {
    const manifest: TimeLayerJson[] = [
      {
        datetime: "2030-01-01T00:15:00Z",
        dirName: "window-a/frame-a_cog.tif",
        lowerBound: "2030-01-01T00:07:30Z",
        upperBound: "2030-01-01T00:15:00Z",
      },
    ];

    expect(getManifestJsonTimeBounds(manifest, 0)).toEqual([
      "2030-01-01T00:07:30Z",
      "2030-01-01T00:15:00Z",
    ]);
  });
});
