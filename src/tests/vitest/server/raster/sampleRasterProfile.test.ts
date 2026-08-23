const sampleRasterPoints = vi.hoisted(() => vi.fn());

vi.mock("server/raster/sampleRasterPoints", () => ({ sampleRasterPoints }));

import { sampleRasterProfile } from "server/raster/sampleRasterProfile";

const descriptor = { absolutePath: "fixture.tif", projection: "+proj=longlat" };
const metadata: RasterMetadata = {
  width: 2,
  height: 2,
  origin: [0, 0],
  resolution: [1, -1],
  blockSize: [2, 2],
  isTiled: false,
  samplesPerPixel: 1,
  noData: null,
  scale: 1,
  offset: 0,
  geoKeys: {},
};

describe("sampleRasterProfile", () => {
  beforeEach(() => sampleRasterPoints.mockReset());

  it("preserves segment boundaries and missing sample reasons", async () => {
    sampleRasterPoints.mockResolvedValue({
      metadata,
      samples: [
        { status: "value", value: 1 },
        { status: "missing", reason: "nodata" },
        { status: "value", value: 2 },
        { status: "missing", reason: "out-of-bounds" },
      ],
      blocksRead: 1,
    });

    const result = await sampleRasterProfile(
      descriptor,
      [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
      [2, 2]
    );

    expect(result.samples).toEqual([
      [
        { status: "value", value: 1 },
        { status: "missing", reason: "nodata" },
      ],
      [
        { status: "value", value: 2 },
        { status: "missing", reason: "out-of-bounds" },
      ],
    ]);
  });

  it("rejects oversized profiles before sampling", async () => {
    await expect(
      sampleRasterProfile(
        descriptor,
        [
          { lat: 0, lng: 0 },
          { lat: 1, lng: 1 },
        ],
        [100_001]
      )
    ).rejects.toThrow("sample limit");
    expect(sampleRasterPoints).not.toHaveBeenCalled();
  });
});
