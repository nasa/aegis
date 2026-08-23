const mocks = vi.hoisted(() => ({ sampleRasterProfile: vi.fn() }));
vi.mock("server/raster/sampleRasterProfile", () => ({
  sampleRasterProfile: mocks.sampleRasterProfile,
}));

import { readAbsoluteSlopeProfile } from "server/slope/readAbsoluteSlopeProfile";

describe("readAbsoluteSlopeProfile", () => {
  it("preserves values and converts unavailable raster samples to null", async () => {
    mocks.sampleRasterProfile.mockResolvedValue({
      samples: [
        [
          { status: "value", value: 12.34 },
          { status: "missing", reason: "nodata" },
        ],
      ],
      metadata: {},
      samplesRead: 2,
      blocksRead: 1,
    });

    const result = await readAbsoluteSlopeProfile(
      { absolutePath: "slope.tif" },
      [
        { lat: 1, lng: 2 },
        { lat: 1.1, lng: 2.1 },
      ],
      [2]
    );

    expect(result.absoluteSlopes).toEqual([[12.34, null]]);
  });
});
